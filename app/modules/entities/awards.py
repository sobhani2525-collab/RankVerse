"""Award keys, display names and the read query for a page's awards."""
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.modules.entities.models import Entity, EntityAward
from app.modules.entities.schemas import AwardItem

# key -> (English name, Persian name); order = display order on a page
AWARDS: dict[str, tuple[str, str]] = {
    "oscar": ("Academy Awards", "اسکار"),
    "golden_globe": ("Golden Globe Awards", "گلدن گلوب"),
    "bafta": ("BAFTA Awards", "بفتا"),
    "cannes": ("Cannes Film Festival", "جشنواره کن"),
    "venice": ("Venice Film Festival", "جشنواره ونیز"),
    "berlin": ("Berlin Film Festival", "جشنواره برلین"),
    "emmy": ("Primetime Emmy Awards", "امی"),
}

CATEGORIES_FA: dict[str, str] = {
    "Best Picture": "بهترین فیلم",
    "Best Director": "بهترین کارگردان",
    "Best Actor": "بهترین بازیگر مرد",
    "Best Actress": "بهترین بازیگر زن",
    "Best Supporting Actor": "بهترین بازیگر مرد نقش مکمل",
    "Best Supporting Actress": "بهترین بازیگر زن نقش مکمل",
    "Best Original Screenplay": "بهترین فیلمنامه اصلی",
    "Best Adapted Screenplay": "بهترین فیلمنامه اقتباسی",
    "Best International Feature Film": "بهترین فیلم بین‌المللی",
    "Best Animated Feature": "بهترین انیمیشن",
    "Best Cinematography": "بهترین فیلمبرداری",
    "Best Film Editing": "بهترین تدوین",
    "Best Original Score": "بهترین موسیقی متن",
    "Best Writing, Original Screenplay": "بهترین فیلمنامه اصلی",
    "Best Writing, Adapted Screenplay": "بهترین فیلمنامه اقتباسی",
    "Best Sound": "بهترین صدا",
    "Best Sound Editing": "بهترین تدوین صدا",
    "Best Production Design": "بهترین طراحی تولید",
    "Best Animated Short Film": "بهترین انیمیشن کوتاه",
    "Best Costume Design": "بهترین طراحی لباس",
    "Best Visual Effects": "بهترین جلوه‌های ویژه",
    "Best Documentary Feature Film": "بهترین مستند بلند",
    "Best Documentary (Short Subject)": "بهترین مستند کوتاه",
    "Best Original Song": "بهترین ترانهٔ اصلی",
    "Best Live Action Short Film": "بهترین فیلم کوتاه",
    "Best Makeup and Hairstyling": "بهترین گریم و آرایش مو",
    "Best Story": "بهترین داستان",
    "Achievement in Casting": "دستاورد در انتخاب بازیگر",
    "Palme d'Or": "نخل طلا",
    "Golden Lion": "شیر طلایی",
    "Golden Bear": "خرس طلایی",
}


async def awards_for(db: AsyncSession, entity_id: uuid.UUID) -> list[AwardItem]:
    """Wins first, then newest year; grouped by award in AWARDS order."""
    target = aliased(Entity)
    rows = (
        await db.execute(
            select(EntityAward, target.title, target.slug)
            .outerjoin(target, target.id == EntityAward.for_entity_id)
            .where(EntityAward.entity_id == entity_id)
        )
    ).all()
    order = list(AWARDS)
    items = [
        AwardItem(
            award=a.award,
            award_name=AWARDS.get(a.award, (a.award, a.award))[0],
            award_name_fa=AWARDS.get(a.award, (a.award, a.award))[1],
            category=a.category,
            category_fa=CATEGORIES_FA.get(a.category),
            year=a.year,
            status=a.status,
            for_title=title,
            for_slug=slug,
        )
        for a, title, slug in rows
    ]
    items.sort(key=lambda i: (
        order.index(i.award) if i.award in order else len(order),
        i.status != "won",
        -i.year,
    ))
    return items
