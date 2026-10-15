# پرامپت‌های مرحله‌به‌مرحلهٔ «کاربران و جامعه» (/admin/users)

هر مرحله را جداگانه به Claude Code بده، بعد از اتمام تست کن، و بعد برو مرحلهٔ بعد.
مراحل ۱ تا ۵ = «اصلی و ضروری». مراحل بعدی (پایین فایل) بعداً.

ترتیب: ۱ بک‌اند پایه ← ۲ لیست کاربران ← ۳ جزئیات کاربر ← ۴ عملیات گروهی و Export ← ۵ صفحهٔ Audit Log

---

## پرامپت ۱ — بک‌اند: مدل، Audit و APIهای مدیریت کاربر

````
همیشه فارسی جواب بده. طبق CLAUDE.md پروژه رفتار کن (شاخه نساز؛ روی main).

## هدف
بک‌اند بخش «کاربران و جامعه» پنل ادمین را بساز. صفحهٔ فعلی `frontend/app/admin/(protected)/users/page.tsx` فقط PlaceholderPage است. در این مرحله فقط بک‌اند + migration + تست؛ فرانت‌اند دست نخورد.

## قبل از شروع بخوان
- `app/modules/users/` (models, repository, service, schemas, router)
- `app/modules/admin/` (router, service, repository, dependencies, schemas) و الگوی `AdminListService` و `GET /admin/lists`
- `app/modules/auth/` (dependencies، login، reset رمز، verify ایمیل) و `app/core/security.py`
- `app/core/schemas.py` (envelope/Meta)، `app/core/exceptions.py`
- مدل‌های lists (UserList, ListComment, ListLike), ratings/favorites در users/models.py
- `tests/test_list_curation.py` و `tests/conftest.py` به‌عنوان الگوی تست
- `alembic/versions/` برای هم‌خوانی head فعلی

همان سبک پروژه: SQLAlchemy 2.0 با Mapped/mapped_column، async، ساختار models/schemas/repository/service/router، پاسخ با `envelope`. همهٔ endpointها پشت `get_current_admin`. هرگز hashed_password یا توکن در پاسخ نیاید.

## ۱) تغییر مدل `users` (Migration برگشت‌پذیر)
ستون‌های جدید:
- `last_login_at` (DateTime tz, nullable, index)
- `blocked_at` (nullable)، `blocked_reason` (String 300, nullable)، `blocked_by_admin_id` (UUID nullable، بدون FK سخت اگر چرخه می‌سازد)
- `deleted_at` (nullable, index) برای Soft delete
- `admin_note` (Text, nullable) — یادداشت داخلی ادمین

قانون وضعیت (وضعیت از ستون‌ها مشتق شود، ستون جدا برایش نساز):
- `deleted` اگر deleted_at دارد؛ `blocked` اگر is_active=false؛ در غیر این صورت `active`.
- «تأیید نشده» فقط یک فیلتر جدا بر پایهٔ email_verified_at است، نه وضعیت.

ایندکس‌ها: created_at، last_login_at، deleted_at، و ایندکس جستجوی متنی/trigram روی email, username, display_name (اگر pg_trgm در پروژه فعال است همان الگوی search موجود را استفاده کن).

## ۲) اتصال به Auth موجود
- در login موفق کاربر `last_login_at` را آپدیت کن (کم‌هزینه، بدون کند کردن login).
- کاربر مسدود/حذف‌شده نباید login کند و توکن‌های قبلی‌اش هم کار نکند. `get_current_user` و `get_current_user_optional` الان `is_active` را چک می‌کنند؛ شرط `deleted_at IS NULL` را هم اضافه کن. پیام خطا مفهوم و بدون لو دادن جزئیات.
- پروفایل عمومی/فهرست‌های کاربر حذف‌شده نباید در سایت عمومی نمایش داده شود (404 یا پنهان). بررسی کن کدام endpointها این را لازم دارند و کمترین تغییر ممکن را بده. فهرست‌ها و رای‌ها حذف نمی‌شوند.

