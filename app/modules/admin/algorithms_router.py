import uuid

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.schemas import envelope
from app.modules.admin.algorithms_schemas import RecomputeRequest
from app.modules.admin.algorithms_service import AdminAlgorithmsService
from app.modules.admin.dependencies import get_current_admin
from app.modules.admin.models import AdminAccount

router = APIRouter(prefix="/admin/algorithms", tags=["admin-algorithms"])


def _json(model) -> dict:
    return model.model_dump(mode="json")


@router.get("/params")
async def algorithm_params(_admin: AdminAccount = Depends(get_current_admin)):
    return envelope(data=[_json(p) for p in AdminAlgorithmsService.params()])


@router.get("/health")
async def algorithms_health(
    response: Response, _admin: AdminAccount = Depends(get_current_admin), db: AsyncSession = Depends(get_db)
):
    response.headers["Cache-Control"] = "private, no-store"
    return envelope(data=_json(await AdminAlgorithmsService(db).health()))


@router.get("/titles")
async def search_titles(
    q: str = Query(..., min_length=1, max_length=200),
    _admin: AdminAccount = Depends(get_current_admin), db: AsyncSession = Depends(get_db),
):
    return envelope(data=[_json(t) for t in await AdminAlgorithmsService(db).search(q.strip())])


@router.get("/explain/{entity_id}")
async def explain_score(
    entity_id: uuid.UUID, _admin: AdminAccount = Depends(get_current_admin), db: AsyncSession = Depends(get_db)
):
    return envelope(data=_json(await AdminAlgorithmsService(db).explain(entity_id)))


@router.get("/drift")
async def score_drift(_admin: AdminAccount = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    return envelope(data=_json(await AdminAlgorithmsService(db).drift()))


@router.post("/recompute")
async def recompute_scores(
    payload: RecomputeRequest, request: Request,
    admin: AdminAccount = Depends(get_current_admin), db: AsyncSession = Depends(get_db),
):
    return envelope(data=_json(await AdminAlgorithmsService(db).recompute(admin, payload.entity_ids, request)))
