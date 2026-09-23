from slugify import slugify


def _persian_title(title_fa: str | None, title_en: str | None) -> str | None:
    """
    Unlike overview (which TMDb returns as an empty string when there's no
    fa-IR translation), TMDb's "title"/"name" field is never empty -- when
    there's no Persian translation it just falls back to returning the same
    value as the default-language request. So "no real translation" shows
    up as title_fa == title_en, not as title_fa being falsy, and that's the
    case this treats as "no Persian title" (returns None) rather than
    storing a duplicate of the English title under a different key.
    """
    if not title_fa or not title_en:
        return None
    if title_fa.strip() == title_en.strip():
        return None
    return title_fa


def _overview_attrs(raw: dict, raw_fa: dict | None) -> dict:
    """
    overview is what the site displays: TMDb's fa-IR synopsis when it has
    one, else the English one until scripts/translate_overviews.py replaces
    it with a machine translation. overview_en keeps the English source
    text (the translation input, and how SyncService tells whether a stored
    translation is still current) and overview_source records where
    overview came from: "tmdb_fa", "en", or -- set only by the translation
    step -- "machine".
    """
    overview_en = raw.get("overview") or None
    overview_fa = (raw_fa or {}).get("overview") or None
    return {
        "overview": overview_fa or overview_en,
        "overview_en": overview_en,
        "overview_source": "tmdb_fa" if overview_fa else ("en" if overview_en else None),
    }


def normalize_movie(raw: dict, raw_fa: dict | None = None) -> dict:
    """
    Convert a raw TMDb /movie/{id} response (with credits appended) into the
    internal shape expected by SyncService: entity attributes + related people/genres.

    raw_fa is an optional second /movie/{id} response fetched with
    language=fa-IR (see SyncService.sync_movie) -- used only for its
    "overview" field, so the site can show a Persian synopsis. TMDb returns
    an empty string (not the English text) when a title has no Persian
    translation, so this falls back to raw's English overview whenever
    raw_fa is missing or its overview is empty.
    """
    year = None
    if raw.get("release_date"):
        try:
            year = int(raw["release_date"][:4])
        except (ValueError, TypeError):
            year = None

    poster_path = raw.get("poster_path")
    title_fa = _persian_title((raw_fa or {}).get("title"), raw.get("title"))

    entity_attrs = {
        "poster_path": poster_path,
        "title_fa": title_fa,
        **_overview_attrs(raw, raw_fa),
        "imdb_id": raw.get("imdb_id") or None,
        "original_language": raw.get("original_language"),
        "runtime": raw.get("runtime"),
        "year": year,
        "country": (raw.get("production_countries") or [{}])[0].get("iso_3166_1"),
        # TMDb vote_average is already 0-10, matches our internal scale
        "external_rating": raw.get("vote_average"),
        "external_vote_count": raw.get("vote_count"),
        # Standard media shape shared across entity types (see entities/schemas.py MediaInfo).
        "media": {
            "image_url": f"https://image.tmdb.org/t/p/w500{poster_path}" if poster_path else None,
            "audio_preview_url": None,
            "video_url": None,
        },
    }

    credits = raw.get("credits", {})
    crew = credits.get("crew", [])
    cast = credits.get("cast", [])

    directors = [
        {"external_id": str(c["id"]), "name": c["name"]}
        for c in crew
        if c.get("job") == "Director"
    ]
    top_cast = [
        {"external_id": str(c["id"]), "name": c["name"], "character": c.get("character"), "order": c.get("order", 99)}
        for c in cast[:5]
    ]
    genres = [{"external_id": str(g["id"]), "name": g["name"]} for g in raw.get("genres", [])]

    return {
        "external_id": str(raw["id"]),
        "external_source": "tmdb",
        "title": raw.get("title"),
        "slug": f"{slugify(raw.get('title', ''))}-{year}" if year else slugify(raw.get("title", "")),
        "attributes": entity_attrs,
        "directors": directors,
        "cast": top_cast,
        "genres": genres,
    }