## ۳) جدول Audit Log (append-only)
جدول `admin_audit_logs`: id, admin_id, admin_email (snapshot), action (مثل `user.block`), target_type, target_id, `before` JSONB, `after` JSONB, ip, user_agent, created_at. ایندکس روی (target_type, target_id), action, created_at, admin_id.
- یک `AuditLogService.record(...)` قابل استفادهٔ مجدد بنویس (بعداً بقیهٔ اکشن‌های ادمین هم از آن استفاده می‌کنند).
- هیچ endpoint ویرایش/حذف برای آن نساز.
- فقط فیلدهای تغییرکرده را در before/after بنویس و داده‌های حساس (hash، توکن) را هرگز.
- ip را از `X-Forwarded-For` (که پروکسی Next می‌فرستد) بخوان و با الگوی `client_ip` موجود هماهنگ کن.

## ۴) Endpointها (پیشوند `/admin/users`)
- `GET /admin/users` — query: `q` (جستجو روی email/username/display_name/id), `status` (active|blocked|deleted|all؛ پیش‌فرض بدون deleted), `email_verified` (bool), `created_from/created_to`, `last_login_from/last_login_to`, `never_logged_in` (bool), `sort` (created_at|last_login_at|email|username|ratings_count|lists_count) و `order`, `page`, `page_size` (۱ تا ۱۰۰). خروجی هر ردیف: id, email, username, display_name, avatar_key, status, email_verified, created_at, last_login_at, ratings_count, lists_count, comments_count. شمارنده‌ها را با subquery/join تجمیعی بگیر، نه N+1. `meta.total` را برگردان.
- `GET /admin/users/stats` — total, new_7d, new_30d (با درصد تغییر نسبت به دورهٔ قبل)، active_today (بر اساس last_login_at), blocked, unverified, deleted. با کش کوتاه redis (۶۰ ثانیه) اگر الگوی کش پروژه اجازه می‌دهد.
- `GET /admin/users/{id}` — جزئیات کامل + شمارنده‌ها (ratings, favorites, lists, comments, battle votes اگر مدلش هست) + admin_note + مشخصات block (reason, at, by).
- `PATCH /admin/users/{id}` — فقط display_name, bio, email, username, admin_note؛ بررسی یکتایی email/username و پیام خطای مناسب؛ ثبت diff در audit.
- `POST /admin/users/{id}/block` (body: reason اجباری) و `/unblock`
- `DELETE /admin/users/{id}` (soft delete) و `POST /admin/users/{id}/restore`
- `POST /admin/users/{id}/verify-email` — تأیید دستی ایمیل
- `POST /admin/users/{id}/send-password-reset` — از همان flow بازیابی رمز موجود در UserService/email استفاده کن، منطق جدید ننویس.
- `GET /admin/users/{id}/activity` — صفحه‌بندی‌شده: آخرین ratingها، favoriteها، فهرست‌ها و کامنت‌ها (عنوان موجودیت/فهرست + زمان)
- `GET /admin/users/{id}/audit-logs` — رویدادهای audit مربوط به همین کاربر

قوانین ایمنی: عملیات روی خطای not found/تکراری پیام استاندارد بدهد؛ block/delete یک کاربر که از قبل در آن وضعیت است idempotent باشد؛ rate limit ساده برای عملیات نوشتن با `app/core/rate_limit.py` (الگوی change_password).

## ۵) تست
تست‌های pytest (الگوی tests/test_list_curation.py): فیلتر و جستجو و مرتب‌سازی و صفحه‌بندی، stats، block/unblock (و اینکه کاربر مسدود دیگر با توکن قبلی وارد نمی‌شود)، soft delete/restore، یکتایی email/username در PATCH، ثبت audit با before/after، عدم وجود hashed_password در هر پاسخ، عدم دسترسی بدون admin token.

