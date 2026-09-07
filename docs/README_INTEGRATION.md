# ماژول Battles (نبرد بهترین‌ها) — راهنمای یکپارچه‌سازی

## ۱) کپی فایل‌ها
پوشه‌ی `app/modules/battles/` رو داخل بک‌اند خودتون کپی کنید (کنار `entities`, `users`, `ranking` و بقیه ماژول‌ها).

## ۲) اصلاح ایمپورت‌ها
این فایل‌ها رو باز کنید و مسیرها رو با ساختار واقعی پروژه‌تون تطبیق بدید:
- `models.py` → `from app.core.database import Base`
- `repository.py` → `from app.modules.entities.models import Entity`
- `router.py` → `from app.core.database import get_db` و `from app.modules.auth.dependencies import get_current_user`

اگه اسم فیلد `Entity.category` یا `Entity.title` در مدل فعلی‌تون فرق داره (مثلاً `entity_type` یا `name`)، همون‌جا در `repository.py` و `router.py` جایگزین کنید.

## ۳) ثبت روتر در main.py
```python
from app.modules.battles.router import router as battles_router
app.include_router(battles_router)
```

## ۴) مایگریشن
فایل `alembic_migration/xxxx_add_battles_tables.py` رو به `alembic/versions/` منتقل کنید، اسمش رو با کانوانسیون آلمبیک هماهنگ کنید، و `down_revision` رو با آخرین ریویژن فعلی‌تون پر کنید:
```bash
alembic heads
# down_revision = "<همون هش>"
alembic upgrade head
```

## ۵) اندپوینت‌ها
- `GET /api/v1/battles/next?category=movie` → یک جفت entity با Elo نزدیک به هم برمی‌گردونه (matchmaking)
- `POST /api/v1/battles/vote` → رأی کاربر رو ثبت و امتیاز Elo هر دو آیتم رو آپدیت می‌کنه

بدنه‌ی `vote`:
```json
{
  "category": "movie",
  "left_item": "uuid",
  "right_item": "uuid",
  "winner": "left"   // یا "right" یا "skip"
}
```

## ۶) نکات مهم
- **Rate limit**: فعلاً ۵۰۰ رأی در روز به ازای هر کاربر (`MAX_VOTES_PER_DAY` در `service.py`) — بر اساس رفتار واقعی کاربرها تنظیمش کنید.
- **Matchmaking**: یک entity تصادفی به‌عنوان anchor انتخاب می‌شه، بعد نزدیک‌ترین حریف از نظر Elo (و که در ۳ روز اخیر به این کاربر نشون داده نشده) پیدا می‌شه. عدد ۳ روز رو در `get_closest_opponent` (پارامتر `recent_days`) می‌تونید عوض کنید.
- **K-factor**: آیتم‌های زیر ۲۰ رأی K=40 دارن (سریع‌تر تثبیت می‌شن)، بعدش K=16. در `elo.py` قابل تنظیمه.
- **اتصال به فرمول رتبه‌بندی اصلی**: برای اضافه کردن این سیگنال به `computed_score`، از جدول `entity_elo_scores` بخونید، نرمالایزش کنید (مثلاً min-max یا z-score روی بازه‌ی ۴۰۰–۲۴۰۰) و به‌صورت `gamma × elo_normalized_score` اضافه کنید.
- این پیاده‌سازی تست نشده روی دیتابیس واقعی شماست (بدون دسترسی به ریپو نوشته شده) — قبل از push، لوکال اجرا و تست کنید همون‌طور که در سشن‌های قبلی انجام می‌دادید.
