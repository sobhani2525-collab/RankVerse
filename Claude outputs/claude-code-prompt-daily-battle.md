# پرامپت Claude Code: «نبرد روز» (Daily Battle)

همیشه فارسی جواب بده. شاخهٔ جدید نساز و روی `main` کار کن. بدون اجازهٔ من `git push` نزن.
در درخت کاری فایل‌های زیادی `modified` هستند (احتمالاً line ending). به آن‌ها دست نزن و فقط فایل‌های همین کار را کامیت کن.

## هدف

یک جفت فیلم ثابت برای **همهٔ کاربران در هر روز** (به وقت تهران). کاربر رأی می‌دهد، بعد درصد زنده را می‌بیند، استریک روزهای پیاپی‌اش را می‌بیند، نتیجهٔ دیروز را می‌بیند و می‌تواند نتیجه‌اش را به اشتراک بگذارد. این دلیل برگشتن هر روز است و باید با تعداد کاربر کم هم خوب کار کند.

## محدودیت‌های سخت

- هیچ dependency جدید (نه در پایتون، نه در فرانت). `next/og` و هر چیز سنگین‌کنندهٔ Worker ممنوع.
- بدون cron / scheduler. جفتِ هر روز **در اولین درخواست آن روز، به‌صورت lazy** ساخته می‌شود، با قید یکتایی روی تاریخ و مدیریت race.
- منطقهٔ زمانی: ایران از ۱۴۰۱ ساعت تابستانی ندارد، پس از offset ثابت `timezone(timedelta(hours=3, minutes=30))` استفاده کن (نه `zoneinfo`، تا به پکیج `tzdata` وابسته نشویم). «تاریخ نبرد» = تاریخ تقویمی همان offset. همهٔ مرزهای نیمه‌شب را با تست بپوشان (مثلاً ۲۰:۲۹ و ۲۰:۳۱ UTC).
- دسته فقط `movie` (مثل `ThemedBattleService`).

## قبل از شروع، این‌ها را بخوان

- `app/modules/battles/` — `models.py`, `service.py` (`cast_vote`, `_enforce_rate_limit`, `MAX_VOTES_PER_DAY`), `themed.py` (`ThemedBattleService`, `_themes_for`, `_members`, `RELATION_FOR_KIND`, `POOL_SIZE`, `MIN_POOL`)، `router.py` (`get_current_user_optional`)، `elo.py`
- `app/core/redis.py` (`get_redis`)، `app/config.py` (الگوی تنظیمات قابل‌override با env)، `app/modules/auth/dependencies.py`
- ساختار یک ماژول موجود (`app/modules/<name>/` با `models.py, schemas.py, repository.py, service.py, router.py`) و محل ثبت routerها
- ادمین: `app/modules/admin/router.py` (بخش `/lists` و `/lists/featured` به‌عنوان الگو)، `service.py`، و `frontend/app/admin/(protected)/lists/` (`AdminListsManager.tsx`, `page.tsx`)، `_components/AdminSidebar.tsx`
- فرانت: `components/home/BattleArena.tsx` (کامپوننت `Poster`، استایل‌ها)، `components/share/ShareMenu.tsx`، `lib/story-card.ts` (`StoryCardInput`, `renderStoryCard`)، `app/battles/result/page.tsx`، `lib/api.ts`, `lib/types.ts`, `lib/format-number.ts` (`toFaDigits`), `lib/title.ts` (`displayTitle`), `app/page.tsx`
- تست‌ها: `tests/conftest.py`, `tests/test_battles_elo.py`, `tests/test_lists.py` به‌عنوان الگو

اصول پروژه: SQLAlchemy 2.0 (`Mapped/mapped_column`)، UUID، async، ثابت‌ها در `config.py`، دسترسی و مالکیت فقط سمت سرور.

## بک‌اند: ماژول جدید `app/modules/daily_battle/`

