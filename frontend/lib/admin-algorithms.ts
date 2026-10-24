/** Admin algorithms page: /admin/algorithms/* (app/modules/admin/algorithms_schemas.py). */

export interface AlgorithmParam {
  group: "ranking" | "elo" | "taste" | "lists" | "daily_battle";
  key: string;
  env: string | null;
  value: number | string;
}

export interface RankingTypeHealth {
  entity_type: "movie" | "tv_series";
  total: number;
  ranked: number;
  with_user_votes: number;
  with_battles: number;
  histogram: number[]; // 10 one-point buckets, 0-1 .. 9-10
  last_recompute_at: string | null;
  oldest_recompute_at: string | null;
}

export interface AlgorithmsHealth {
  types: RankingTypeHealth[];
  ratings_total: number;
  platform_avg: number | null;
  elo_entities: number;
  elo_max: number | null;
  elo_min: number | null;
  taste: {
    users_with_snapshot: number;
    avg_confidence: number | null;
    computed_7d: number;
    last_computed_at: string | null;
    contribution_rows: number;
  };
  generated_at: string;
}

export interface TitleRef {
  id: string;
  entity_type: "movie" | "tv_series";
  title: string;
  title_fa: string | null;
  slug: string;
  year: number | null;
}

export interface ScoreBreakdown {
  platform_avg: number;
  user_avg: number | null;
  user_votes: number;
  bayesian: number;
  external_source: "imdb" | "tmdb" | "prior";
  external_rating: number | null;
  external_votes: number;
  external: number;
  user_weight: number;
  blended: number;
  elo: number | null;
  matches: number;
  battle_adjustment: number;
  final: number;
}

export interface ScoreExplanation {
  title: TitleRef;
  stored_score: number | null;
  stored_at: string | null;
  breakdown: ScoreBreakdown;
}

export interface DriftReport {
  checked: number;
  drifted: number;
  rows: { title: TitleRef; stored_score: number | null; current_score: number }[];
  drifted_ids: string[];
}

/** The ranking settings the score formula reads (app/modules/ranking/service.py). */
export interface RankingParams {
  ranking_min_votes: number;
  ranking_user_weight: number;
  ranking_external_prior: number;
  ranking_imdb_min_votes: number;
  ranking_tmdb_min_votes: number;
  ranking_battle_weight: number;
  ranking_battle_min_matches: number;
}

export const SIMULATED_PARAMS: (keyof RankingParams)[] = [
  "ranking_min_votes",
  "ranking_user_weight",
  "ranking_external_prior",
  "ranking_imdb_min_votes",
  "ranking_tmdb_min_votes",
  "ranking_battle_weight",
  "ranking_battle_min_matches",
];

const round2 = (x: number) => Math.round(x * 100) / 100;

/**
 * RankingService's formula with other parameters, for "what if" on one title.
 * Same steps as score_breakdowns; only the inputs (ratings, IMDb/TMDb, Elo) come from the server.
 */
export function simulateScore(b: ScoreBreakdown, p: RankingParams) {
  const m = p.ranking_min_votes;
  const C = b.platform_avg;
  const v = b.user_votes;
  const bayesian = v === 0 || b.user_avg == null ? C : (v / (v + m)) * b.user_avg + (m / (v + m)) * C;
  let external = p.ranking_external_prior;
  if (b.external_source !== "prior" && b.external_rating != null) {
    const em = b.external_source === "imdb" ? p.ranking_imdb_min_votes : p.ranking_tmdb_min_votes;
    external = (b.external_votes * b.external_rating + em * p.ranking_external_prior) / (b.external_votes + em);
  }
  const userWeight = (p.ranking_user_weight * v) / (v + m);
  const blended = round2(userWeight * (bayesian * 2) + (1 - userWeight) * external);
  let battle = 0;
  if (b.elo != null && b.matches > 0) {
    const strength = Math.max(-1, Math.min(1, (b.elo - 1200) / 400));
    battle = p.ranking_battle_weight * (b.matches / (b.matches + p.ranking_battle_min_matches)) * strength;
  }
  return { bayesian, external, userWeight, blended, battle, final: round2(blended + battle) };
}

