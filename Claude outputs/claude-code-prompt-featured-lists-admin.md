# پرامپت Claude Code: فهرست برگزیده با مدیریت در پنل ادمین + پنهان‌کردن فهرست‌های بی‌کیفیت

همیشه فارسی جواب بده. شاخه (branch) جدید نساز و روی `main` کار کن. بدون اجازهٔ من `git push` نزن.

## هدف

الان بخش «Featured list» صفحهٔ اصلی خودکار است (`discoverLists({sort:"popular", page_size:1})`) و بخش «آخرین فهرست‌ها» هر فهرست عمومی را نشان می‌دهد، حتی فهرست‌های تستی و بی‌معنی (مثل «فهرست تستی»، «sdfasdf»، فهرست‌های ۱ تا ۲ آیتمی). می‌خواهم:

1. ادمین از **پنل ادمین** تعیین کند کدام فهرست «برگزیده» باشد (و ترتیب برگزیده‌ها).
2. ادمین بتواند فهرست‌های بی‌کیفیت را از صفحهٔ اصلی و صفحهٔ کشف (`/lists`) **پنهان** کند، بدون اینکه فهرست یا صفحهٔ خودش حذف شود.
3. صفحهٔ اصلی فقط فهرست‌های باکیفیت را نشان دهد.

## قبل از شروع، این‌ها را بخوان

- `app/modules/lists/models.py` (مدل `UserList`)، `repository.py` (`discover`)، `service.py`، `router.py` (`GET /lists`)، `schemas.py`
- `app/modules/admin/` (`router.py`, `service.py`, `repository.py`, `dependencies.py` با `get_current_admin`) و الگوی صفحات `frontend/app/admin/(protected)/users/page.tsx` و `entities/page.tsx`
- `frontend/app/admin/(protected)/_components/AdminSidebar.tsx`
- `frontend/app/page.tsx`، `components/home/FeaturedList.tsx`، `frontend/lib/api.ts` (`discoverLists`, `getListBySlug`, `RANKING_TTL`)
- `frontend/components/lists/lists-explorer.tsx` و `app/lists/page.tsx`
- یک تست الگو: `tests/test_lists.py` و `tests/conftest.py`

سبک پروژه را رعایت کن: SQLAlchemy 2.0 با `Mapped/mapped_column`، async، ساختار `models/schemas/repository/service/router`، ثابت‌های قابل‌تنظیم در `config.py`، `is_owner` و دسترسی فقط سمت سرور.

## بک‌اند

### ۱. ستون‌های جدید در `user_lists` (با migration Alembic)

- `is_featured: bool` (پیش‌فرض false، server_default)
- `featured_at: datetime | None` و `featured_order: int | None` (برای ترتیب برگزیده‌ها)
- `is_hidden_from_discovery: bool` (پیش‌فرض false) — فهرست پنهان‌شده همچنان با لینک مستقیم باز می‌شود و صاحبش آن را می‌بیند، فقط در `GET /lists` و صفحهٔ اصلی و sitemap نمی‌آید
- `curated_by_admin_id` (nullable، FK به `admin_accounts` یا فقط UUID بدون FK اگر مشکل چرخه داشت) و `curation_note: str | None`

Migration را تمیز و برگشت‌پذیر بنویس. تاریخچهٔ Alembic را بررسی کن که با وضعیت دیتابیس هم‌خوان باشد.

### ۲. فیلتر کیفیت خودکار برای نمایش عمومی

در `ListRepository.discover` یک پارامتر جدید مثل `quality_only: bool = False` اضافه کن. وقتی true است:

- `is_hidden_from_discovery = false`
- حداقل `settings.LIST_DISCOVERY_MIN_ITEMS` آیتم (پیش‌فرض ۳، در `config.py`، قابل‌تنظیم با env)
- عنوان حداقل ۵ نویسه باشد

فهرست‌هایی که ادمین صراحتاً برگزیده کرده این شرط‌ها را دور بزنند. `GET /lists` به‌صورت پیش‌فرض `quality_only=true` بشود تا `/lists` و بخش «آخرین فهرست‌ها» خودکار تمیز شوند. sitemap هم فهرست‌های پنهان را حذف کند. با دقت چک کن چیزی که صاحب فهرست در «فهرست‌های من» و پروفایل می‌بیند عوض نشود (آن مسیرها از `discover` استفاده نمی‌کنند).

### ۳. endpoint عمومی برگزیده‌ها

`GET /lists/featured?limit=` — فهرست‌های `is_featured=true`، عمومی و پنهان‌نشده، مرتب با `featured_order` سپس `featured_at`. همان شکل پاسخ `ListDetail` یا `ListSummary` که صفحهٔ اصلی الان با آن کار می‌کند. حتماً قبل از `/lists/{slug}` در router تعریف شود تا «featured» به‌عنوان slug خوانده نشود (مثل `/lists/similar`).

### ۴. endpointهای ادمین (با `get_current_admin`)

زیر prefix ادمین:

