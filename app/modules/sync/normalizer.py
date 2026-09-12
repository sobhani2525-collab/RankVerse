from slugify import slugify


def normalize_movie(raw: dict) -> dict:
    """
    Convert a raw TMDb /movie/{id} response (with credits appended) into the
    internal shape expected by SyncService: entity attributes + related people/genres.
    """
    year = None
    if raw.get("release_date"):
        try:
            year = int(raw["release_date"][:4])
        except (ValueError, TypeError):
            year = None

    poster_path = raw.get("poster_path")

    entity_attrs = {
        "poster_path": poster_path,
        "overview": raw.get("overview"),
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


# TMDb's TV genre list has some labels that are really the same concept as
# an existing movie genre under a different name (e.g. "Action & Adventure"
# is TV's label for what movies call "Action"). Mapping happens by feeding
# the movie-side name into _get_or_create_genre so its existing slug-first
# lookup (see SyncService) finds the same genre entity instead of creating
# a duplicate. Deliberately does NOT cover hybrid TV-only categories like
# "Sci-Fi & Fantasy" or "War & Politics" -- those don't cleanly equal one
# single movie genre, so they get their own entity via plain slugify().
TV_GENRE_NAME_OVERRIDES: dict[str, str] = {
    "Action & Adventure": "Action",
}


def normalize_tv_series(raw: dict) -> dict:
    """
    Convert a raw TMDb /tv/{id} response (with credits appended) into the
    internal shape expected by SyncService.sync_tv_series. Mirrors
    normalize_movie's shape -- same entity attribute conventions (poster/
    media/external_rating/etc), reading the TV-specific fields TMDb uses
    instead (name/first_air_date instead of title/release_date, no runtime,
    plus season/episode/status metadata and created_by/networks which movies
    don't have).
    """
    year = None
    if raw.get("first_air_date"):
        try:
            year = int(raw["first_air_date"][:4])
        except (ValueError, TypeError):
            year = None

    poster_path = raw.get("poster_path")

    entity_attrs = {
        "poster_path": poster_path,
        "overview": raw.get("overview"),
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
    crew = credits.get("crew", [])
    cast = credits.get("cast", [])

    # TMDb TV credits are sparse/inconsistent about a series-level "Director"
    # (each episode has its own) -- this stays empty for most shows, which is
    # fine, it just means no directed_by edges get created for them.
    directors = [
        {"external_id": str(c["id"]), "name": c["name"]}
        for c in crew
        if c.get("job") == "Director"
    ]
    top_cast = [
        {"external_id": str(c["id"]), "name": c["name"], "character": c.get("character"), "order": c.get("order", 99)}
        for c in cast[:5]
    ]
    # created_by is a top-level field on /tv/{id}, not part of credits.
    creators = [{"external_id": str(c["id"]), "name": c["name"]} for c in raw.get("created_by", [])]
    genres = [
        {"external_id": str(g["id"]), "name": TV_GENRE_NAME_OVERRIDES.get(g["name"], g["name"])}
        for g in raw.get("genres", [])
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