## روش کار
اول برنامهٔ کوتاه فایل‌های قابل تغییر را بده، بعد پیاده‌سازی کن. migration را اجرا و `pytest` را بزن و خطاها را رفع کن. در پایان گزارش بده چه شد و چه فرضیاتی داشتی. تا تست‌ها سبز نشده تمام نکن.
````

---

## پرامپت ۲ — فرانت‌اند: صفحهٔ لیست کاربران

````
همیشه فارسی جواب بده. طبق CLAUDE.md رفتار کن.

## هدف
صفحهٔ `/admin/users` را به‌جای PlaceholderPage پیاده کن. APIهای بک‌اند در مرحلهٔ قبل ساخته شده‌اند (`/admin/users`, `/admin/users/stats`, block/unblock/delete/restore).

## قبل از شروع بخوان
- `frontend/app/admin/(protected)/lists/page.tsx` و `AdminListsManager.tsx` (الگوی UI و فراخوانی)
- `frontend/app/api/admin/lists/[[...path]]/route.ts` (پروکسی cookie→Bearer)
- `frontend/app/admin/(protected)/_components/AdminSidebar.tsx`, `layout.tsx`
- `frontend/tailwind.config.*` (رنگ‌های bg/surface/border/gold/teal/violet)، `frontend/lib/format-number.ts` (toFaDigits) و هر util تاریخ شمسی موجود در پروژه
- پکیج shadcn در پروژه نیست؛ هیچ UI library جدید اضافه نکن (مگر ضروری و با توضیح). از Tailwind و توکن‌های رنگی موجود استفاده کن و ظاهر را با `AdminListsManager` یکدست نگه دار. RTL کامل.

## ۱) پروکسی
`frontend/app/api/admin/users/[[...path]]/route.ts` را مثل پروکسی lists بساز (GET/POST/PATCH/PUT/DELETE). IP و User-Agent کلاینت را با هدرهای `X-Forwarded-For`/`User-Agent` به بک‌اند منتقل کن تا audit درست ثبت شود. نیازی به revalidate نیست.

## ۲) ساختار فایل
`users/page.tsx` (server، فقط عنوان و رندر مدیر) + `users/AdminUsersManager.tsx` (client) + کامپوننت‌های کوچک مشترک در `_components/` مثل `StatCard`, `StatusBadge`, `ConfirmDialog`, `Toast` (اگر در پروژه toast وجود دارد همان را استفاده کن)، `Pagination`. این کامپوننت‌ها باید در مرحله‌های بعد (جزئیات، audit-log) دوباره استفاده شوند.

## ۳) قابلیت‌ها
- **کارت‌های آماری** بالای صفحه از `/stats`: کل کاربران، جدید ۷ و ۳۰ روز (با درصد تغییر و رنگ مثبت/منفی)، فعال امروز، مسدود، تأیید نشده. اسکلت loading.
- **تب‌های سریع** با شمارنده: همه | فعال | مسدود | تأیید نشده | حذف‌شده‌ها.
- **جستجو** debounce ۳۰۰ms روی نام/ایمیل/username/ID.
- **فیلترها**: وضعیت، تأیید ایمیل، بازه تاریخ عضویت، بازه آخرین ورود، «هرگز وارد نشده». نمایش فیلترهای فعال به‌صورت chip با حذف تکی و «پاک کردن همه».
- **همهٔ فیلتر/مرتب‌سازی/صفحه در URL query** ذخیره شود (با refresh و اشتراک لینک حفظ شود). از `useSearchParams` + `router.replace` استفاده کن.
- **جدول**: ستون‌ها: آواتار+نام نمایشی و username، ایمیل (ltr)، وضعیت (badge)، تأیید ایمیل، تعداد رتبه‌ها/فهرست‌ها/کامنت‌ها، تاریخ عضویت، آخرین ورود (نسبی مثل «۳ روز پیش» + tooltip تاریخ کامل شمسی/میلادی)، عملیات. مرتب‌سازی با کلیک روی هدر ستون‌ها. Sticky header. ردیف کلیک‌پذیر به `/admin/users/[id]`.
- **صفحه‌بندی** سمت سرور با انتخاب ۱۰/۲۵/۵۰/۱۰۰ و متن «نمایش x تا y از z».
- **منوی عملیات هر ردیف**: مشاهده، مسدود/رفع مسدودیت، ارسال لینک بازیابی رمز، حذف/بازیابی.
- **مسدودسازی**: Dialog با فیلد «دلیل» اجباری. **حذف**: Dialog تأیید که ادمین باید username کاربر را تایپ کند. بعد از موفقیت toast و refresh لیست بدون پرش اسکرول؛ برای block/unblock Undo toast.
- **حالات**: skeleton loading، empty state گویا (با پیشنهاد پاک کردن فیلتر)، error state با دکمهٔ «تلاش مجدد». دکمه‌ها هنگام ارسال disabled شوند.
- **Responsive**: در موبایل جدول به کارت تبدیل شود. تاریخ شمسی و ارقام فارسی با util موجود.
- دسترس‌پذیری: aria-label روی دکمه‌های آیکونی، فوکوس درست در dialogها، بستن با Escape.