- `GET /admin/lists` — جدول صفحه‌بندی‌شده با فیلتر: جستجو در عنوان/صاحب، `featured`, `hidden`, `entity_type`, `min_items`, مرتب‌سازی (تازه، محبوب، تعداد آیتم). هر ردیف: عنوان، slug، صاحب (username)، تعداد آیتم، لایک، کامنت، تاریخ، وضعیت برگزیده/پنهان.
- `PATCH /admin/lists/{id}` — بدنه: `is_featured`, `featured_order`, `is_hidden_from_discovery`, `curation_note` (همه اختیاری). هنگام برگزیده‌شدن `featured_at` و `curated_by_admin_id` را پر کن؛ هنگام برداشتن، `featured_at`/`featured_order` را null کن.
- `POST /admin/lists/featured/reorder` — لیست idها به ترتیب جدید.

اگر در پروژه سازوکار Audit Log برای اکشن‌های ادمین وجود دارد، هر تغییر را ثبت کن. اگر صفحهٔ audit-log فعلاً فقط placeholder است، فقط یک `logger.info` با شناسهٔ ادمین و فهرست بگذار و به من بگو.

### ۵. تست‌ها

در `tests/` تست بنویس برای: فیلتر `quality_only` (فهرست زیر حداقل آیتم نیاید، فهرست برگزیده شده بیاید)، پنهان‌شده در `GET /lists` نیاید ولی با slug باز شود، `/lists/featured` ترتیب درست، endpointهای ادمین بدون توکن ادمین `401` بدهند و با توکن کاربر عادی هم رد شوند. همهٔ تست‌های قبلی باید سبز بمانند (الان ۱۰۲ تست).

## فرانت‌اند

### ۱. صفحهٔ ادمین `/admin/lists`

- آیتم جدید در `AdminSidebar.tsx`: «فهرست‌ها و برگزیده‌ها» → `/admin/lists`
- جدول با فیلتر و جستجو (الگوی صفحهٔ `users` را دنبال کن)، ستون‌ها مثل بخش بک‌اند
- هر ردیف: کلید «برگزیده» (toggle)، کلید «پنهان از کشف»، لینک «مشاهدهٔ فهرست» در تب جدید، و فیلد کوتاه یادداشت
- بالای صفحه یک پنل «برگزیده‌های فعلی» با قابلیت تغییر ترتیب (دکمهٔ بالا/پایین کافی است، drag-and-drop لازم نیست) و دکمهٔ برداشتن
- بعد از هر تغییر وضعیت، پیام موفقیت/خطا بده و optimistic update نکن مگر ساده باشد
- فقط برای ادمین (از همان layout محافظت‌شدهٔ `(protected)` استفاده کن)
- ادمین بعد از تغییر باید بتواند صفحهٔ اصلی را تازه ببیند: صفحهٔ اصلی ISR با `revalidate = 1800` است. یک route handler داخل `app/api/admin/` برای `revalidatePath("/")` و `revalidatePath("/lists")` بنویس و بعد از موفقیت PATCH صدایش بزن، یا اگر الگوی فعلی پروژه چیز دیگری است همان را بگیر. به من بگو چه کردی.

### ۲. صفحهٔ اصلی

- `getFeaturedLists(limit)` را به `lib/api.ts` اضافه کن.
- در `app/page.tsx` فهرست برگزیده از `/lists/featured` بیاید (اولین مورد برای `FeaturedList`). اگر هیچ فهرست برگزیده‌ای نبود، به منطق فعلی (پرلایک‌ترین) برگرد، ولی همان فیلتر کیفیت را رعایت کند.
- اگر چند فهرست برگزیده وجود دارد، `FeaturedList` اولی را کامل نشان دهد و زیرش یک ردیف کوچک «برگزیده‌های دیگر» با ListCard بگذار (حداکثر ۳)، یا فقط اولی را نشان بده و بپرس کدام را ترجیح می‌دهم.
- بخش «آخرین فهرست‌ها» حالا چون `quality_only` پیش‌فرض است خودکار تمیز می‌شود؛ مطمئن شو اگر لیستی نماند بخش پنهان شود (رفتار فعلی).
- در `lists-explorer.tsx` و `app/lists/page.tsx` فیلتر کیفیت اعمال شود (چون از همان endpoint می‌خوانند چیز اضافه‌ای لازم نیست، فقط تأیید کن) و روی کارت فهرست‌های برگزیده یک نشان کوچک «برگزیده» (ستاره/نشان طلایی با رنگ `gold` تم) بگذار.

## قوانین و محدودیت‌ها

- هیچ فهرستی را حذف نکن و دادهٔ موجود را تغییر نده. فقط ستون‌های جدید با مقدار پیش‌فرض.
- بدون dependency جدید.
- UI فارسی و RTL و مطابق تم Constellation (`bg`, `ink`, `muted`, `surface`, `border`, `gold`, `teal`). اعداد با `toFaDigits`.
- بعد از اتمام: `pytest` را اجرا کن، `npm run lint` و `npm run build` (یا `tsc --noEmit`) فرانت را بزن، و گزارش بده چه فایل‌هایی عوض شد و migration چه می‌کند. قبل از کامیت، پروژه را با `uvicorn` و `npm run dev` بالا بیاور و حداقل یک بار برگزیده‌کردن و پنهان‌کردن یک فهرست را دستی امتحان کن.
- کامیت‌ها روی `main`، با پیام روشن. push نزن.
