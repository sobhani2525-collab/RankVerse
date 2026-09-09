"""
Syncs a handful of well-known tracks from iTunes (Coldplay, Queen) to
exercise the music entity pipeline end-to-end (track/person/album/genre
entities + performed_by/part_of/has_genre edges), then verifies each
synced track's detail has everything TrackView/MediaPlayer need.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import asyncio
from app.core.database import AsyncSessionLocal
from app.modules.entities.service import EntityService
from app.modules.sync.itunes_client import ITunesClient
from app.modules.sync.service import SyncService

ARTISTS = ["Coldplay", "Queen"]
TRACKS_PER_ARTIST = 5


async def find_track_ids() -> list[int]:
    client = ITunesClient()
    track_ids: list[int] = []
    seen: set[int] = set()
    for artist in ARTISTS:
        results = await client.search_tracks(artist, limit=TRACKS_PER_ARTIST)
        for r in results:
            track_id = r.get("trackId")
            if track_id and track_id not in seen:
                seen.add(track_id)
                track_ids.append(track_id)
    return track_ids


async def sync_all(track_ids: list[int]) -> list[str]:
    synced_slugs = []
    async with AsyncSessionLocal() as db:
        sync_service = SyncService(db)
        for track_id in track_ids:
            try:
                result = await sync_service.sync_track(track_id)
                synced_slugs.append(result["slug"])
                print(f"synced: {result['title']} -> /{result['slug']}")
            except Exception as e:
                print(f"failed to sync track {track_id}: {e}")
    return synced_slugs


async def verify_all(slugs: list[str]) -> None:
    print()
    print(f"--- verifying {len(slugs)} synced track(s) ---")
    async with AsyncSessionLocal() as db:
        entity_service = EntityService(db)
        for slug in slugs:
            track = await entity_service.get_track_detail(slug)
            has_audio = bool(track.media.audio_preview_url)
            artist_name = track.artist.title if track.artist else "(no artist)"
            album_name = track.album.title if track.album else "(no album)"
            status = "OK" if has_audio else "MISSING AUDIO"
            print(
                f"[{status}] {track.title} | artist={artist_name} | album={album_name} "
                f"| other_tracks_by_artist={len(track.other_tracks)}"
            )
            print(f"    audio_preview_url: {track.media.audio_preview_url}")


async def main():
    track_ids = await find_track_ids()
    print(f"found {len(track_ids)} candidate track(s) from iTunes search")

    slugs = await sync_all(track_ids)
    await verify_all(slugs)


if __name__ == "__main__":
    asyncio.run(main())
