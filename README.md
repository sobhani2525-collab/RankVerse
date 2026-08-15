# RankVerse Core Engine — MVP

موتور اصلی پلتفرم رتبه‌بندی مبتنی بر گراف دانش. این نسخه، MVP فاز اول است (فقط دسته «فیلم»)،
اما ساختار به‌گونه‌ای است که افزودن کتاب/موزیک/... در آینده بدون تغییر در schema اصلی ممکن باشد.

## اجرای محلی

### ۱. پیش‌نیازها
- Python 3.11+
- Docker (برای Postgres و Redis)

### ۲. راه‌اندازی

```bash
# کپی فایل env و پر کردن مقادیر (مخصوصاً TMDB_API_KEY)
cp .env.example .env

# بالا آوردن Postgres و Redis
docker compose up -d

# نصب وابستگی‌ها
python -m venv venv
source venv/bin/activate  # ویندوز: venv\Scripts\activate
pip install -r requirements.txt

# ساخت اولین migration و اعمال آن
alembic revision --autogenerate -m "init tables"
alembic upgrade head

# اجرای سرور
uvicorn app.main:app --reload
```

سرور روی `http://localhost:8000` بالا می‌آید. مستندات خودکار API: `http://localhost:8000/docs`

### ۳. وارد کردن اولین داده‌ها (Sync با TMDb)

```bash
# sync یک فیلم خاص با شناسه TMDb
curl -X POST "http://localhost:8000/api/v1/internal/sync/tmdb/movies/27205"

# sync دسته‌ای چند صفحه از فیلم‌های محبوب
curl -X POST "http://localhost:8000/api/v1/internal/sync/tmdb/bulk?pages=3"
```

### ۴. تست کردن API

```bash
curl "http://localhost:8000/api/v1/movies"
curl "http://localhost:8000/api/v1/rankings/movies"
```

### ۵. اجرای تست‌ها

```bash
pytest tests/
```

## ساختار پروژه

هر ماژول زیر `app/modules/` مستقل و خودکفاست (model, schema, repository, service, router).
جزئیات کامل در فایل توضیح‌داده‌شده در گفتگو موجود است. خلاصه:

- `entities/` → فیلم، شخص، ژانر (گره‌های گراف دانش)
- `ranking/` → فرمول امتیازدهی بیزی + بلند کردن با امتیاز خارجی
- `users/` → ثبت‌نام، رای‌دهی
- `auth/` → JWT access/refresh token
- `search/` → جستجوی ساده (فاز بعد: full-text/Elasticsearch)
- `sync/` → دریافت و نرمال‌سازی متادیتای TMDb

## فرانت‌اند (Next.js)

پوشه `frontend/` شامل صفحات وب است: صفحه اصلی (هیرو + فهرست رتبه‌بندی) و صفحه جزئیات فیلم.
هویت بصری بر مفهوم «نقشه ستاره‌ها» بنا شده — هر فیلم یک گره، رتبه بالاتر یعنی نور بیشتر، و روابط
واقعی گراف دانش (کارگردان/ژانر/سال) به‌صورت خطوط اتصال کوچیک (`Constellation.tsx`) نمایش داده می‌شوند؛
این عنصر صرفاً تزئینی نیست، مستقیم از داده API ساخته می‌شود.

### اجرای فرانت

```bash
cd frontend
cp .env.local.example .env.local   # آدرس بک‌اند را تنظیم کنید
npm install
npm run dev
```

روی `http://localhost:3000` بالا می‌آید (نیاز به اجرای هم‌زمان بک‌اند روی پورت 8000 دارد).

### نکات فرانت برای فاز بعد

- `RatingWidget.tsx` فعلاً توکن را از `localStorage` می‌خواند — فرض بر این است که فلوی لاگین جدا
  (که هنوز صفحه‌اش ساخته نشده) توکن را همان‌جا ذخیره می‌کند. صفحات ثبت‌نام/ورود باید در فاز بعد اضافه شوند.
- فونت فارسی: Vazirmatn (از Google Fonts، از طریق `next/font`). اعداد (رتبه، امتیاز، سال) عمداً
  با فونت Mono جدا (JetBrains Mono) رندر می‌شوند تا حس «محاسبه‌شده» داشته باشند.
- تصاویر پوستر مستقیم از `image.tmdb.org` خوانده می‌شوند؛ اگر بخواهید کش/CDN اختصاصی بگذارید،
  باید `next.config.mjs` و لایه `sync` به‌روزرسانی شود تا تصویر را دانلود و در storage خودتان ذخیره کند.

## نکات مهم برای فازهای بعدی

1. **محاسبه رتبه‌بندی**: در حال حاضر `RankingService.recompute_entity` بعد از هر رای هم به‌صورت زنده صدا زده می‌شود
   (برای پاسخ فوری) و هم باید به‌صورت دوره‌ای (مثلاً هر ساعت با Celery beat یا cron) روی کل دیتاست اجرا شود
   تا میانگین پلتفرم (`C`) به‌روز بماند. اسکلت batch job در `RankingService.recompute_all` آماده است.

2. **Duplicate edges در sync**: `SyncService.sync_movie` در حال حاضر در هر بار sync، رابطه‌های جدید اضافه
   می‌کند بدون چک تکراری بودن. قبل از پروداکشن باید یک "upsert" واقعی (delete-then-recreate یا get-or-create
   روی edge) اضافه شود.

3. **AI Recommendation Service**: طبق تصمیم اولیه، این بخش عمداً از MVP حذف شده و بعد از جمع‌آوری داده کاربر
   کافی، به‌عنوان سرویس Python جدا (نه داخل این مونولیت) اضافه خواهد شد.

4. **جدا کردن `/internal/` از API عمومی**: قبل از اکسپوز کردن API به بیرون، حتماً یک لایه auth/IP-allowlist
   جدا روی مسیرهای `/api/v1/internal/*` بگذارید.