### مدل‌ها + migration Alembic

`daily_battles`:
- `id` UUID، `battle_date` (Date، **یکتا**، تاریخ تهرانی)، `left_id` و `right_id` (FK به `entities`، CHECK که متفاوت‌اند)
- `theme_kind` (`genre|decade|director|pair`) و `theme_value` برای نمایش دلیل جفت‌شدن
- `left_votes`, `right_votes` (Integer، پیش‌فرض ۰، شمارندهٔ denormalized)
- `source` (`auto|admin`), `created_by_admin_id` (nullable)، `created_at`

`daily_battle_votes`:
- `id`, `daily_battle_id` (FK، ondelete CASCADE)، `user_id` (nullable FK به users)، `guest_id` (nullable، رشتهٔ کوتاه)، `choice` (`left|right`)، `created_at`
- CHECK که دقیقاً یکی از `user_id` یا `guest_id` پر است
- یکتایی: `(daily_battle_id, user_id)` و `(daily_battle_id, guest_id)` (partial unique index)

Migration تمیز، برگشت‌پذیر، و با سر فعلی Alembic هم‌خوان.

### انتخاب خودکار جفت (`get_or_create_today`)

اگر برای تاریخ امروز ردیفی نبود:
1. نامزدها: فیلم‌هایی که پوستر و `title_fa` دارند و در بالاترین N امتیاز (`computed_score`) هستند (`daily_battle_pool_size`، پیش‌فرض ۴۰۰).
2. یک seed تصادفی ولی **قطعی بر اساس تاریخ** (`random.Random(date.toordinal())`) انتخاب کن تا دو سرور همزمان به یک جفت برسند.
3. حریف را با **همان منطق موضوع‌های `themed.py`** (هم‌ژانر، هم‌دهه یا هم‌کارگردان) پیدا کن، آن‌ها را دوباره‌نویسی نکن. ELO دو فیلم (از `entity_elo_scores`، پیش‌فرض ۱۲۰۰ اگر نداشتند) در پنجرهٔ `daily_battle_elo_window` (پیش‌فرض ۱۵۰) باشد؛ اگر پیدا نشد پنجره را تدریجی باز کن.
4. هیچ‌کدام از دو فیلم در `daily_battle_no_repeat_days` (پیش‌فرض ۶۰) روز اخیر در نبرد روز نبوده باشند.
5. اگر باز هم پیدا نشد، ساده‌ترین جفت معتبر (حتی بدون شرط ELO)؛ فقط اگر هیچ جفتی ممکن نبود `None` برگردان تا فرانت بخش را پنهان کند، نه خطا.
6. درج با `INSERT` و گرفتن `IntegrityError` روی `battle_date`؛ در race، rollback و دوباره `SELECT` همان ردیف برنده.

اگر ادمین قبلاً برای آن تاریخ جفت گذاشته باشد (`source=admin`)، همان استفاده می‌شود.

### API عمومی (prefix `/daily-battle`)

شناسهٔ مهمان: هدر `X-Guest-Id` (UUID که کلاینت در localStorage می‌سازد). اعتبارسنجی فرمت و طول. کاربر لاگین‌شده همیشه بر مهمان اولویت دارد.

`GET /daily-battle/today` (احراز هویت اختیاری):
- `battle_date`, `daily_battle_id`, `left` و `right` (id, slug, title, title_fa, poster_path, year, computed_score)، `theme` (kind/value)، `my_choice` (`left|right|null`)
- `results`: `{left_votes, right_votes, total}` **فقط اگر کاربر امروز رأی داده؛ وگرنه `null`** (جلوگیری از اثر دنباله‌روی). این را سمت سرور اعمال کن.
- `seconds_until_next` تا نیمه‌شب تهران
- `streak`: تعداد روزهای پیاپی رأی (فقط کاربر لاگین‌شده؛ برای مهمان `null`). امروز اگر هنوز رأی نداده، استریک تا دیروز حساب شود و نشکند. محاسبه از تاریخ‌های رأی ۶۰ روز اخیر در پایتون.
- `previous`: نتیجهٔ دیروز (دو فیلم، رأی‌ها، برنده) یا `null`
- پاسخ همیشه `Cache-Control: no-store`.

