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
    "fajr": ("Fajr Film Festival", "جشنواره فیلم فجر"),
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
    "Best Actor – Motion Picture Drama": "بهترین بازیگر مرد فیلم درام",
    "Best Actress – Motion Picture Drama": "بهترین بازیگر زن فیلم درام",
    "Best Actress in a Motion Picture – Musical or Comedy": "بهترین بازیگر زن فیلم موزیکال یا کمدی",
    "Best Supporting Actor – Motion Picture": "بهترین بازیگر مرد نقش مکمل فیلم",
    "Best Supporting Actress – Motion Picture": "بهترین بازیگر زن نقش مکمل فیلم",
    "Best Motion Picture – Drama": "بهترین فیلم درام",
    "Best Motion Picture – Musical or Comedy": "بهترین فیلم موزیکال یا کمدی",
    "Best Actress – Television Series Musical or Comedy": "بهترین بازیگر زن سریال کمدی یا موزیکال",
    "Best Actor – Television Series Musical or Comedy": "بهترین بازیگر مرد سریال کمدی یا موزیکال",
    "Best Actor – Television Series Drama": "بهترین بازیگر مرد سریال درام",
    "Best Television Series – Musical or Comedy": "بهترین سریال کمدی یا موزیکال",
    "Best Supporting Actor – Series, Miniseries or Television Film": "بهترین بازیگر مرد نقش مکمل سریال یا فیلم تلویزیونی",
    "Best Supporting Actress – Series, Miniseries or Television Film": "بهترین بازیگر زن نقش مکمل سریال یا فیلم تلویزیونی",
    "Best Actress – Miniseries or Television Film": "بهترین بازیگر زن مینی‌سریال یا فیلم تلویزیونی",
    "New Star of the Year – Actress": "ستارهٔ جدید سال (زن)",
    "New Star of the Year – Actor": "ستارهٔ جدید سال (مرد)",
    "Best Film": "بهترین فیلم",
    "Best Actress in a Leading Role": "بهترین بازیگر زن نقش اصلی",
    "Best Actor in a Leading Role": "بهترین بازیگر مرد نقش اصلی",
    "Best Actor in a Supporting Role": "بهترین بازیگر مرد نقش مکمل",
    "Best Direction": "بهترین کارگردانی",
    "Best Non-English Language Film": "بهترین فیلم غیرانگلیسی‌زبان",
    "Outstanding Lead Actor in a Comedy Series": "بهترین بازیگر مرد سریال کمدی",
    "Outstanding Lead Actress in a Comedy Series": "بهترین بازیگر زن سریال کمدی",
    "Outstanding Lead Actor in a Drama Series": "بهترین بازیگر مرد سریال درام",
    "Outstanding Lead Actress in a Drama Series": "بهترین بازیگر زن سریال درام",
    "Outstanding Lead Actor in a Miniseries or a Movie": "بهترین بازیگر مرد مینی‌سریال یا فیلم",
    "Outstanding Lead Actress in a Miniseries or a Movie": "بهترین بازیگر زن مینی‌سریال یا فیلم",
    "Outstanding Supporting Actor in a Comedy Series": "بهترین بازیگر مرد نقش مکمل سریال کمدی",
    "Outstanding Supporting Actress in a Comedy Series": "بهترین بازیگر زن نقش مکمل سریال کمدی",
    "Outstanding Supporting Actor in a Drama Series": "بهترین بازیگر مرد نقش مکمل سریال درام",
    "Outstanding Supporting Actress in a Drama Series": "بهترین بازیگر زن نقش مکمل سریال درام",
    "Outstanding Supporting Actor in a Miniseries or a Movie": "بهترین بازیگر مرد نقش مکمل مینی‌سریال یا فیلم",
    "Outstanding Supporting Actress in a Miniseries or a Movie": "بهترین بازیگر زن نقش مکمل مینی‌سریال یا فیلم",
    "Outstanding Guest Actor in a Drama Series": "بهترین بازیگر مهمان مرد سریال درام",
    "Outstanding Guest Actress in a Drama Series": "بهترین بازیگر مهمان زن سریال درام",
    "Outstanding Guest Actor in a Comedy Series": "بهترین بازیگر مهمان مرد سریال کمدی",
    "Outstanding Guest Actress in a Comedy Series": "بهترین بازیگر مهمان زن سریال کمدی",
    "Outstanding Writing for a Comedy Series": "بهترین نویسندگی سریال کمدی",
    "Outstanding Writing for a Drama Series": "بهترین نویسندگی سریال درام",
    "Outstanding Writing for a Variety Series": "بهترین نویسندگی سریال ورایتی",
    "Outstanding Directing for a Comedy Series": "بهترین کارگردانی سریال کمدی",
    "Outstanding Directing for a Drama Series": "بهترین کارگردانی سریال درام",
    "Outstanding Directing for a Limited Series, Movie, or Dramatic Special": "بهترین کارگردانی مینی‌سریال، فیلم یا ویژه‌برنامهٔ نمایشی",
    "Outstanding Drama Series": "بهترین سریال درام",
    "Outstanding Comedy Series": "بهترین سریال کمدی",
    "Outstanding Animated Program": "بهترین برنامهٔ انیمیشن",
    "Outstanding Variety, Music or Comedy Series": "بهترین سریال ورایتی، موسیقی یا کمدی",
    "Outstanding Television Movie": "بهترین فیلم تلویزیونی",
    "Outstanding Original Music and Lyrics": "بهترین موسیقی و ترانهٔ اصلی",
    "Outstanding Music Composition for a Series (Original Dramatic Score)": "بهترین آهنگسازی سریال (موسیقی متن اصلی)",
    "Outstanding Cinematography for a Single-Camera Series": "بهترین فیلمبرداری سریال تک‌دوربینه",
    "Individual Performance in a Variety or Music Program": "بهترین اجرای فردی در برنامهٔ ورایتی یا موسیقی",
    "Best Screenplay": "بهترین فیلمنامه",
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