## ۴) نکات
- منو/لینک سایدبار «کاربران و جامعه» همان `/admin/users` است؛ تغییر نده.
- متن‌ها را در یک شیء ثابت بالای فایل جمع کن (برای i18n آینده) ولی سیستم ترجمهٔ جدید نساز.
- آنچه در حال حاضر بک‌اند ندارد (نقش‌ها، موبایل، 2FA) را در UI نیاور.

## روش کار
اول فایل‌هایی که می‌سازی/تغییر می‌دهی را فهرست کن. بعد پیاده‌سازی، سپس `npm run build` و `npm run lint` را در `frontend` بزن و خطاها را رفع کن. اگر سرور dev در دسترس بود صفحه را باز و با داده واقعی بررسی کن. در پایان گزارش بده.
````

---

## پرامپت ۳ — فرانت‌اند: صفحهٔ جزئیات کاربر `/admin/users/[id]`

````
همیشه فارسی جواب بده. طبق CLAUDE.md رفتار کن.

## هدف
صفحهٔ جزئیات و مدیریت یک کاربر را بساز. از کامپوننت‌های مشترک مرحلهٔ قبل (`StatusBadge`, `ConfirmDialog`, toast, ...) و پروکسی `/api/admin/users/...` استفاده کن، چیزی را از صفر تکرار نکن. در صورت نیاز endpointهای کوچک ناقص بک‌اند را اضافه کن.

## ساختار
`frontend/app/admin/(protected)/users/[id]/page.tsx` (+ `UserDetail.tsx` client). لینک «بازگشت به لیست» با حفظ query فیلترهای قبلی. اگر کاربر پیدا نشد صفحهٔ 404 ادمین.

## هدر صفحه
آواتار، نام نمایشی، username، ایمیل (ltr + دکمه کپی)، badge وضعیت، تاریخ عضویت، آخرین ورود. دکمه‌های اکشن: ویرایش، مسدود/رفع مسدودیت (با دلیل)، ارسال لینک بازیابی رمز، تأیید دستی ایمیل، حذف (تایپ username)/بازیابی. اگر مسدود است بنری با دلیل و زمان و ادمین مسدودکننده نشان بده.

