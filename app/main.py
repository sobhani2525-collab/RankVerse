import asyncio

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings

from app.api.v1.router import api_router
from app.modules.alerts.middleware import SlowRequestMiddleware
from app.modules.entities.ego import warm_hero_pool
from app.core.periodic import periodic_loop
from app.modules.daily_battle.precreate import precreate_loop
from app.modules.entities.person_stats import refresh_loop
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
    title="CinemaGozin Core Engine",
    description="Knowledge-graph-based ranking platform for movies, series and artists",
    version="0.1.0",
    docs_url="/docs" if settings.api_docs_enabled else None,
    redoc_url="/redoc" if settings.api_docs_enabled else None,
    openapi_url="/openapi.json" if settings.api_docs_enabled else None,
)

# Sent on every API response. The API only serves JSON, so nothing may frame
# it or sniff it as another type, and URLs never leak to other sites.
SECURITY_HEADERS = {
    "Strict-Transport-Security": "max-age=31536000",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
}


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    for key, value in SECURITY_HEADERS.items():
        response.headers.setdefault(key, value)
    return response

app.add_middleware(
    CORSMiddleware,    
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(SlowRequestMiddleware)
app.add_exception_handler(RankVerseError, rankverse_exception_handler)
app.add_exception_handler(Exception, unhandled_exception_handler)

app.include_router(api_router)


@app.on_event("startup")
async def _warm_hero_pool():
    # Index the home hero's graphs in the background so the first visitor
    # doesn't wait for them.
    warm_hero_pool()


@app.on_event("startup")
async def _start_person_stats_refresh():
    # The people ranking reads the person_stats summary table; rebuild it
    # periodically so it doesn't go stale (see entities/person_stats.py).
    if settings.person_stats_refresh_hours > 0:
        app.state.person_stats_task = asyncio.create_task(refresh_loop(settings.person_stats_refresh_hours))


@app.on_event("startup")
async def _start_periodic_jobs():
    # Tournament rounds, notification and alert cleanup (see core/periodic.py).
    if settings.periodic_jobs_enabled:
        app.state.periodic_task = asyncio.create_task(periodic_loop())


@app.on_event("startup")
async def _start_daily_battle_precreate():
    if settings.daily_battle_precreate:
        app.state.daily_battle_task = asyncio.create_task(precreate_loop())


@app.get("/health")
async def health():
    return {"status": "ok"}
