"""
Rule-based Persian sentences for build_insight (taste/compute.py).

No LLM involved -- build_insight picks the facts worth saying (a genre the
user chooses far more than average, the one they prefer most, the one they
prefer least, how broad their taste is) and fills these in. Every sentence
has a second-person form for the profile's owner and a third-person form
for anyone viewing their public profile. Keeping the copy here instead of
inline in compute.py so editing it doesn't touch the scoring logic.
"""

INSIGHT_SENTENCES: dict[str, dict[str, str]] = {
    "self": {
        "lift": "{genre} رو {times} برابر بیشتر از میانگین کاربران سینماگزین انتخاب می‌کنی.",
        "lift_and_love": "{genre} رو {times} برابر بیشتر از میانگین کاربران انتخاب می‌کنی و در امتیازها و نبردها هم بیشتر از هر ژانری به دلت می‌شینه.",
        "love": "در امتیازها و نبردها، {genre} بیشتر از هر ژانر دیگه‌ای به دلت می‌شینه.",
        "dislike": "در عوض {genre} کمتر از بقیهٔ ژانرها راضی‌ت می‌کنه.",
        "broad": "دامنهٔ سلیقه‌ات گسترده‌ست و به یکی دو ژانر محدود نمی‌شه.",
        "focused": "سلیقه‌ات متمرکزه و مسیر روشنی داره.",
        "unclear": "هنوز الگوی پررنگی در انتخاب‌هات پیدا نکردیم؛ چند امتیاز و نبرد دیگه تصویر روشن‌تری می‌سازه.",
    },
    "other": {
        "lift": "{genre} رو {times} برابر بیشتر از میانگین کاربران سینماگزین انتخاب می‌کنه.",
        "lift_and_love": "{genre} رو {times} برابر بیشتر از میانگین کاربران انتخاب می‌کنه و در امتیازها و نبردها هم بیشتر از هر ژانری به دلش می‌شینه.",
        "love": "در امتیازها و نبردها، {genre} بیشتر از هر ژانر دیگه‌ای به دلش می‌شینه.",
        "dislike": "در عوض {genre} کمتر از بقیهٔ ژانرها راضی‌ش می‌کنه.",
        "broad": "دامنهٔ سلیقه‌اش گسترده‌ست و به یکی دو ژانر محدود نمی‌شه.",
        "focused": "سلیقه‌اش متمرکزه و مسیر روشنی داره.",
        "unclear": "هنوز الگوی پررنگی در انتخاب‌هاش پیدا نشده.",
    },
}

# Same labels as frontend/lib/genre-labels.ts -- the insight text is built
# here, so it needs its own copy.
GENRE_FA: dict[str, str] = {
    "action": "اکشن",
    "adventure": "ماجراجویی",
    "animation": "انیمیشن",
    "comedy": "کمدی",
    "crime": "جنایی",
    "documentary": "مستند",
    "drama": "درام",
    "family": "خانوادگی",
    "fantasy": "فانتزی",
    "history": "تاریخی",
    "horror": "ترسناک",
    "music": "موسیقی",
    "mystery": "معمایی",
    "romance": "عاشقانه",
    "science-fiction": "علمی-تخیلی",
    "sci-fi": "علمی-تخیلی",
    "tv-movie": "فیلم تلویزیونی",
    "thriller": "پرتعلیق",
    "war": "جنگی",
    "western": "وسترن",
    "kids": "کودک",
    "news": "خبری",
    "reality": "رئالیتی",
    "soap": "درام خانوادگی",
    "talk": "گفتگو",
}


def genre_fa(slug: str) -> str:
    return GENRE_FA.get(slug, slug.replace("-", " "))