`POST /daily-battle/vote`، بدنه `{daily_battle_id, choice}`:
- رد کن اگر `daily_battle_id` مال امروز نیست (۴۰۹) یا choice نامعتبر (۴۲۲).
- **idempotent:** اگر قبلاً رأی داده، چیزی دوباره شمرده نشود؛ همان وضعیت فعلی را برگردان.
- شمارنده را اتمیک بالا ببر (`UPDATE ... SET left_votes = left_votes + 1`).
- **مهمان:** محدودیت نرخ با Redis روی IP (کلید مثل `dbv:<تاریخ>:<ip>`، `INCR` + `EXPIRE` حدود ۲ روز، سقف `daily_battle_guest_ip_limit` پیش‌فرض ۲۰ رأی در روز). IP را از `CF-Connecting-IP` سپس `X-Forwarded-For` (اولین مقدار) بخوان. اگر Redis در دسترس نبود، fail-open با لاگ هشدار (مثل رفتار rate limiter ادمین). بدون `X-Guest-Id` معتبر → ۴۰۰.
- **کاربر لاگین‌شده:** اول رأی روز را ثبت و **commit** کن؛ بعد با `BattleService.cast_vote` همان رأی را به ELO بفرست (`left_item`/`right_item` همان جفت، winner مطابق choice). اگر `cast_vote` خطا داد (مثلاً ۴۲۹ سقف روزانه)، رأی نبرد روز **از دست نرود**؛ خطا را بگیر و فقط لاگ کن. مهمان‌ها فقط در شمارندهٔ روز حساب می‌شوند، نه ELO.
- پاسخ: همان شکل `GET /today` با `results` آشکار.

### endpointهای ادمین (`get_current_admin`)

زیر `/admin/daily-battles` (الگوی `/admin/lists`):
- `GET` — فهرست صفحه‌بندی‌شده: تاریخ، دو فیلم، موضوع، `source`، رأی‌ها و درصد. شامل ۱۴ روز آینده و گذشته.
- `POST` — ایجاد جفت برای یک تاریخ آینده (`battle_date`, `left_id`, `right_id`, `theme` اختیاری). ۴۰۹ اگر آن تاریخ ردیف دارد یا تاریخ گذشته/امروزِ دارای رأی است.
- `PUT /{id}` — تغییر جفت یا تاریخ فقط اگر **هنوز هیچ رأیی ندارد**؛ وگرنه ۴۰۹.
- `DELETE /{id}` — فقط روزهای آینده و بدون رأی (برای بازگشت به انتخاب خودکار).
- اگر سازوکار audit log برای اکشن‌های ادمین وجود دارد ثبت کن؛ اگر فقط placeholder است، فقط `logger.info` و به من بگو.

### تنظیمات (`app/config.py`، قابل‌override با env)

`daily_battle_pool_size=400`, `daily_battle_elo_window=150`, `daily_battle_no_repeat_days=60`, `daily_battle_guest_ip_limit=20`.

### تست‌ها (pytest)

مرزهای تاریخ تهران؛ ساخت lazy و idempotent، و شبیه‌سازی race (دو بار فراخوانی همزمان یک ردیف می‌دهد)؛ انتخاب خودکار (تکراری‌های اخیر حذف، قطعی‌بودن با seed تاریخ، fallback وقتی جفتی نیست)؛ رأی دو بار نشمرد؛ `results` قبل از رأی `null` و بعد آشکار؛ رأی مهمان فقط شمارنده را عوض کند و ELO را نه؛ رأی کاربر لاگین‌شده هم شمارنده و هم ELO را عوض کند؛ شکست `cast_vote` رأی روز را حذف نکند؛ سقف IP مهمان؛ استریک (پیاپی، شکسته‌شدن، حالت «امروز هنوز رأی نداده»)؛ endpointهای ادمین بدون توکن ادمین ۴۰۱ و با توکن کاربر عادی رد، و قاعدهٔ «بعد از اولین رأی تغییر ممنوع». همهٔ تست‌های قبلی سبز بمانند.

