"""
Rule-based Persian sentence templates for TasteInsightComputer.

No LLM involved -- one of these strings gets picked deterministically
per user (see TasteInsightComputer._pick_template in compute.py) and
filled in with archetype label(s). Keeping the bank here instead of
inline in compute.py so adding/editing copy doesn't touch the scoring
logic.
"""

TEMPLATES: dict[str, list[str]] = {
    "loyalist": [
        "به نظر می‌رسه {archetype} بودن بخش مهمی از هویت سینمایی‌ته — وقتی چیزی این ژانر رو داشته باشه، به احتمال زیاد جذبش می‌شی.",
        "سلیقه‌ات خیلی واضح و مشخصه: {archetype}. انگار وقتی یه فیلم توی همین حال‌وهوا باشه، خیلی راحت‌تر باهاش ارتباط می‌گیری.",
        "{archetype} انگار حرف اول و آخر رو توی انتخاب‌های فیلمت می‌زنه — یه وفاداری قشنگ به یه سبک خاص.",
    ],
    "balanced_explorer": [
        "ترکیب {archetype1} و {archetype2} نشون می‌ده به دنبال تجربه‌های متنوع اما هدفمندی — نه صرفاً محبوب‌ترین‌ها، بلکه چیزهایی که واقعاً باهات ارتباط برقرار کنن.",
        "بین {archetype1} و {archetype2} در نوسانی، و این نشون می‌ده سلیقه‌ات به یه ژانر خاص محدود نمی‌شه، ولی هنوز یه الگوی روشن داره.",
        "{archetype1} و {archetype2} با هم انگار دو تا روی مختلف از سلیقه‌ات رو نشون می‌دن — هم دنبال عمقی، هم دنبال تنوع.",
    ],
    "eclectic_explorer": [
        "سلیقه‌ات گسترده‌ست — از {archetype1} تا {archetype2}، انگار بیشتر دنبال کشف چیزهای جدیدی تا موندن توی یه ژانر ثابت.",
        "از {archetype1} گرفته تا {archetype2}، مرزهای سلیقه‌ات خیلی بازه؛ هر چیزی که خوب ساخته شده باشه، جای خودش رو توی لیست تو پیدا می‌کنه.",
        "تنوع توی انتخاب‌هات موج می‌زنه — {archetype1}، {archetype2}، و احتمالاً چیزهای دیگه‌ای که هنوز کشفشون نکردیم.",
    ],
}
