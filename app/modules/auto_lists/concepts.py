"""Hand-curated conceptual themes ("movies with an unexpected ending", "time
travel", ...). The knowledge graph has no keyword/mood data, so each concept is
a fixed catalog of well-known (title, year) pairs. Auto lists/battles only use
the ones actually found in our database (matched by title and year), ordered by
the site's own score, so a concept never shows a title the site doesn't have.
"""
import random
from dataclasses import dataclass


def _z(text: str) -> str:
    """'~' stands for a zero-width non-joiner in the Persian text below."""
    return text.replace("~", "‌")


@dataclass(frozen=True)
class Concept:
    key: str
    work: str  # "movie" | "tv_series"
    titles: tuple[tuple[str, int], ...]
    list_titles: tuple[str, ...]
    battle_titles: tuple[str, ...]
    descriptions: tuple[str, ...]
    tags: tuple[str, ...]


def _c(key, work, titles, list_titles, battle_titles, descriptions, tags) -> Concept:
    return Concept(
        key, work, tuple(titles), tuple(_z(t) for t in list_titles), tuple(_z(t) for t in battle_titles),
        tuple(_z(d) for d in descriptions), tuple(_z(t) for t in tags),
    )


def _parse(spec: str) -> list[tuple[str, int]]:
    """'Title (1999); Other (2001)' -> [(title, year), ...]"""
    out = []
    for part in spec.split(";"):
        part = part.strip()
        if part:
            name, year = part.rsplit("(", 1)
            out.append((name.strip(), int(year.rstrip(")"))))
    return out