## فرانت‌اند

### ۱. کامپوننت `components/home/DailyBattle.tsx` (Client)

- داده را با `fetch` سمت کلاینت و `cache: "no-store"` از `/daily-battle/today` بگیر (صفحهٔ اصلی ISR است؛ این بخش نباید کهنه شود). توابع را در `lib/api.ts` و نوع‌ها را در `lib/types.ts` اضافه کن. `X-Guest-Id` را از localStorage بخوان یا بساز؛ همهٔ دسترسی‌های storage داخل `try/catch` باشد و بدون storage هم صفحه کار کند.
- ظاهر: `SectionHeading` با kicker «Battle of the day» و عنوان «نبرد امروز»، تاریخ شمسی امروز، **دو پوستر بزرگ** کنار هم با VS (همان استایل `BattleArena`، هر پوستر یک دکمه با `aria-label` فارسی)، زیر هر کدام عنوان با `displayTitle` و سال، و خط دلیل جفت‌شدن (مثل «هر دو هم‌ژانرند: درام»؛ منطق `reasonOf` را اگر به‌صورت مشترک در `lib/battle-theme.ts` هست از آنجا بگیر).
- **قبل از رأی:** نتیجه نشان داده نشود. زیر پوسترها شمارش معکوس «نبرد بعدی تا ۰۵:۱۲:۴۰» (از `seconds_until_next` + تایمر محلی؛ وقتی به صفر رسید دوباره fetch کن).
- **بعد از رأی:** نوار درصدی انیمیشنی (احترام به `prefers-reduced-motion`) با اعداد فارسی، تعداد کل رأی، انتخاب خود کاربر با قاب طلایی، و جملهٔ «با اکثریت هم‌نظری» / «از اقلیتی»؛ اگر `total == 1` فقط «تو اولین رأی‌دهنده‌ای».
- اگر `total` خیلی کم است (مثلاً کمتر از ۵) درصد را با برچسب «تعداد رأی کم است» نشان بده تا گمراه‌کننده نباشد.
- چیپ استریک «N روز پیاپی» (فقط وقتی `streak` عدد است).
- نوار کوچک «نتیجهٔ دیروز» با برنده.
- دکمهٔ **اشتراک** با `ShareMenu` (`variant="button"`): `url = absoluteUrl("/battles/daily")`، متن مثل `امروز در «نبرد روز» به «<فیلم>» رأی دادم؛ <درصد>٪ با من موافق‌اند. تو چه؟`، و `getImage` برای کارت استوری از `renderStoryCard`. **فایل `lib/story-card.ts` را بخوان** و `StoryCardInput` را حداقلی و سازگار با عقب گسترش بده (مثلاً فیلدهای اختیاری برای عنوان/زیرعنوان) به‌جای بازنویسی؛ کارت نتیجهٔ نبرد فعلی نباید خراب شود. روی کارت: «نبرد روز»، تاریخ، فیلم انتخابی با پوستر، و درصد.
- مهمان بدون ورود رأی می‌دهد. بعد از رأی یک پیام کوچک: «با ورود، رأی‌هایت در رتبه‌بندی و استریکت ثبت می‌شود» با دکمهٔ ورود (`openLoginModal`، مثل `BattleArenaBody`). برای کاربر لاگین‌شده نیاز به این پیام نیست.
- حالت‌ها: skeleton هنگام بارگذاری، خطای شبکه با «تلاش دوباره»، و اگر پاسخ «نبردی برای امروز نیست» بود کل بخش پنهان شود (بی‌سروصدا).
- اعداد با `toFaDigits`، RTL، تم Constellation (`bg`, `ink`, `muted`, `surface`, `border`, `gold`, `teal`).

