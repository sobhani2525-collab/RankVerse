from pydantic import BaseModel


class RelatedEntityOut(BaseModel):
    id: str
    title: str
    slug: str
    entity_type: str
    weight: float
    relation_type: str
    poster_path: str | None = None
    year: int | None = None
    title_fa: str | None = None
    reason: str | None = None

    class Config:
        from_attributes = True