# TMDb's TV genre list has some labels that are really a fusion of two
# separate movie-side genres (e.g. "Action & Adventure" is TV's single
# label for what movies split into "Action" and "Adventure"). Each TV
# genre name maps to a LIST of movie-side names, one has_genre edge gets
# created per name, and _get_or_create_genre's existing slug-first lookup
# (see SyncService) finds each existing genre entity instead of creating
# a duplicate -- so one TMDb TV genre can fan out to multiple genre
# entities in our graph.
#
# Every TMDb TV genre (per /genre/tv/list) is covered below or, if absent,
# is a TV-only concept (Kids, News, Reality, Soap, Talk) with no movie-side
# equivalent, so it's deliberately left out and gets its own entity via
# plain slugify() -- same as before.
#   - "War & Politics" has no movie-side "Politics" genre in this project's
#     taxonomy (TMDb's own movie genre list doesn't have one either), and
#     nothing else in the graph would use a standalone "Politics" genre
#     entity, so it maps to ["War"] only rather than inventing one.
TV_GENRE_NAME_OVERRIDES: dict[str, list[str]] = {
    "Action & Adventure": ["Action", "Adventure"],
    "Sci-Fi & Fantasy": ["Science Fiction", "Fantasy"],
    "War & Politics": ["War"],
}


def select_tv_directors(raw: dict, min_episode_ratio: float) -> list[dict]:
    """
    Pick a series' directed_by people from a /tv/{id} response with
    aggregate_credits appended. TMDb credits TV directing per episode, so
    a crew member counts as a director only via a jobs[] entry with
    job == "Director", and only that job's episode_count is used (not
    total_episode_count, which also counts e.g. their writing credits).

    Keeps everyone whose Director episode_count / number_of_episodes is
    >= min_episode_ratio; if nobody reaches it, keeps the single director
    with the most episodes so the series still gets one.

    Falls back to plain credits' series-level "Director" entries (the old
    behavior, which is how many Iranian shows are credited) when the
    response has no aggregate_credits Director at all.
    """
    counts: dict[str, dict] = {}
    for c in (raw.get("aggregate_credits") or {}).get("crew", []):
        episodes = sum(j.get("episode_count") or 0 for j in c.get("jobs", []) if j.get("job") == "Director")
        if episodes > 0:
            counts[str(c["id"])] = {"external_id": str(c["id"]), "name": c["name"], "episode_count": episodes}

    if not counts:
        seen: dict[str, dict] = {}
        for c in (raw.get("credits") or {}).get("crew", []):
            if c.get("job") == "Director":
                seen.setdefault(str(c["id"]), {"external_id": str(c["id"]), "name": c["name"], "episode_count": None})
        return list(seen.values())

    ranked = sorted(counts.values(), key=lambda d: (-d["episode_count"], d["name"]))
    total = raw.get("number_of_episodes") or 0
    if total > 0:
        kept = [d for d in ranked if d["episode_count"] / total >= min_episode_ratio]
        if kept:
            return kept
    return ranked[:1]