### ۲. جای نمایش

- صفحهٔ اصلی (`app/page.tsx`): `<DailyBattle />` را **بلافاصله بعد از `HomeHero`** بگذار (قبل از `KnowledgeGraphExplorer`)، بدون اینکه ISR یا fetchهای سمت سرور فعلی را عوض کنی.
- صفحهٔ جدید `app/battles/daily/page.tsx` (`/battles/daily`) که همین کامپوننت را بزرگ‌تر نشان می‌دهد. لینک اشتراک به این صفحه می‌رود. `metadata` ایستا با عنوان «نبرد روز | سینماگزین»، `robots: { index: false, follow: true }`. (OG تصویر پویا نساز.)
- در `components/Header.tsx` لینک «نبرد روز» (یا اگر منو شلوغ است، زیر «نبردها») اضافه کن. ببین چه لینکی الان برای نبرد وجود دارد (کامیت `71eef3b` «header link» اضافه کرده) و با آن هماهنگ باش.

### ۳. پنل ادمین

- آیتم جدید در `AdminSidebar.tsx`: «نبرد روز» → `/admin/daily-battles`.
- صفحه (الگوی `lists/page.tsx` + یک `Manager` کلاینت): جدول روزهای گذشته و آینده با فیلم‌ها، موضوع، منبع، رأی‌ها و درصد.
- فرم «برنامه‌ریزی نبرد»: تاریخ (آینده) و جستجوی دو فیلم (از همان endpoint/کامپوننت جستجوی موجود ادمین یا جستجوی عمومی استفاده کن؛ چیز جدید نساز اگر چیزی هست)، با خطای فارسی روشن.
- دکمهٔ حذف برای روزهای آینده و بدون رأی («بازگشت به انتخاب خودکار»).
- ردیف‌هایی که رأی دارند غیرقابل‌ویرایش و با توضیح کوتاه نمایش داده شوند.

## قوانین و کیفیت

- بدون dependency جدید، بدون `next/og`. هیچ داده یا جدول موجود تغییر نکند؛ فقط دو جدول جدید.
- متن‌های UI فارسی. خطاهای API فارسی یا هماهنگ با الگوی فعلی.
- بعد از اتمام: `pytest` (همه سبز)، `npm run lint` و `npm run build` (یا `tsc --noEmit`)، و در صورت امکان `opennextjs-cloudflare build` برای اطمینان از اینکه حجم Worker عوض نشده است.
- سرورها (`uvicorn` و `npm run dev`) را بالا بیاور و **دستی امتحان کن**، و صادقانه گزارش بده چه چیزی را واقعاً امتحان کردی و چه چیزی را نه:
  1. مهمان (بدون ورود): صفحهٔ اصلی را باز کن، رأی بده، درصد را ببین، صفحه را reload کن (رأی تکراری نشمرد و انتخابت بماند).
  2. کاربر لاگین‌شده: رأی بده و چک کن ELO فیلم‌ها تغییر کرد و استریک ۱ شد.
  3. دکمهٔ اشتراک و دانلود کارت استوری: متن فارسی و درصد روی تصویر درست است؟
  4. ادمین: یک جفت برای فردا برنامه‌ریزی کن، بعد حذفش کن.
  5. صفحهٔ `/battles/daily` و لینک منو.
- کامیت‌ها روی `main` با پیام روشن. push نزن.
- در گزارش پایانی بگو: چه فایل‌هایی عوض شد، migration چه می‌کند، و هر جایی که مجبور شدی از دستورالعمل فاصله بگیری (مثلاً شکل جستجوی ادمین یا تغییر `StoryCardInput`).
