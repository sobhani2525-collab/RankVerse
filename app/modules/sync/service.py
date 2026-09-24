import asyncio
import logging
import uuid
from typing import Callable

from slugify import slugify
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.exceptions import NotFoundError
from app.modules.entities.repository import EntityRepository
from app.modules.ranking.service import RankingService
from app.modules.sync.itunes_client import ITunesClient
from app.modules.sync.normalizer import normalize_movie, normalize_track, normalize_tv_series, person_attributes
from app.modules.sync.tmdb_client import TMDbClient

logger = logging.getLogger(__name__)


# Attributes that aren't from TMDb's /movie or /tv response, so a re-sync
# (which rebuilds attributes from that response) must carry them over.
IMDB_ATTRIBUTE_KEYS = ("imdb_rating", "imdb_votes")


def _merge_preserved_attributes(old: dict, new: dict) -> dict:
    """
    - A machine translation (overview_source == "machine", written by
      scripts/translate_overviews.py) is kept as long as TMDb still has no
      Persian overview and the English source text it was translated from
      hasn't changed; otherwise the fresh TMDb value wins and the title
      gets picked up by the next translation run.
    - IMDb rating/votes (written by scripts/sync_imdb_ratings.py) are kept
      while the imdb_id is unchanged.
    """
    merged = dict(new)
    if (
        old.get("overview_source") == "machine"
        and new.get("overview_source") != "tmdb_fa"
        and old.get("overview_en") == new.get("overview_en")
    ):
        merged["overview"] = old.get("overview")
        merged["overview_source"] = "machine"
    if old.get("imdb_id") and old.get("imdb_id") == new.get("imdb_id"):
        for key in IMDB_ATTRIBUTE_KEYS:
            if key in old:
                merged[key] = old[key]
    return merged


