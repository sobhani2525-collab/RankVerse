"""
Seeds attributes.description (Persian) for genre entities by matching
title (case-insensitive) against a fixed dictionary below. Only the
description key is touched — any other existing attributes are preserved.
Safe to re-run.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import asyncio
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.modules.entities.models import Entity

GENRE_DESCRIPTIONS: dict[str, str] = {
    "action": "فیلم‌های اکشن با تعقیب‌وگریز، مبارزه و صحنه‌های پرهیجان، جایی که ریتم تند داستان و درگیری فیزیکی محور اصلی روایت است.",
    "adventure": "ماجراجویی‌هایی که شخصیت‌ها را به سفرها و کشف‌های ناشناخته می‌برند، معمولاً همراه با خطر و کاوش در دنیاهای جدید.",
    "animation": "آثار انیمیشن که با تکنیک‌های ترسیم دستی، کامپیوتری یا استاپ‌موشن ساخته می‌شوند و طیف وسیعی از مخاطبان را در بر می‌گیرند.",
    "comedy": "فیلم‌های کمدی که با طنز، موقعیت‌های خنده‌دار و دیالوگ‌های سرگرم‌کننده به دنبال خنداندن مخاطب هستند.",
    "crime": "روایت‌هایی پیرامون جرم، جنایت و پیگرد قانونی، از دید مجرمان، پلیس یا هر دو.",
    "documentary": "مستندهایی که وقایع، افراد یا موضوعات واقعی را با هدف آگاهی‌بخشی یا روایت‌گری مستند بررسی می‌کنند.",
    "drama": "آثار دراماتیک با تمرکز بر روابط انسانی، تعارض‌های احساسی و روایت‌های عمیق شخصیت‌محور.",
    "family": "فیلم‌هایی مناسب تماشای خانوادگی، معمولاً با پیام‌های مثبت و مناسب همه‌ی سنین.",
    "fantasy": "دنیاهای خیالی با جادو، موجودات افسانه‌ای و قوانین فیزیکی متفاوت از واقعیت.",
    "history": "بازسازی رویدادها، شخصیت‌ها یا دوره‌های تاریخی واقعی در قالب روایت سینمایی.",
    "horror": "فیلم‌های ترسناک که با ایجاد اضطراب، دلهره و وحشت، حس ترس را در مخاطب برمی‌انگیزند.",
    "music": "آثاری با محوریت موسیقی، از بیوگرافی هنرمندان تا موزیکال‌های صحنه‌ای و اجراهای زنده.",
    "mystery": "معماهای پیچیده که مخاطب را همراه شخصیت‌ها به دنبال کشف حقیقت پنهان می‌برند.",
    "romance": "داستان‌های عاشقانه با تمرکز بر روابط احساسی و عمیق بین شخصیت‌ها.",
    "science fiction": "دنیاهای علمی‌تخیلی با فناوری‌های آینده، سفر فضایی و پرسش‌های فلسفی درباره‌ی انسان و جهان.",
    "tv movie": "فیلم‌هایی که مستقیماً برای پخش تلویزیونی ساخته شده‌اند، بدون اکران سینمایی.",
    "thriller": "روایت‌های پرتعلیق که با ایجاد تنش و کشمکش مداوم، مخاطب را در حالت آماده‌باش نگه می‌دارند.",
    "war": "فیلم‌هایی درباره‌ی جنگ، نبردهای نظامی و پیامدهای انسانی درگیری‌های مسلحانه.",
    "western": "داستان‌هایی در فضای غرب وحشی آمریکا، با محوریت قانون، انتقام و زندگی در مرزهای ناشناخته.",
}


async def main():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Entity).where(Entity.entity_type == "genre"))
        genres = result.scalars().all()

        updated = []
        unmatched = []
        for genre in genres:
            description = GENRE_DESCRIPTIONS.get(genre.title.strip().lower())
            if description is None:
                unmatched.append(genre.title)
                continue
            # Reassign (not mutate in place) so SQLAlchemy detects the change on this JSONB column.
            genre.attributes = {**genre.attributes, "description": description}
            updated.append(genre.title)

        await db.commit()

        print(f"updated {len(updated)} genre(s): {', '.join(updated)}")
        if unmatched:
            print(f"no dictionary match for {len(unmatched)} genre(s): {', '.join(unmatched)}")


if __name__ == "__main__":
    asyncio.run(main())