## تب‌ها (state تب در query `?tab=`)
۱. **نمای کلی**: کارت‌های آمار (تعداد رتبه‌ها، علاقه‌مندی‌ها، فهرست‌ها، کامنت‌ها، رای‌های نبرد)، bio، آخرین فعالیت‌ها به‌صورت Timeline کوتاه.
۲. **ویرایش**: فرم display_name, bio, username, email با اعتبارسنجی کلاینت و نمایش خطای یکتایی از سرور، هشدار تغییرات ذخیره‌نشده هنگام خروج، disabled شدن دکمه هنگام ذخیره.
۳. **فعالیت جامعه**: زیرتب‌های رتبه‌ها | علاقه‌مندی‌ها | فهرست‌ها | کامنت‌ها، هر کدام با صفحه‌بندی (از `GET /admin/users/{id}/activity`). لینک به صفحهٔ عمومی موجودیت/فهرست در تب جدید. برای کامنت‌ها اگر حذف کامنت در پروژه از قبل وجود دارد دکمهٔ حذف نشان بده (فقط در صورت وجود منطق آماده).
۴. **یادداشت داخلی ادمین**: ویرایش `admin_note` با ذخیره صریح؛ فقط برای ادمین‌ها نمایش داده شود.
۵. **تاریخچهٔ مدیریتی (Audit)**: از `GET /admin/users/{id}/audit-logs`: چه کسی، چه کاری، کی، و diff قبل/بعد قابل باز شدن.

## نکات
- Loading skeleton، error با retry، RTL و ارقام فارسی، responsive.
- پس از هر اکشن داده‌ها revalidate شوند و toast نمایش داده شود.
- فیلدهایی که بک‌اند ندارد (نقش، 2FA، نشست‌ها) را نساز.

## روش کار
فهرست فایل‌ها، پیاده‌سازی، `npm run build` و `npm run lint`، و در صورت امکان بررسی واقعی در مرورگر. گزارش پایانی بده.
````

---

## پرامپت ۴ — عملیات گروهی (Bulk) و Export

````
همیشه فارسی جواب بده. طبق CLAUDE.md رفتار کن.

## هدف
به لیست `/admin/users` عملیات گروهی و خروجی اضافه کن (بک‌اند + فرانت).

## بک‌اند
- `POST /admin/users/bulk`: body شامل `action` (block | unblock | delete | restore | verify_email)، و یکی از: `ids` (حداکثر ۵۰۰) یا `filter` (همان پارامترهای فیلتر لیست برای «انتخاب همهٔ نتایج فیلتر شده»)، و `reason` (برای block اجباری). خروجی: `{succeeded: [...], failed: [{id, reason}], skipped: [...]}`. در یک تراکنش منطقی ولی خطای یک ردیف بقیه را نشکند.
- برای هر کاربر تحت‌تأثیر یک ردیف audit ثبت کن (action با پسوند `bulk` در metadata).
- `GET /admin/users/export`: با همان فیلترهای لیست، فرمت `csv` (و `json`)، ستون‌های انتخابی. استریم کن (StreamingResponse) تا حافظه پر نشود، سقف سطر منطقی (مثلاً ۵۰٬۰۰۰) با پیام روشن. CSV با BOM UTF-8 تا فارسی در Excel درست باز شود. هرگز hash/توکن در خروجی نباشد و ایمیل‌ها در خروجی همان‌طور که هستند باشند. ثبت یک رویداد audit برای هر export.
- تست‌ها: bulk با ids و با filter، گزارش موفق/ناموفق، export با فیلتر، نبودن فیلدهای حساس.

## فرانت‌اند
- checkbox هر ردیف + «انتخاب همهٔ صفحه» + بنر «همهٔ n نتیجهٔ فیلترشده را انتخاب کن» (حالت filter).
- نوار شناور bulk actions پایین صفحه با تعداد انتخاب‌شده: مسدود، رفع مسدودیت، تأیید ایمیل، حذف، خروجی گرفتن.
- Dialog تأیید با تعداد کاربران تحت‌تأثیر؛ برای حذف/مسدودسازی گروهی تایپ کلمهٔ تأیید (مثلاً تعداد) لازم باشد؛ بعد از اجرا گزارش «x موفق، y ناموفق» با لیست دلیل خطاها.
- دکمهٔ Export در هدر لیست: انتخاب CSV/JSON و «فقط انتخاب‌شده‌ها یا همهٔ نتایج فعلی». دانلود از طریق پروکسی Next (فایل را stream کن، توکن به کلاینت نرسد).
- انتخاب‌ها با تغییر فیلتر/صفحه به‌درستی ریست یا حفظ شوند (تصمیمت را بنویس).