class SyncService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = EntityRepository(db)
        self.client = TMDbClient()
        self.itunes_client = ITunesClient()

    async def _get_or_create_person(
        self, external_id: str, name: str, source: str = "tmdb_person", profile_path: str | None = None
    ):
        attributes = person_attributes(profile_path)
        person = await self.repo.get_by_external_id(source, external_id)
        if not person:
            from slugify import slugify
            person = await self.repo.create_entity(
                entity_type="person",
                external_id=external_id,
                external_source=source,
                title=name,
                slug=f"{slugify(name)}-{external_id}",
                attributes=attributes,
            )
        elif attributes and "media" not in (person.attributes or {}):
            # Created before photos were recorded -- fill it in (same rule
            # as _people_ids' fill_missing_key="media").
            person.attributes = {**(person.attributes or {}), **attributes}
            await self.db.flush()
        return person

    async def _get_or_create_genre(self, name: str, external_id: str | None = None, source: str = "tmdb_genre"):
        """
        Looked up by slug rather than (source, external_id): genres are a shared
        vocabulary across sources (a movie and a song can both be "Drama"), and
        some sources (iTunes) don't give a stable genre id at all. external_id/source
        are recorded on creation for provenance but never gate the lookup.
        """
        from slugify import slugify
        slug = slugify(name)
        genre = await self.repo.get_by_slug(slug, entity_type="genre")
        if not genre:
            genre = await self.repo.create_entity(
                entity_type="genre",
                external_id=external_id,
                external_source=source,
                title=name,
                slug=slug,
                attributes={},
            )
        return genre

    async def _get_or_create_album(self, external_id: str, name: str, source: str = "itunes_album"):
        album = await self.repo.get_by_external_id(source, external_id)
        if not album:
            from slugify import slugify
            album = await self.repo.create_entity(
                entity_type="album",
                external_id=external_id,
                external_source=source,
                title=name,
                slug=f"{slugify(name)}-{external_id}",
                attributes={},
            )
        return album

    async def _get_or_create_network(self, external_id: str, name: str, source: str = "tmdb_network"):
        network = await self.repo.get_by_external_id(source, external_id)
        if not network:
            from slugify import slugify
            network = await self.repo.create_entity(
                entity_type="production_company",
                external_id=external_id,
                external_source=source,
                title=name,
                slug=f"{slugify(name)}-{external_id}",
                attributes={},
            )
        return network

    async def sync_track(self, itunes_id: int) -> dict:
        raw = await self.itunes_client.lookup_track(itunes_id)
        if raw is None:
            raise NotFoundError(f"iTunes track '{itunes_id}' not found")
        normalized = normalize_track(raw)

        track = await self.repo.get_by_external_id("itunes_track", normalized["external_id"])
        if track:
            track.title = normalized["title"]
            track.attributes = normalized["attributes"]
        else:
            existing_by_slug = await self.repo.get_by_slug(normalized["slug"])
            if existing_by_slug:
                track = existing_by_slug
                track.external_id = normalized["external_id"]
                track.external_source = "itunes_track"
                track.title = normalized["title"]
                track.attributes = normalized["attributes"]
            else:
                track = await self.repo.create_entity(
                    entity_type="track",
                    external_id=normalized["external_id"],
                    external_source="itunes_track",
                    title=normalized["title"],
                    slug=normalized["slug"],
                    attributes=normalized["attributes"],
                )

        artist = None
        if normalized["artist"]:
            artist = await self._get_or_create_person(
                normalized["artist"]["external_id"], normalized["artist"]["name"], source="itunes_artist"
            )
            await self.repo.create_relationship(track.id, artist.id, "performed_by")

        if normalized["album"]:
            album = await self._get_or_create_album(normalized["album"]["external_id"], normalized["album"]["name"])
            await self.repo.create_relationship(track.id, album.id, "part_of")
            if artist:
                await self.repo.create_relationship(album.id, artist.id, "performed_by")

        if normalized["genre"]:
            genre = await self._get_or_create_genre(normalized["genre"], source="itunes_genre")
            await self.repo.create_relationship(track.id, genre.id, "has_genre")

        await self.db.commit()
        return {"id": str(track.id), "slug": track.slug, "title": track.title}

    async def _upsert_tmdb_entity(self, entity_type: str, normalized: dict):
        """
        Find-or-create the movie/tv_series entity for a normalized TMDb
        payload, then refresh its title/attributes (see
        _merge_preserved_attributes for what a re-sync keeps).

        An existing entity found by slug is adopted only when it's the same
        entity_type and isn't already linked to a different TMDb id -- two
        distinct films can share "title-year" (and a movie and a series can
        share a slug), and adopting blindly would re-point one entity at the
        other's TMDb id. Such a collision gets the tmdb id appended instead.
        """
        entity = await self.repo.get_by_external_id("tmdb", normalized["external_id"], entity_type)
        if entity is None:
            slug = normalized["slug"]
            existing_by_slug = await self.repo.get_by_slug(slug)
            if existing_by_slug and existing_by_slug.entity_type == entity_type and (
                existing_by_slug.external_source != "tmdb" or not existing_by_slug.external_id
            ):
                entity = existing_by_slug
                entity.external_id = normalized["external_id"]
                entity.external_source = "tmdb"
            else:
                if existing_by_slug:
                    slug = f"{slug}-{normalized['external_id']}"
                return await self.repo.create_entity(
                    entity_type=entity_type,
                    external_id=normalized["external_id"],
                    external_source="tmdb",
                    title=normalized["title"],
                    slug=slug,
                    attributes=normalized["attributes"],
                )

        entity.title = normalized["title"]
        entity.attributes = _merge_preserved_attributes(entity.attributes or {}, normalized["attributes"])
        return entity

    async def _fetch_with_persian(self, fetch, tmdb_id: int, label: str) -> tuple[dict, dict | None]:
        """
        The default-language and fa-IR responses for one title, requested
        concurrently. A failed fa-IR request only costs the Persian
        synopsis/title (the normalizers handle raw_fa=None), so it's logged
        rather than failing the whole sync; a failed default-language
        request still raises.
        """
        raw, raw_fa = await asyncio.gather(
            fetch(tmdb_id), fetch(tmdb_id, language="fa-IR"), return_exceptions=True
        )
        if isinstance(raw, BaseException):
            raise raw
        if isinstance(raw_fa, BaseException):
            logger.warning("TMDb fa-IR fetch failed for %s %s; using English overview", label, tmdb_id)
            raw_fa = None
        return raw, raw_fa

    async def _people_ids(self, people: list[dict]) -> dict[str, uuid.UUID]:
        """{tmdb person id: entity id}, creating missing people (batched
        equivalent of _get_or_create_person)."""
        return await self.repo.get_or_create_many(
            "person",
            [
                {
                    "external_id": p["external_id"],
                    "external_source": "tmdb_person",
                    "title": p["name"],
                    "slug": f"{slugify(p['name'])}-{p['external_id']}",
                    "attributes": person_attributes(p.get("profile_path")),
                }
                for p in people
            ],
            external_source="tmdb_person",
            # Existing people without a photo get it from this credit.
            fill_missing_key="media",
        )

    async def _genre_ids(self, genres: list[dict]) -> dict[str, uuid.UUID]:
        """{genre slug: entity id}, creating missing genres (batched
        equivalent of _get_or_create_genre -- same slug-first lookup)."""
        return await self.repo.get_or_create_many(
            "genre",
            [
                {"external_id": g["external_id"], "external_source": "tmdb_genre", "title": g["name"], "slug": slugify(g["name"])}
                for g in genres
            ],
            key="slug",
        )

    async def sync_movie(self, tmdb_id: int, accept: Callable[[dict], bool] | None = None) -> dict | None:
        """
        accept, when given, is called with the normalized payload before
        anything is written; returning False skips the title (returns None)
        -- e.g. the catalog import's IMDb-rating floor.
        """
        raw, raw_fa = await self._fetch_with_persian(self.client.get_movie, tmdb_id, "movie")
        normalized = normalize_movie(raw, raw_fa)
        if accept is not None and not accept(normalized):
            return None

        movie = await self._upsert_tmdb_entity("movie", normalized)

        # Batched lookups/inserts rather than one round trip per person/
        # genre/edge: the catalog import runs this tens of thousands of
        # times against a remote database, where round trips dominate.
        people = await self._people_ids(normalized["directors"] + normalized["cast"])
        genres = await self._genre_ids(normalized["genres"])
        edges = [(people[d["external_id"]], "directed_by", None) for d in normalized["directors"]]
        edges += [
            (people[c["external_id"]], "acted_in", {"character": c["character"], "order": c["order"]})
            for c in normalized["cast"]
        ]
        edges += [(genres[slugify(g["name"])], "has_genre", None) for g in normalized["genres"]]
        await self.repo.create_relationships_bulk(movie.id, edges)

        ranking_service = RankingService(self.db)
        await ranking_service.recompute_entity(movie)

        await self.db.commit()
        return {"id": str(movie.id), "slug": movie.slug, "title": movie.title}

    async def sync_tv_series(self, tmdb_id: int, accept: Callable[[dict], bool] | None = None) -> dict | None:
        """
        Mirrors sync_movie, with three differences: creators (from
        created_by) get their own "creator" edge alongside directed_by/
        acted_in, directors come from aggregate_credits with an episode-share
        threshold (see _sync_tv_credits), and networks get an "aired_on" edge via
        _get_or_create_network. _get_or_create_person/_get_or_create_genre
        are reused unchanged -- a person or genre shared between a movie
        and a TV series (same TMDb id, or same genre slug) resolves to the
        same entity automatically, no TV-specific lookup needed.

        No RankingService call here (unlike sync_movie) -- ranking/rating
        integration for tv_series is a separate, later task; this is
        ingestion only.
        """
        raw, raw_fa = await self._fetch_with_persian(self.client.get_tv_series, tmdb_id, "tv series")
        normalized = normalize_tv_series(
            raw, raw_fa, director_min_episode_ratio=settings.tv_director_min_episode_ratio
        )
        if accept is not None and not accept(normalized):
            return None  # see sync_movie

        series = await self._upsert_tmdb_entity("tv_series", normalized)

        await self._sync_tv_credits(series, normalized)

        people = await self._people_ids(normalized["cast"])
        await self.repo.create_relationships_bulk(
            series.id,
            [
                (people[c["external_id"]], "acted_in", {"character": c["character"], "order": c["order"]})
                for c in normalized["cast"]
            ],
        )

        # replace_relationships (not create_relationship) here: TV_GENRE_NAME_OVERRIDES
        # can change which genre entities a given TMDb genre maps to (e.g. a fused
        # genre getting split up), and create_relationship alone never retracts an
        # edge made by an earlier sync run under an old mapping -- it would just
        # accumulate stale has_genre edges forever across re-syncs.
        genre_ids = []
        for g in normalized["genres"]:
            genre = await self._get_or_create_genre(g["name"], g["external_id"])
            genre_ids.append(genre.id)
        await self.repo.replace_relationships(series.id, "has_genre", genre_ids)

        for n in normalized["networks"]:
            network = await self._get_or_create_network(n["external_id"], n["name"])
            await self.repo.create_relationship(series.id, network.id, "aired_on")

        await self.db.commit()
        return {"id": str(series.id), "slug": series.slug, "title": series.title}

    async def _sync_tv_credits(self, series, normalized: dict) -> list[dict]:
        """
        creator + directed_by edges for a tv_series. directed_by goes through
        replace_relationships so a re-sync also retracts directors that no
        longer clear TV_DIRECTOR_MIN_EPISODE_RATIO (e.g. ones picked up by
        the old credits-only logic), and refreshes each edge's episode_count.
        Returns the directors kept.
        """
        for cr in normalized["creators"]:
            person = await self._get_or_create_person(cr["external_id"], cr["name"], profile_path=cr.get("profile_path"))
            await self.repo.create_relationship(series.id, person.id, "creator")

        director_ids = []
        metadata_by_id = {}
        for d in normalized["directors"]:
            person = await self._get_or_create_person(d["external_id"], d["name"], profile_path=d.get("profile_path"))
            director_ids.append(person.id)
            metadata_by_id[person.id] = (
                {"episode_count": d["episode_count"]} if d["episode_count"] is not None else {}
            )
        await self.repo.replace_relationships(
            series.id, "directed_by", director_ids, edge_metadata_by_target=metadata_by_id
        )
        return normalized["directors"]

    async def resync_tv_series_credits(self, series) -> list[dict]:
        """
        Re-derive only creator/directed_by edges for an existing tv_series
        from TMDb -- one request, no fa-IR fetch, entity attributes left
        untouched. Commits on success; the caller handles rollback.
        """
        raw = await self.client.get_tv_series(int(series.external_id))
        normalized = normalize_tv_series(
            raw, director_min_episode_ratio=settings.tv_director_min_episode_ratio
        )
        directors = await self._sync_tv_credits(series, normalized)
        await self.db.commit()
        return directors

    async def bulk_sync_popular(self, pages: int = 5) -> int:
        synced = 0
        for page in range(1, pages + 1):
            discover = await self.client.discover_movies(page=page)
            for movie in discover.get("results", []):
                try:
                    await self.sync_movie(movie["id"])
                    synced += 1
                except Exception:
                    logger.exception(
                        "skipping movie %s (%s) due to sync error",
                        movie["id"], movie.get("title"),
                    )
                    await self.db.rollback()
        return synced

    async def bulk_sync_iranian(self, pages: int = 5) -> int:
        """
        Discovers Iranian movies/TV series two ways -- origin_country=IR and,
        separately, original_language=fa -- because TMDb's /discover endpoints
        AND all filters together rather than OR-ing them: a single request
        with both params would only match titles that are simultaneously
        IR-produced AND Farsi-language, missing e.g. Farsi-language titles
        produced abroad or IR co-productions in another language. Running the
        two filters separately and deduping by tmdb id below covers both.
        """
        seen_movie_ids: set[int] = set()
        seen_tv_ids: set[int] = set()
        synced = 0

        for page in range(1, pages + 1):
            for movie in (await self.client.discover_movies(page=page, with_origin_country="IR")).get("results", []):
                seen_movie_ids.add(movie["id"])
            for movie in (await self.client.discover_movies(page=page, with_original_language="fa")).get("results", []):
                seen_movie_ids.add(movie["id"])

        for tmdb_id in seen_movie_ids:
            try:
                await self.sync_movie(tmdb_id)
                synced += 1
            except Exception:
                logger.exception("skipping Iranian movie %s due to sync error", tmdb_id)
                await self.db.rollback()

        for page in range(1, pages + 1):
            for series in (await self.client.discover_tv(page=page, with_origin_country="IR")).get("results", []):
                seen_tv_ids.add(series["id"])
            for series in (await self.client.discover_tv(page=page, with_original_language="fa")).get("results", []):
                seen_tv_ids.add(series["id"])

        for tmdb_id in seen_tv_ids:
            try:
                await self.sync_tv_series(tmdb_id)
                synced += 1
            except Exception:
                logger.exception("skipping Iranian tv series %s due to sync error", tmdb_id)
                await self.db.rollback()

        return synced
