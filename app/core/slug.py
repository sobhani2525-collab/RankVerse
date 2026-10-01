import unicodedata

_CHAR_MAP = str.maketrans(
    {
        "ي": "ی",
        "ى": "ی",
        "ك": "ک",
        "ة": "ه",
        "ۀ": "ه",
        "ؤ": "و",
        "أ": "ا",
        "إ": "ا",
        "ٱ": "ا",
        "ـ": None,  # tatweel
        **{chr(0x06F0 + i): str(i) for i in range(10)},  # Persian digits
        **{chr(0x0660 + i): str(i) for i in range(10)},  # Arabic-Indic digits
    }
)
# ئ is intentionally not mapped: folding it would break words like «مسئله».


def persian_slugify(text: str, max_length: int = 80) -> str:
    """URL slug that keeps Persian letters (unlike unidecode-based slugify).

    «بهترین فیلم‌های نولان» -> «بهترین-فیلم-های-نولان»
    """
    text = unicodedata.normalize("NFKC", text or "").translate(_CHAR_MAP).lower()
    out: list[str] = []
    for ch in text:
        if unicodedata.category(ch) == "Mn":
            continue  # harakat / shadda: drop, don't split the word
        out.append(ch if ch.isalnum() else "-")
    slug = "-".join(part for part in "".join(out).split("-") if part)

    if len(slug) > max_length:
        cut = slug[:max_length]
        last = cut.rfind("-")
        if last >= max_length / 2:
            cut = cut[:last]
        slug = cut.strip("-")
    return slug or "list"
