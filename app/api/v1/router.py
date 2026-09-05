from fastapi import APIRouter

from app.modules.entities.router import router as entities_router
from app.modules.ranking.router import router as ranking_router
from app.modules.auth.router import router as auth_router
from app.modules.users.router import router as users_router
from app.modules.lists.router import router as lists_router
from app.modules.search.router import router as search_router
from app.modules.sync.router import router as sync_router

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(auth_router)
api_router.include_router(entities_router)
api_router.include_router(ranking_router)
api_router.include_router(users_router)
api_router.include_router(lists_router)
api_router.include_router(search_router)
# sync router lives under /api/v1/internal/sync — internal-only, not part of the public surface
api_router.include_router(sync_router)