/** Persian name and one-line meaning of each parameter the page lists. */
export const PARAM_INFO: Record<string, { label: string; help: string }> = {
  ranking_min_votes: { label: "حداقل رأی کاربران (m)", help: "تا این تعداد امتیاز، میانگین عنوان به میانگین کل سایت کشیده می‌شود؛ وزن نظر کاربران هم با همین بالا می‌رود." },
  ranking_user_weight: { label: "وزن نظر کاربران (α)", help: "بیشترین سهم امتیاز کاربران سینماگزین در امتیاز نهایی، وقتی رأی کافی جمع شده باشد." },
  ranking_external_weight: { label: "وزن امتیاز بیرونی (β)", help: "در فرمول فعلی خوانده نمی‌شود؛ سهم IMDb/TMDb همان ‎1 − α مؤثر است." },
  ranking_external_prior: { label: "میانگین پیش‌فرض بیرونی", help: "امتیاز IMDb/TMDb با رأی کم به این عدد (از ۱۰) کشیده می‌شود؛ عنوان بدون امتیاز بیرونی همین را می‌گیرد." },
  ranking_imdb_min_votes: { label: "حداقل رأی IMDb", help: "تا این تعداد رأی، امتیاز IMDb به میانگین پیش‌فرض کشیده می‌شود." },
  ranking_tmdb_min_votes: { label: "حداقل رأی TMDb", help: "همان، برای عنوان‌هایی که امتیاز IMDb ندارند و از امتیاز TMDb استفاده می‌کنند." },
  ranking_battle_weight: { label: "اثر نبردها (w)", help: "بیشترین امتیازی که سابقهٔ نبرد (Elo) می‌تواند به امتیاز نهایی اضافه یا کم کند." },
  ranking_battle_min_matches: { label: "نبرد لازم برای نیمی از اثر (k)", help: "بعد از این تعداد نبرد، نصف اثر نبردها اعمال می‌شود." },
  ranking_group_min_size: { label: "حداقل اندازهٔ گروه رتبه", help: "«رتبهٔ N در ژانر/کارگردان» فقط برای گروه‌هایی با این تعداد عضو یا بیشتر نشان داده می‌شود." },
  K_FACTOR_PROVISIONAL: { label: "ضریب K تازه‌کار", help: "تغییر Elo در هر نبرد برای عنوانی که هنوز کم نبرد کرده؛ همگرایی سریع." },
  K_FACTOR_ESTABLISHED: { label: "ضریب K جاافتاده", help: "تغییر Elo در هر نبرد بعد از آستانه؛ یک رأی نمی‌تواند عنوان پرسابقه را زیاد جابه‌جا کند." },
  PROVISIONAL_THRESHOLD: { label: "آستانهٔ تازه‌کاری", help: "تا این تعداد نبرد، ضریب K تازه‌کار به کار می‌رود." },
  taste_dimension_confidence_k: { label: "اطمینان هر بُعد سلیقه (k)", help: "تعداد نمونه‌ای که پس از آن نیمی از اطمینان یک بُعد (مثلاً ژانر) حاصل می‌شود." },
  taste_dimension_rating_weight: { label: "وزن ترجیح در ژانر", help: "سهم «چقدر دوستش دارد» در نمرهٔ ژانر: امتیازها نسبت به میانگین خود کاربر، درصد برد در نبردها و ♥." },
  taste_dimension_engagement_weight: { label: "وزن انتخاب در ژانر", help: "سهم «چند برابر بقیهٔ کاربران این ژانر را انتخاب می‌کند» (نسبت به میانگین سایت و کاتالوگ) در نمرهٔ ژانر." },
  taste_dimension_confidence_threshold: { label: "آستانهٔ اطمینان بُعد", help: "بُعدهای کم‌اطمینان‌تر از این در DNA سلیقه نشان داده نمی‌شوند." },
  taste_favorite_rating_equivalent: { label: "معادل امتیازِ ♥", help: "یک عنوان پسندیده و امتیاز‌نداده دست‌کم این تعداد ستاره (و همیشه نیم ستاره بالاتر از میانگین خود کاربر) حساب می‌شود." },
  taste_battle_signal_weight: { label: "وزن هر رأی نبرد", help: "وزن یک رأی نبرد در ترجیح ژانر، نسبت به یک امتیاز صریح. ژانرهای برنده برد و ژانرهای بازنده باخت می‌گیرند." },
  taste_anchor_min_rating: { label: "حداقل امتیاز لنگر سلیقه", help: "فقط عنوان‌هایی با این امتیاز یا بیشتر می‌توانند «لنگر» سلیقهٔ کاربر باشند." },
  taste_anchor_rating_weight: { label: "وزن امتیاز در لنگر", help: "سهم امتیاز کاربر در انتخاب لنگرها." },
  taste_anchor_centrality_weight: { label: "وزن مرکزیت در لنگر", help: "سهم میزان اتصال عنوان در گراف در انتخاب لنگرها." },
  taste_anchor_max_count: { label: "حداکثر تعداد لنگر", help: "چند عنوان به‌عنوان لنگر سلیقه نشان داده می‌شود." },
  taste_snapshot_confidence_k: { label: "اطمینان کل پروفایل (k)", help: "تعداد رأی‌ای که پس از آن نیمی از اطمینان مدل سلیقهٔ کاربر حاصل می‌شود." },
  taste_snapshot_dimension_weight: { label: "وزن بُعدها در اطمینان", help: "سهم اطمینان بُعدها در اطمینان کلی پروفایل." },
  taste_snapshot_vote_weight: { label: "وزن تعداد رأی در اطمینان", help: "سهم تعداد رأی‌ها در اطمینان کلی پروفایل." },
  taste_contribution_vote_weight: { label: "امتیاز مشارکت: امتیازدهی", help: "وزن هر امتیاز در امتیاز مشارکت کاربر." },
  taste_contribution_battle_weight: { label: "امتیاز مشارکت: نبرد", help: "وزن هر رأی نبرد در امتیاز مشارکت." },
  taste_contribution_comment_weight: { label: "امتیاز مشارکت: نظر", help: "وزن هر نظر نوشته‌شده در امتیاز مشارکت." },
  taste_contribution_favorite_weight: { label: "امتیاز مشارکت: ♥", help: "وزن هر پسند در امتیاز مشارکت." },
  taste_predicted_picks_dimension_weight: { label: "پیشنهادها: وزن سلیقه", help: "در «احتمالاً دوست داری»، چقدر تطابق با بُعدهای سلیقه مهم است." },
  taste_predicted_picks_ranking_weight: { label: "پیشنهادها: وزن کیفیت", help: "در همان پیشنهادها، چقدر امتیاز کلی عنوان مهم است." },
  list_item_score_k: { label: "اطمینان آیتم فهرست (k)", help: "در فهرست‌های جمعی، تعداد رأیی که پس از آن نسبت پسند خود آیتم بر میانگین غلبه می‌کند." },
  list_item_score_global_avg: { label: "میانگین پیش‌فرض آیتم", help: "نسبت پسند پیش‌فرضی که آیتم کم‌رأی به آن کشیده می‌شود." },
  list_discovery_min_items: { label: "حداقل آیتم برای کشف", help: "فهرست با کمتر از این تعداد آیتم در /lists و صفحهٔ اصلی نمی‌آید (مگر برگزیده باشد)." },
  list_discovery_min_title_length: { label: "حداقل طول عنوان فهرست", help: "فهرست با عنوان کوتاه‌تر در کشف نمی‌آید." },
  list_active_min_contributors: { label: "مشارکت‌کنندهٔ لازم برای «فعال»", help: "فهرست جمعی با این تعداد مشارکت‌کننده «فعال» شمرده می‌شود." },
  daily_battle_pool_size: { label: "استخر نبرد روز", help: "زوج روزانه از این تعداد فیلم برتر انتخاب می‌شود." },
  daily_battle_elo_window: { label: "فاصلهٔ Elo زوج", help: "دو فیلم نبرد روز حداکثر این‌قدر Elo فاصله دارند (اگر چیزی پیدا نشود کم‌کم بازتر می‌شود)." },
  daily_battle_no_repeat_days: { label: "تکرار نشدن", help: "فیلمی که در این تعداد روز گذشته در نبرد روز بوده دوباره انتخاب نمی‌شود." },
  daily_battle_guest_ip_limit: { label: "رأی مهمان در روز", help: "حداکثر رأی مهمان (بدون حساب) از یک IP در روز." },
};