CONCEPTS: tuple[Concept, ...] = (
    _c("twist", "movie", _parse(
        "The Sixth Sense (1999); Fight Club (1999); The Usual Suspects (1995); Shutter Island (2010); Se7en (1995);"
        "Oldboy (2003); The Prestige (2006); Memento (2000); Gone Girl (2014); Psycho (1960); Planet of the Apes (1968);"
        "Identity (2003); The Others (2001); Primal Fear (1996); Split (2016); The Village (2004); Saw (2004);"
        "Inception (2010); Black Swan (2010); Parasite (2019); Prisoners (2013); Arrival (2016)"),
        ["فیلم~هایی با پایان غیرمنتظره", "بهترین فیلم~ها با پایان غافلگیرکننده", "فیلم~هایی که آخرشون شما رو شوکه می~کنه"],
        ["کدوم فیلم با پایان غیرمنتظره بهتره؟", "نبرد فیلم~های با پایان غافلگیرکننده"],
        ["فیلم~هایی که تا آخرش نمی~تونید حدس بزنید چی میشه. اگه هنوز ندیدین، قبل از خوندن نظرها ببینید.",
         "پایان این فیلم~ها همه چیز رو عوض می~کنه. کدومش شما رو بیشتر غافلگیر کرد؟"],
        ["پایان غیرمنتظره", "هیجانی"]),
    _c("mindbending", "movie", _parse(
        "Inception (2010); Memento (2000); Shutter Island (2010); Donnie Darko (2001); Mulholland Drive (2001);"
        "Primer (2004); Interstellar (2014); Tenet (2020); Eternal Sunshine of the Spotless Mind (2004); The Matrix (1999);"
        "Being John Malkovich (1999); Arrival (2016); Predestination (2014); Coherence (2013); Source Code (2011);"
        "Looper (2012); Black Swan (2010); Fight Club (1999); Inside Out (2015); Pi (1998)"),
        ["فیلم~های ذهن~پیچ که باید دوبار دید", "بهترین فیلم~های پیچیده و ذهن~درگیرکن", "فیلم~هایی که بعد از دیدنشون تا ساعت~ها فکر می~کنید"],
        ["کدوم فیلم ذهن~پیچ بهتره؟", "نبرد فیلم~های ذهن~پیچ"],
        ["فیلم~هایی که بدون دقت دیدنشون هیچی نمی~فهمید. کدوم رو دو بار دیدین؟",
         "از فیلم~های پیچیده خوشتون میاد؟ اینا انتخاب~های من هستن."],
        ["ذهن~پیچ", "علمی~تخیلی"]),
    _c("tearjerker", "movie", _parse(
        "Schindler's List (1993); The Green Mile (1999); Hachi: A Dog's Tale (2009); Life Is Beautiful (1997);"
        "Grave of the Fireflies (1988); Forrest Gump (1994); The Pursuit of Happyness (2006); Titanic (1997);"
        "Me Before You (2016); Marley & Me (2008); A Walk to Remember (2002); Cast Away (2000); The Notebook (2004);"
        "Up (2009); Coco (2017); Atonement (2007); The Fault in Our Stars (2014); Big Fish (2003);"
        "Dead Poets Society (1989); Good Will Hunting (1997); Children of Heaven (1997)"),
        ["فیلم~هایی که حتماً اشک شما رو در میارن", "بهترین فیلم~های احساسی و اشک~آور", "با دستمال کاغذی سراغ این فیلم~ها برید"],
        ["کدوم فیلم اشک~آور بهتره؟", "نبرد فیلم~های احساسی"],
        ["این فیلم~ها رو که ببینید، گریه کردن براتون عادی میشه. کدوم بیشتر اذیتتون کرد؟",
         "فیلم~هایی که تا مدت~ها بعد از تموم شدنشون هم توی ذهنم موندن."],
        ["اشک~آور", "احساسی"]),
    _c("visual", "movie", _parse(
        "Blade Runner 2049 (2017); The Grand Budapest Hotel (2014); Life of Pi (2012); Avatar (2009); Hero (2002);"
        "In the Mood for Love (2000); Mad Max: Fury Road (2015); Gladiator (2000); Amélie (2001); Pan's Labyrinth (2006);"
        "The Fall (2006); Dune (2021); Moonlight (2016); 1917 (2019); Roma (2018); Drive (2011); La La Land (2016);"
        "Barry Lyndon (1975); The Revenant (2015); Spirited Away (2001); Her (2013); House of Flying Daggers (2004)"),
        ["زیباترین فیلم~ها از نظر تصویر", "فیلم~هایی که هر قابشون یه تابلو نقاشیه", "بهترین فیلم~ها از نظر فیلم~برداری و تصویر"],
        ["کدوم فیلم تصویر زیباتری داره؟", "نبرد زیباترین فیلم~ها از نظر بصری"],
        ["فیلم~هایی که حتی بدون صدا هم دیدنشون لذت داره. تصویر کدومشون بیشتر به دلتون نشست؟",
         "اگه عاشق فیلم~برداری و رنگ~بندی هستید، این فهرست مال شماست."],
        ["زیبایی بصری", "فیلم~برداری"]),
    _c("inspiring", "movie", _parse(
        "The Pursuit of Happyness (2006); Rocky (1976); The Shawshank Redemption (1994); Forrest Gump (1994);"
        "Good Will Hunting (1997); Hidden Figures (2016); Dead Poets Society (1989); The Intouchables (2011);"
        "3 Idiots (2009); Whiplash (2014); Rudy (1993); Remember the Titans (2000); Invictus (2009); The Blind Side (2009);"
        "Soul (2020); Coach Carter (2005); The King's Speech (2010); A Beautiful Mind (2001); Erin Brockovich (2000);"
        "Moneyball (2011); Billy Elliot (2000); Dangal (2016)"),
        ["فیلم~های انگیزشی که بهتون انرژی میدن", "بهترین فیلم~ها برای روزهایی که انگیزه ندارید", "فیلم~هایی که ازشون امید می~گیرید"],
        ["کدوم فیلم انگیزشی بهتره؟", "نبرد فیلم~های الهام~بخش"],
        ["وقتی حالتون خوب نیست، یکی از اینا رو ببینید. کدومش بیشتر بهتون انگیزه داد؟",
         "فیلم~هایی دربارهٔ تلاش، شکست و دوباره بلند شدن."],
        ["انگیزشی", "الهام~بخش"]),
    _c("psych_thriller", "movie", _parse(
        "The Silence of the Lambs (1991); Se7en (1995); Zodiac (2007); Prisoners (2013); Gone Girl (2014);"
        "Black Swan (2010); Memories of Murder (2003); Oldboy (2003); The Girl with the Dragon Tattoo (2011);"
        "Nightcrawler (2014); Misery (1990); Cape Fear (1991); Rear Window (1954); Vertigo (1958); Shutter Island (2010);"
        "Mystic River (2003); Fargo (1996); No Country for Old Men (2007); Psycho (1960); Parasite (2019)"),
        ["تریلرهای روانشناختی که نفستون رو بند میارن", "بهترین فیلم~های تعلیق~آمیز و پر از دلهره", "فیلم~هایی که کل مدتش رو روی لبهٔ صندلی می~مونید"],
        ["کدوم تریلر روانشناختی بهتره؟", "نبرد فیلم~های پرتعلیق"],
        ["تعلیق و دلهره از اول تا آخر. کدوم رو یه نفس دیدین؟",
         "فیلم~هایی که ذهن آدم رو بازی میدن. شب~ها ندیدشون!"],
        ["تریلر", "روانشناختی"]),
    _c("screenplay", "movie", _parse(
        "Pulp Fiction (1994); The Social Network (2010); Good Will Hunting (1997); Before Sunrise (1995);"
        "Reservoir Dogs (1992); Once Upon a Time in Hollywood (2019); 12 Angry Men (1957); Casablanca (1942);"
        "The Godfather (1972); Network (1976); Chinatown (1974); Sunset Boulevard (1950); Annie Hall (1977);"
        "Manchester by the Sea (2016); Marriage Story (2019); In Bruges (2008); Lost in Translation (2003); Her (2013);"
        "Eternal Sunshine of the Spotless Mind (2004); Whiplash (2014); A Separation (2011)"),
        ["فیلم~هایی با فیلم~نامه و دیالوگ~های درخشان", "بهترین فیلم~ها از نظر فیلم~نامه", "فیلم~هایی که دیالوگ~هاشون ماندگار شد"],
        ["کدوم فیلم فیلم~نامهٔ بهتری داره؟", "نبرد فیلم~های با دیالوگ~های ماندگار"],
        ["فیلم~هایی که با دیالوگ~هاشون توی ذهن می~مونن. کدوم جمله~ش هنوز یادتونه؟",
         "اگه فیلم~نامه براتون از همه چیز مهم~تره، از اینجا شروع کنید."],
        ["فیلم~نامه", "دیالوگ~های ماندگار"]),
    _c("feelgood", "movie", _parse(
        "Amélie (2001); The Intouchables (2011); Paddington 2 (2017); Little Miss Sunshine (2006); Forrest Gump (1994);"
        "About Time (2013); Chef (2014); The Grand Budapest Hotel (2014); School of Rock (2003); Mamma Mia! (2008);"
        "Singin' in the Rain (1952); Back to the Future (1985); Groundhog Day (1993); Big Fish (2003); Paddington (2014);"
        "The Secret Life of Walter Mitty (2013); Julie & Julia (2009); Yes Man (2008); Sing Street (2016); Up (2009);"
        "Toy Story (1995); The Princess Bride (1987)"),
        ["فیلم~های حال~خوب~کن برای روزهای بد", "بهترین فیلم~ها برای وقتی دلتون خوشی می~خواد", "فیلم~هایی که بعدش لبخند روی لبتونه"],
        ["کدوم فیلم حال~خوب~کن بهتره؟", "نبرد فیلم~های شاد و دل~گرم~کننده"],
        ["فیلم~هایی که ته~شون آدم احساس بهتری داره. فیلم دل~گرمی شما کدومه؟",
         "برای شب~هایی که حوصلهٔ فیلم سنگین ندارید."],
        ["حال~خوب~کن", "شاد"]),
    _c("revenge", "movie", _parse(
        "Oldboy (2003); Kill Bill: Vol. 1 (2003); The Revenant (2015); John Wick (2014); Gladiator (2000); Taken (2008);"
        "Django Unchained (2012); Man on Fire (2004); I Saw the Devil (2010); Sympathy for Mr. Vengeance (2002);"
        "Lady Vengeance (2005); The Count of Monte Cristo (2002); Mad Max (1979); Death Wish (1974);"
        "Inglourious Basterds (2009); V for Vendetta (2005); Carrie (1976); Prisoners (2013); Nobody (2021);"
        "Braveheart (1995); Cape Fear (1991)"),
        ["بهترین فیلم~های انتقام~جویانه", "فیلم~هایی که قهرمانش دنبال انتقامه", "انتقام از نگاه سینما: فیلم~های برتر"],
        ["کدوم فیلم انتقامی بهتره؟", "نبرد فیلم~های انتقام"],
        ["انتقام شیرینه؟ این فیلم~ها نشون میدن که همیشه نه. کدوم رو بیشتر دوست دارید؟",
         "فیلم~هایی دربارهٔ حساب~کتاب پس دادن و تاوان."],
        ["انتقام", "اکشن"]),
    _c("true_story", "movie", _parse(
        "Schindler's List (1993); The Social Network (2010); Catch Me If You Can (2002); Zodiac (2007); Apollo 13 (1995);"
        "A Beautiful Mind (2001); Spotlight (2015); 12 Years a Slave (2013); The Wolf of Wall Street (2013); Argo (2012);"
        "Moneyball (2011); Erin Brockovich (2000); The Pianist (2002); Hacksaw Ridge (2016); Dallas Buyers Club (2013);"
        "Captain Phillips (2013); The Imitation Game (2014); Bohemian Rhapsody (2018); Goodfellas (1990);"
        "Into the Wild (2007); 127 Hours (2010); Lincoln (2012); Capote (2005); Munich (2005)"),
        ["بهترین فیلم~های برگرفته از واقعیت", "فیلم~هایی که واقعاً اتفاق افتاده~ن", "داستان~های واقعی روی پردهٔ سینما"],
        ["کدوم فیلم برگرفته از داستان واقعی بهتره؟", "نبرد فیلم~های بر اساس داستان واقعی"],
        ["باورش سخته ولی همهٔ اینا از روی اتفاق~های واقعی ساخته شدن. کدوم بیشتر شما رو تحت تأثیر قرار داد؟",
         "واقعیت گاهی از هر فیلمی عجیب~تره."],
        ["داستان واقعی", "بیوگرافی"]),
    _c("time_travel", "movie", _parse(
        "Back to the Future (1985); Looper (2012); Interstellar (2014); Primer (2004); Tenet (2020); 12 Monkeys (1995);"
        "Terminator 2: Judgment Day (1991); The Terminator (1984); Predestination (2014); Source Code (2011);"
        "Edge of Tomorrow (2014); About Time (2013); Groundhog Day (1993); Timecrimes (2007); Donnie Darko (2001);"
        "Midnight in Paris (2011); Avengers: Endgame (2019); La Jetée (1962); Safety Not Guaranteed (2012)"),
        ["بهترین فیلم~های سفر در زمان", "فیلم~هایی که زمان توشون بازی می~کنه", "اگه ماشین زمان داشتید، این فیلم~ها رو می~دیدید"],
        ["کدوم فیلم سفر در زمان بهتره؟", "نبرد فیلم~های ماشین زمان"],
        ["پارادوکس~ها، حلقه~های زمانی و گذشته~ای که عوض میشه. کدوم رو بیشتر دوست دارید؟",
         "فیلم~هایی که با زمان بازی می~کنن."],
        ["سفر در زمان", "علمی~تخیلی"]),
    _c("heist", "movie", _parse(
        "Heat (1995); Ocean's Eleven (2001); The Italian Job (2003); Inside Man (2006); The Town (2010);"
        "Baby Driver (2017); Reservoir Dogs (1992); Dog Day Afternoon (1975); The Usual Suspects (1995);"
        "Now You See Me (2013); Logan Lucky (2017); Snatch (2000); Lock, Stock and Two Smoking Barrels (1998);"
        "The Sting (1973); Rififi (1955); Entrapment (1999); Inception (2010); Le Cercle Rouge (1970)"),
        ["بهترین فیلم~های سرقت و نقشهٔ بزرگ", "فیلم~هایی دربارهٔ سرقت~های بی~نقص (یا نه!)", "اگه عاشق نقشهٔ دزدی هستید، اینا رو ببینید"],
        ["کدوم فیلم سرقت بهتره؟", "نبرد فیلم~های سرقت"],
        ["نقشه~های پیچیده، تیم حرفه~ای و یه چیز که همیشه خراب میشه. کدوم رو بیشتر دوست دارید؟",
         "فیلم~هایی که دزد~هاشون باهوش~تر از پلیس~ها هستن."],
        ["سرقت", "جنایی"]),
    _c("iranian_acclaimed", "movie", _parse(
        "A Separation (2011); The Salesman (2016); About Elly (2009); Taxi (2015); Close-Up (1990);"
        "Taste of Cherry (1997); The White Balloon (1995); Children of Heaven (1997); The Cow (1969); Persepolis (2007);"
        "A Girl Walks Home Alone at Night (2014); Under the Shadow (2016); Offside (2006); Fireworks Wednesday (2006);"
        "A Hero (2021); Leila's Brothers (2022); Holy Spider (2022); Ballad of a White Cow (2020);"
        "There Is No Evil (2020); The Wind Will Carry Us (1999); Gabbeh (1996); Where Is the Friend's House? (1987)"),
        ["فیلم~های ایرانی که دنیا تحسینشون کرد", "بهترین فیلم~های ایرانی در جشنواره~های جهانی", "سینمای ایران در چشم دنیا"],
        ["کدوم فیلم ایرانی جهانی~تر شد؟", "نبرد فیلم~های ایرانیِ تحسین~شده"],
        ["فیلم~هایی که اسم ایران رو توی جشنواره~ها بلند کردن. کدومش رو بیشتر دوست دارید؟",
         "وقتی سینمای ایران در رقابت با دنیا می~درخشه."],
        ["ایرانی", "جشنواره"]),
    _c("series_crime", "tv_series", _parse(
        "Breaking Bad (2008); Better Call Saul (2015); The Sopranos (1999); The Wire (2002); True Detective (2014);"
        "Mindhunter (2017); Ozark (2017); Narcos (2015); Dexter (2006); Fargo (2014); Peaky Blinders (2013);"
        "Hannibal (2013); Mr. Robot (2015); Prison Break (2005); House of Cards (2013); Money Heist (2017)"),
        ["بهترین سریال~های جنایی و تاریک", "سریال~هایی که توشون جرم و گناه موج می~زنه", "سریال~های جنایی که نمی~تونید رهاشون کنید"],
        ["کدوم سریال جنایی بهتره؟", "نبرد سریال~های جنایی و تاریک"],
        ["سریال~هایی که آدم~های خاکستری دارن و قصه~های پر از تعلیق. کدوم رو تا آخر دیدین؟",
         "از اون سریال~هایی که یه قسمت دیگه رو هیچ~وقت نمی~تونید نبینید."],
        ["سریال جنایی", "درام تاریک"]),
    _c("series_mind", "tv_series", _parse(
        "Dark (2017); Black Mirror (2011); Westworld (2016); Lost (2004); Twin Peaks (1990); Severance (2022);"
        "The Leftovers (2014); Mr. Robot (2015); Stranger Things (2016); Devs (2020); Russian Doll (2019);"
        "Legion (2017); Fringe (2008); Counterpart (2017); The OA (2016); Maniac (2018)"),
        ["سریال~های ذهن~پیچ و پر از معما", "سریال~هایی که باید با دقت دید", "بهترین سریال~های علمی~تخیلی و رازآلود"],
        ["کدوم سریال ذهن~پیچ بهتره؟", "نبرد سریال~های رازآلود"],
        ["سریال~هایی که هر قسمتشون سؤال بیشتری نسبت به جواب داره. کدوم رو بیشتر دوست دارید؟",
         "اگه موقع دیدن سریال دفترچه یادداشت لازم دارید، اینا مال شماست."],
        ["ذهن~پیچ", "رازآلود"]),
)

CONCEPTS_BY_KEY = {c.key: c for c in CONCEPTS}


def pick_concepts(rng: random.Random, work: str) -> list[Concept]:
    """The concepts of this kind of work, in a random order."""
    pool = [c for c in CONCEPTS if c.work == work]
    rng.shuffle(pool)
    return pool