def normalize_tv_series(
    raw: dict, raw_fa: dict | None = None, director_min_episode_ratio: float = 0.2
) -> dict:
    """
    Convert a raw TMDb /tv/{id} response (with credits and aggregate_credits
    appended) into the internal shape expected by SyncService.sync_tv_series
    -- see select_tv_directors for how directors are picked. Mirrors
    normalize_movie's shape -- same entity attribute conventions (poster/
    media/external_rating/etc), reading the TV-specific fields TMDb uses
    instead (name/first_air_date instead of title/release_date, no runtime,
    plus season/episode/status metadata and created_by/networks which movies
    don't have).

    raw_fa mirrors normalize_movie's raw_fa: an optional /tv/{id} response
    fetched with language=fa-IR, used only for its "overview" field, with
    the same empty-string-means-no-translation fallback to raw's English
    overview.
    """
    year = None
    if raw.get("first_air_date"):
        try:
            year = int(raw["first_air_date"][:4])
        except (ValueError, TypeError):
            year = None

    poster_path = raw.get("poster_path")
    title_fa = _persian_title((raw_fa or {}).get("name"), raw.get("name"))

    entity_attrs = {
        "poster_path": poster_path,
        "title_fa": title_fa,
        **_overview_attrs(raw, raw_fa),
        "imdb_id": (raw.get("external_ids") or {}).get("imdb_id") or None,
        "original_language": raw.get("original_language"),
        "year": year,
        "country": (raw.get("origin_country") or [None])[0],
        # TMDb vote_average is already 0-10, matches our internal scale
        "external_rating": raw.get("vote_average"),
        "external_vote_count": raw.get("vote_count"),
        "number_of_seasons": raw.get("number_of_seasons"),
        "number_of_episodes": raw.get("number_of_episodes"),
        "status": raw.get("status"),
        "first_air_date": raw.get("first_air_date"),
        "last_air_date": raw.get("last_air_date"),
        # Standard media shape shared across entity types (see entities/schemas.py MediaInfo).
        "media": {
            "image_url": f"https://image.tmdb.org/t/p/w500{poster_path}" if poster_path else None,
            "audio_preview_url": None,
            "video_url": None,
        },
    }

    credits = raw.get("credits", {})
    cast = credits.get("cast", [])

    directors = select_tv_directors(raw, director_min_episode_ratio)
    top_cast = [
        {"external_id": str(c["id"]), "name": c["name"], "character": c.get("character"), "order": c.get("order", 99)}
        for c in cast[:5]
    ]
    # created_by is a top-level field on /tv/{id}, not part of credits.
    creators = [{"external_id": str(c["id"]), "name": c["name"]} for c in raw.get("created_by", [])]
    genres = [
        {"external_id": str(g["id"]), "name": name}
        for g in raw.get("genres", [])
        for name in TV_GENRE_NAME_OVERRIDES.get(g["name"], [g["name"]])
    ]
    networks = [{"external_id": str(n["id"]), "name": n["name"]} for n in raw.get("networks", [])]

    return {
        "external_id": str(raw["id"]),
        "external_source": "tmdb",
        "title": raw.get("name"),
        "slug": f"{slugify(raw.get('name', ''))}-{year}" if year else slugify(raw.get("name", "")),
        "attributes": entity_attrs,
        "directors": directors,
        "cast": top_cast,
        "creators": creators,
        "genres": genres,
        "networks": networks,
    }


def normalize_track(raw: dict) -> dict:
    """
    Convert a raw iTunes Search/Lookup track result into the internal shape
    expected by SyncService.sync_track: entity attributes + related artist/album/genre.
    """
    year = None
    if raw.get("releaseDate"):
        try:
            year = int(raw["releaseDate"][:4])
        except (ValueError, TypeError):
            year = None

    # iTunes' artworkUrl100 is a 100x100 thumbnail URL; the same CDN serves
    # larger crops by swapping the size token in the path.
    artwork = raw.get("artworkUrl100")
    if artwork:
        artwork = artwork.replace("100x100bb", "600x600bb")

    entity_attrs = {
        "year": year,
        "duration_ms": raw.get("trackTimeMillis"),
        "country": raw.get("country"),
        "media": {
            "image_url": artwork,
            "audio_preview_url": raw.get("previewUrl"),
            "video_url": None,
        },
    }

    artist = (
        {"external_id": str(raw["artistId"]), "name": raw["artistName"]}
        if raw.get("artistId") and raw.get("artistName")
        else None
    )
    album = (
        {"external_id": str(raw["collectionId"]), "name": raw["collectionName"]}
        if raw.get("collectionId") and raw.get("collectionName")
        else None
    )

    return {
        "external_id": str(raw["trackId"]),
        "external_source": "itunes_track",
        "title": raw.get("trackName"),
        "slug": f"{slugify(raw.get('trackName', ''))}-{raw['trackId']}",
        "attributes": entity_attrs,
        "artist": artist,
        "album": album,
        "genre": raw.get("primaryGenreName"),
    }
