import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.taste.repository import TasteRepository
from app.modules.taste.schemas import (
    ContributionStatsPublic,
    TasteAnchorEntity,
    TasteAnchorPublic,
    TasteDimensionPublic,
    TasteInsightPublic,
    TasteProfile,
    TasteSnapshotPublic,
)


class TasteService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = TasteRepository(db)

    async def get_taste_profile(self, user_id: uuid.UUID, entity_scope: str = "movie") -> TasteProfile:
        """
        Reads the derived Taste DNA layer as-is. A missing snapshot or empty
        lists just mean the background job hasn't computed this user's
        profile yet, not an error.
        """
        snapshot = await self.repo.get_snapshot(user_id, entity_scope)
        dimensions = await self.repo.list_dimensions(user_id)
        anchor_rows = await self.repo.list_anchors_with_entities(user_id)
        insight = await self.repo.get_insight(user_id)
        contribution_stats = await self.repo.get_contribution_stats(user_id)

        return TasteProfile(
            snapshot=TasteSnapshotPublic.model_validate(snapshot) if snapshot else None,
            dimensions=[TasteDimensionPublic.model_validate(d) for d in dimensions],
            anchors=[
                TasteAnchorPublic(
                    entity=TasteAnchorEntity(
                        id=entity.id,
                        slug=entity.slug,
                        title=entity.title,
                        entity_type=entity.entity_type,
                        poster_path=entity.attributes.get("poster_path"),
                    ),
                    anchor_strength=anchor.anchor_strength,
                    match_score=anchor.match_score,
                    rank=anchor.rank,
                )
                for anchor, entity in anchor_rows
            ],
            insight=TasteInsightPublic.model_validate(insight) if insight else None,
            contribution_stats=(
                ContributionStatsPublic.model_validate(contribution_stats) if contribution_stats else None
            ),
        )
