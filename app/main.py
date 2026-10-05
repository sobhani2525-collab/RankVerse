from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings

from app.api.v1.router import api_router
from app.modules.entities.ego import warm_hero_pool
from app.core.exceptions import (
    RankVerseError,
    rankverse_exception_handler,
    unhandled_exception_handler,
)


if settings.sentry_dsn:
    import sentry_sdk

    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.sentry_environment or settings.environment,
        traces_sample_rate=settings.sentry_traces_sample_rate,
        # Never attach request bodies, cookies or IPs: they carry passwords and tokens.
        send_default_pii=False,
    )

app = FastAPI(
    title="RankVerse Core Engine",
    description="Knowledge-graph-based ranking platform for cultural entities (movies, books, music...)",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,    
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_exception_handler(RankVerseError, rankverse_exception_handler)
app.add_exception_handler(Exception, unhandled_exception_handler)

app.include_router(api_router)


@app.on_event("startup")
async def _warm_hero_pool():
    # Index the home hero's graphs in the background so the first visitor
    # doesn't wait for them.
    warm_hero_pool()


@app.get("/health")
async def health():
    return {"status": "ok"}