## روش کار
فهرست فایل‌ها، پیاده‌سازی، `pytest`، `npm run build` و `npm run lint`، گزارش پایانی.
````

---

## پرامپت ۵ — صفحهٔ Audit Log (`/admin/audit-log`)

````
همیشه فارسی جواب بده. طبق CLAUDE.md رفتار کن.

## هدف
جدول `admin_audit_logs` و `AuditLogService.record` در مرحلهٔ ۱ ساخته شده. حالا صفحهٔ `/admin/audit-log` (فعلاً PlaceholderPage) را کامل کن و اکشن‌های موجود ادمین را هم به audit وصل کن.

## بک‌اند
- `GET /admin/audit-logs`: فیلتر `admin_id`, `action` (چندتایی)، `target_type`, `target_id`, بازهٔ تاریخ، جستجوی متنی روی ایمیل ادمین/target_id، مرتب‌سازی جدیدترین‌اول، صفحه‌بندی. بدون هیچ endpoint ویرایش یا حذف.
- `GET /admin/audit-logs/export` (CSV با BOM، استریم).
- اکشن‌های موجود را به `AuditLogService.record` وصل کن: کوراسیون فهرست‌ها (`app/modules/admin/service.py` → AdminListService)، نبرد روز (`app/modules/daily_battle/admin_service.py`)، ورود موفق ادمین و تغییر رمز ادمین. تغییر رفتار فعلی ممنوع؛ فقط ثبت رویداد اضافه شود. before/after فقط فیلدهای تغییرکرده.
- تست: ثبت رویداد برای هر اکشن، فیلترها، append-only بودن.

## فرانت‌اند
- پروکسی `/api/admin/audit-logs/[[...path]]` و صفحهٔ کامل با کامپوننت‌های مشترک: جدول (زمان شمسی، ادمین، اکشن به‌صورت badge فارسی‌شده، هدف با لینک به صفحهٔ مربوط مثل `/admin/users/[id]`، IP)، فیلترها با chip و ذخیره در URL، صفحه‌بندی، ردیف قابل باز شدن برای نمایش JSON diff قبل/بعد (قرمز/سبز)، دکمهٔ Export.
- یک نگاشت مرکزی `action → برچسب فارسی` بساز.
- skeleton/empty/error و responsive.

## روش کار
فهرست فایل‌ها، پیاده‌سازی، `pytest`، `npm run build`/`lint`، گزارش پایانی.
````

---

## مراحل بعدی (بعد از تثبیت ۱ تا ۵)

۶. **نقش‌ها و دسترسی ادمین‌ها (RBAC)**: الان `admin_accounts.role` فقط یک رشته با مقدار `super_admin` است. نقش‌های Admin/Moderator/Support، ماتریس permission، صفحهٔ `/admin/roles` و guard سمت بک‌اند و فرانت.
۷. **نشست‌ها و امنیت کاربر**: توکن‌ها الان stateless JWT هستند؛ برای «خروج از همهٔ نشست‌ها» و تاریخچهٔ ورود نیاز به `token_version` و جدول login_events دارد؛ قفل خودکار بعد از N ورود ناموفق.
۸. **تعلیق موقت** (`suspended_until`) با job خودکار رفع تعلیق.
۹. **Re-authentication ادمین** (تأیید رمز) برای حذف/Impersonate.
۱۰. **Impersonate** با بنر دائمی و محدودیت زمانی.
۱۱. **ارسال ایمیل تکی/گروهی** با قالب و متغیر.
۱۲. **Import از CSV** با Dry-run و گزارش خطا.
۱۳. **Saved Views، مخفی‌سازی ستون‌ها، Command Palette، Sparkline در کارت‌های آمار**.
