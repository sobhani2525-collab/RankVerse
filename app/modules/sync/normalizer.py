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

    entity_attrs = {
        "poster_path": raw.get("poster_path"),
        "overview": raw.get("overview"),
        "runtime": raw.get("runtime"),
        "year": year,
        "country": (raw.get("production_countries") or [{}])[0].get("iso_3166_1"),
        # TMDb vote_average is already 0-10, matches our internal scale
        "external_rating": raw.get("vote_average"),
        "external_vote_count": raw.get("vote_count"),
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
