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
    _c("war", "movie", _parse(
        "Saving Private Ryan (1998); Apocalypse Now (1979); Full Metal Jacket (1987); Platoon (1986); Dunkirk (2017); 1917 (2019);"
        "Hacksaw Ridge (2016); Das Boot (1981); Black Hawk Down (2001); The Thin Red Line (1998); Paths of Glory (1957);"
        "Come and See (1985); Letters from Iwo Jima (2006); Fury (2014); The Hurt Locker (2008); Downfall (2004);"
        "Inglourious Basterds (2009); Lone Survivor (2013); Born on the Fourth of July (1989); The Deer Hunter (1978); Jarhead (2005)"),
        ["بهترین فیلم~های جنگی تاریخ سینما", "فیلم~های جنگی که واقعیت جنگ رو نشون میدن", "فیلم~های جنگی که فراموش نمی~شن"],
        ["کدوم فیلم جنگی بهتره؟", "نبرد فیلم~های جنگی"],
        ["جنگ از نگاه سینما: ترس، شجاعت و بهایی که آدم~ها می~پردازن. کدوم رو بیشتر دوست دارید؟",
         "فیلم~هایی که صحنه~های جنگشون تا مدت~ها یادتون می~مونه."],
        ["جنگی", "تاریخی"]),
    _c("one_location", "movie", _parse(
        "12 Angry Men (1957); Rope (1948); Buried (2010); Phone Booth (2002); Cube (1997); Room (2015); Locke (2013);"
        "Panic Room (2002); Reservoir Dogs (1992); The Hateful Eight (2015); Lifeboat (1944); Wait Until Dark (1967);"
        "Exam (2009); 10 Cloverfield Lane (2016); Misery (1990); Dial M for Murder (1954); Rear Window (1954);"
        "The Thing (1982); Moon (2009); Carnage (2011); Devil (2010)"),
        ["فیلم~هایی که همه~ش توی یک مکان می~گذره", "بهترین فیلم~های تک~لوکیشن", "فیلم~هایی که یه اتاق کافیه براشون"],
        ["کدوم فیلم تک~لوکیشن بهتره؟", "نبرد فیلم~های یک~مکانه"],
        ["بدون صحنه~های بزرگ و پرخرج، فقط با فیلم~نامه و بازیگری. کدوم رو بیشتر دوست دارید؟",
         "وقتی دیوارهای یک اتاق برای یک فیلم کامل کافیه."],
        ["تک~لوکیشن", "تریلر"]),
    _c("horror", "movie", _parse(
        "The Shining (1980); Psycho (1960); Hereditary (2018); The Exorcist (1973); Get Out (2017); Alien (1979);"
        "A Nightmare on Elm Street (1984); Halloween (1978); The Conjuring (2013); Midsommar (2019); It Follows (2014);"
        "The Babadook (2014); Rosemary's Baby (1968); The Thing (1982); Suspiria (1977); Scream (1996); Insidious (2010);"
        "The Ring (2002); Ringu (1998); Train to Busan (2016); Let the Right One In (2008); Sinister (2012); The Descent (2005);"
        "Under the Shadow (2016)"),
        ["ترسناک~ترین فیلم~های تاریخ", "بهترین فیلم~های ترسناک برای شب~های تاریک", "فیلم~هایی که تنها نمی~شه دیدشون"],
        ["کدوم فیلم ترسناک بهتره؟", "نبرد فیلم~های ترسناک"],
        ["چراغ~ها رو خاموش کنید و ببینید کدومشون بیشتر می~ترسونه. ترسناک~ترین فیلمی که دیدید کدومه؟",
         "از فیلم~های کلاسیک تا ترسناک~های مدرن."],
        ["ترسناک", "وحشت"]),
    _c("western", "movie", _parse(
        "The Good, the Bad and the Ugly (1966); Once Upon a Time in the West (1968); Unforgiven (1992); Django Unchained (2012);"
        "True Grit (2010); High Noon (1952); The Searchers (1956); Butch Cassidy and the Sundance Kid (1969); Tombstone (1993);"
        "Dances with Wolves (1990); No Country for Old Men (2007); The Magnificent Seven (1960); Rio Bravo (1959);"
        "A Fistful of Dollars (1964); For a Few Dollars More (1965); Shane (1953); 3:10 to Yuma (2007); Hell or High Water (2016);"
        "The Assassination of Jesse James by the Coward Robert Ford (2007); There Will Be Blood (2007); Open Range (2003)"),
        ["بهترین فیلم~های وسترن", "وسترن~هایی که کابوی~ها رو جاودانه کردن", "فیلم~های غرب وحشی که باید دید"],
        ["کدوم فیلم وسترن بهتره؟", "نبرد فیلم~های وسترن"],
        ["اسب، تپانچه و دشت~های بی~انتها. وسترن مورد علاقهٔ شما کدومه؟",
         "از کلاسیک~های سرجیو لئونه تا وسترن~های مدرن، همه یه جا."],
        ["وسترن", "کلاسیک"]),
    _c("animation", "movie", _parse(
        "Spirited Away (2001); Toy Story (1995); The Lion King (1994); WALL·E (2008); WALL-E (2008); Up (2009); Inside Out (2015);"
        "Coco (2017); Finding Nemo (2003); Shrek (2001); Princess Mononoke (1997); My Neighbor Totoro (1988);"
        "Spider-Man: Into the Spider-Verse (2018); Ratatouille (2007); How to Train Your Dragon (2010); Howl's Moving Castle (2004);"
        "Your Name. (2016); Beauty and the Beast (1991); Aladdin (1992); Monsters, Inc. (2001); The Incredibles (2004);"
        "Persepolis (2007); Soul (2020); Zootopia (2016); Grave of the Fireflies (1988); A Silent Voice (2016); Akira (1988)"),
        ["بهترین انیمیشن~هایی که بزرگ~ترها هم دوست دارن", "انیمیشن~هایی که فقط برای بچه~ها نیستن", "بهترین انیمیشن~های تاریخ سینما"],
        ["کدوم انیمیشن بهتره؟", "نبرد انیمیشن~های محبوب"],
        ["بعضی انیمیشن~ها توی بزرگسالی بیشتر می~چسبن. انیمیشن مورد علاقهٔ شما کدومه؟",
         "از دیزنی و پیکسار تا استودیو جیبلی."],
        ["انیمیشن", "خانوادگی"]),
    _c("space_scifi", "movie", _parse(
        "2001: A Space Odyssey (1968); Interstellar (2014); Gravity (2013); The Martian (2015); Alien (1979); Aliens (1986);"
        "Star Wars (1977); The Empire Strikes Back (1980); Blade Runner (1982); Blade Runner 2049 (2017); Arrival (2016);"
        "Moon (2009); Solaris (1972); Contact (1997); Ad Astra (2019); Sunshine (2007); Event Horizon (1997); Dune (2021);"
        "Dune: Part Two (2024); Close Encounters of the Third Kind (1977); E.T. the Extra-Terrestrial (1982); Silent Running (1972);"
        "Guardians of the Galaxy (2014)"),
        ["بهترین فیلم~های فضایی و علمی~تخیلی", "فیلم~هایی که شما رو به فضا می~برن", "سفر به ستاره~ها؛ بهترین فیلم~های علمی~تخیلی"],
        ["کدوم فیلم فضایی بهتره؟", "نبرد فیلم~های علمی~تخیلی فضایی"],
        ["فیلم~هایی که سکوت فضا هم توشون پرصداست. کدوم رو روی پردهٔ بزرگ دیدین؟",
         "از کلاسیک~های کوبریک تا حماسه~های امروزی."],
        ["فضایی", "علمی~تخیلی"]),
    _c("romance", "movie", _parse(
        "Titanic (1997); The Notebook (2004); Before Sunrise (1995); Before Sunset (2004); Before Midnight (2013); Casablanca (1942);"
        "Roman Holiday (1953); Pride & Prejudice (2005); La La Land (2016); Eternal Sunshine of the Spotless Mind (2004);"
        "In the Mood for Love (2000); Amélie (2001); Call Me by Your Name (2017); Brokeback Mountain (2005);"
        "Portrait of a Lady on Fire (2019); Her (2013); When Harry Met Sally... (1989); Love Story (1970); Gone with the Wind (1939);"
        "Ghost (1990); Dirty Dancing (1987); Notting Hill (1999); Pretty Woman (1990); Sleepless in Seattle (1993);"
        "Lost in Translation (2003); Blue Valentine (2010); (500) Days of Summer (2009); Crazy, Stupid, Love. (2011)"),
        ["بهترین فیلم~های عاشقانه", "فیلم~های عاشقانه~ای که هنوز دل~مون رو می~برن", "عاشقانه~هایی که باید با کسی که دوستش دارید ببینید"],
        ["کدوم فیلم عاشقانه بهتره؟", "نبرد فیلم~های عاشقانه"],
        ["عشق در همهٔ شکل~هاش: شاد، تلخ و جاودانه. فیلم عاشقانهٔ مورد علاقهٔ شما کدومه؟",
         "اگه دلتون عاشقانه می~خواد، از اینجا شروع کنید."],
        ["عاشقانه", "رمانتیک"]),
    _c("mafia", "movie", _parse(
        "The Godfather (1972); The Godfather Part II (1974); Goodfellas (1990); Scarface (1983); Casino (1995);"
        "Once Upon a Time in America (1984); The Departed (2006); A Bronx Tale (1993); Donnie Brasco (1997); Gangs of New York (2002);"
        "The Irishman (2019); Road to Perdition (2002); Carlito's Way (1993); American Gangster (2007); City of God (2002);"
        "Miller's Crossing (1990); The Untouchables (1987); Public Enemies (2009); Mean Streets (1973); Gomorrah (2008);"
        "Layer Cake (2004); Eastern Promises (2007); A History of Violence (2005); Sexy Beast (2000)"),
        ["بهترین فیلم~های مافیایی و گانگستری", "دنیای مافیا روی پردهٔ سینما", "فیلم~های گانگستری که نمی~شه رد شد"],
        ["کدوم فیلم مافیایی بهتره؟", "نبرد فیلم~های گانگستری"],
        ["خانواده، وفاداری و خون. فیلم مافیایی محبوب شما کدومه؟",
         "پیشنهادی که نمی~تونید ردش کنید."],
        ["مافیایی", "گانگستری"]),
    _c("sports", "movie", _parse(
        "Rocky (1976); Raging Bull (1980); Moneyball (2011); Rush (2013); Creed (2015); The Fighter (2010); Million Dollar Baby (2004);"
        "Remember the Titans (2000); Coach Carter (2005); Rudy (1993); Invictus (2009); Seabiscuit (2003); Hoosiers (1986);"
        "Field of Dreams (1989); The Wrestler (2008); Ford v Ferrari (2019); Senna (2010); I, Tonya (2017); Cool Runnings (1993);"
        "Chariots of Fire (1981); Bend It Like Beckham (2002); Warrior (2011); Southpaw (2015); Foxcatcher (2014); Dangal (2016);"
        "Bull Durham (1988); Miracle (2004); Any Given Sunday (1999)"),
        ["بهترین فیلم~های ورزشی", "فیلم~های ورزشی که از جا بلندتون می~کنن", "ورزش روی پرده؛ فیلم~های برتر"],
        ["کدوم فیلم ورزشی بهتره؟", "نبرد فیلم~های ورزشی"],
        ["پیروزی، شکست و دوباره برخاستن. فیلم ورزشی محبوب شما کدومه؟",
         "برای کسانی که با هر امتیاز هیجان~زده میشن."],
        ["ورزشی", "انگیزشی"]),
    _c("coming_of_age", "movie", _parse(
        "The Perks of Being a Wallflower (2012); Lady Bird (2017); Boyhood (2014); Stand by Me (1986); The Breakfast Club (1985);"
        "Moonlight (2016); Juno (2007); Superbad (2007); Dazed and Confused (1993); The Edge of Seventeen (2016);"
        "Eighth Grade (2018); Call Me by Your Name (2017); Little Women (2019); Mid90s (2018); The 400 Blows (1959);"
        "Ferris Bueller's Day Off (1986); Say Anything... (1989); Sing Street (2016); Booksmart (2019); Almost Famous (2000);"
        "American Graffiti (1973); Fish Tank (2009); The Way Way Back (2013)"),
        ["بهترین فیلم~های دوران نوجوانی و بزرگ شدن", "فیلم~هایی که نوجوانی رو یادتون میارن", "فیلم~های بلوغ؛ بهترین~ها"],
        ["کدوم فیلم دوران نوجوانی بهتره؟", "نبرد فیلم~های نوجوانی و بلوغ"],
        ["اولین عشق، اولین دوستی و اولین دلشکستگی. کدوم فیلم شما رو به نوجوانی برگردوند؟",
         "فیلم~هایی دربارهٔ لحظه~هایی که آدم رو می~سازن."],
        ["نوجوانی", "بلوغ"]),
    _c("dystopian", "movie", _parse(
        "Blade Runner (1982); 1984 (1984); Nineteen Eighty-Four (1984); Brazil (1985); A Clockwork Orange (1971); Children of Men (2006);"
        "The Matrix (1999); V for Vendetta (2005); Fahrenheit 451 (1966); Metropolis (1927); Equilibrium (2002); Gattaca (1997);"
        "The Hunger Games (2012); Minority Report (2002); Snowpiercer (2013); Soylent Green (1973); Logan's Run (1976);"
        "Never Let Me Go (2010); Ex Machina (2014); I Am Legend (2007); The Road (2009); Idiocracy (2006); Elysium (2013);"
        "District 9 (2009)"),
        ["بهترین فیلم~های آخرالزمانی و ضدآرمان~شهری", "آینده~ای که امیدوارم هیچ~وقت نرسه", "فیلم~های دیستوپیایی که باید دید"],
        ["کدوم فیلم دیستوپیایی بهتره؟", "نبرد فیلم~های آخرالزمانی"],
        ["دنیای آینده~ای که توش آزادی گم شده. کدوم رو بیشتر باور می~کنید؟",
         "فیلم~هایی که هشدار می~دن."],
        ["دیستوپیا", "آخرالزمانی"]),
    _c("courtroom", "movie", _parse(
        "12 Angry Men (1957); To Kill a Mockingbird (1962); A Few Good Men (1992); Philadelphia (1993); The Verdict (1982);"
        "Anatomy of a Murder (1959); Witness for the Prosecution (1957); Erin Brockovich (2000); Primal Fear (1996);"
        "My Cousin Vinny (1992); Judgment at Nuremberg (1961); Inherit the Wind (1960); Runaway Jury (2003); A Time to Kill (1996);"
        "The Lincoln Lawyer (2011); Michael Clayton (2007); Just Mercy (2019); Anatomy of a Fall (2023);"
        "The Trial of the Chicago 7 (2020); Kramer vs. Kramer (1979); Dark Waters (2019); A Separation (2011)"),
        ["بهترین فیلم~های دادگاهی و وکالتی", "فیلم~هایی که توی دادگاه می~گذره", "عدالت روی پرده؛ فیلم~های دادگاهی برتر"],
        ["کدوم فیلم دادگاهی بهتره؟", "نبرد فیلم~های دادگاهی"],
        ["وقتی کلمه~ها قوی~تر از اسلحه~ن. کدوم دفاعیه شما رو بیشتر تحت تأثیر قرار داد؟",
         "فیلم~هایی دربارهٔ حقیقت، قانون و عدالت."],
        ["دادگاهی", "حقوقی"]),
    _c("superhero", "movie", _parse(
        "The Dark Knight (2008); Batman Begins (2005); The Dark Knight Rises (2012); Spider-Man 2 (2004); Spider-Man (2002);"
        "Iron Man (2008); The Avengers (2012); Avengers: Infinity War (2018); Avengers: Endgame (2019); Black Panther (2018);"
        "Guardians of the Galaxy (2014); Logan (2017); Deadpool (2016); Captain America: The Winter Soldier (2014);"
        "Thor: Ragnarok (2017); Watchmen (2009); X-Men: Days of Future Past (2014); X2 (2003); Joker (2019); Wonder Woman (2017);"
        "Spider-Man: No Way Home (2021); Captain America: Civil War (2016); Superman (1978); Unbreakable (2000); The Batman (2022)"),
        ["بهترین فیلم~های ابرقهرمانی", "ابرقهرمان~هایی که ارزش دیدن دارن", "فیلم~های ابرقهرمانی که از بقیه سرتر~ن"],
        ["کدوم فیلم ابرقهرمانی بهتره؟", "نبرد فیلم~های ابرقهرمانی"],
        ["مارول یا دی~سی؟ بحث همیشگی که اینجا ادامه پیدا می~کنه. فیلم محبوب شما کدومه؟",
         "ابرقهرمان~هایی که روی پرده جادو کردن."],
        ["ابرقهرمانی", "اکشن"]),
    _c("spy", "movie", _parse(
        "Skyfall (2012); Casino Royale (2006); Mission: Impossible - Fallout (2018); The Bourne Identity (2002);"
        "The Bourne Ultimatum (2007); The Bourne Supremacy (2004); Tinker Tailor Soldier Spy (2011); Munich (2005);"
        "Bridge of Spies (2015); Argo (2012); Zero Dark Thirty (2012); The Lives of Others (2006); Goldfinger (1964);"
        "From Russia with Love (1963); Kingsman: The Secret Service (2014); Atomic Blonde (2017); Salt (2010);"
        "North by Northwest (1959); The Third Man (1949); Spy Game (2001); Syriana (2005); Red Sparrow (2018); Spectre (2015);"
        "No Time to Die (2021); Mission: Impossible (1996); True Lies (1994)"),
        ["بهترین فیلم~های جاسوسی", "جاسوس~هایی که روی پرده درخشیدن", "فیلم~های جاسوسی که نفس رو بند میارن"],
        ["کدوم فیلم جاسوسی بهتره؟", "نبرد فیلم~های جاسوسی"],
        ["هویت~های جعلی، مأموریت~های سری و خیانت. کدوم رو بیشتر دوست دارید؟",
         "از جیمز باند تا جاسوس~های واقعی."],
        ["جاسوسی", "اکشن"]),
    _c("survival", "movie", _parse(
        "Cast Away (2000); 127 Hours (2010); The Revenant (2015); Into the Wild (2007); All Is Lost (2013); Life of Pi (2012);"
        "The Martian (2015); Gravity (2013); Alive (1993); Open Water (2003); Buried (2010); Wild (2014); Touching the Void (2003);"
        "Everest (2015); The Grey (2011); Rescue Dawn (2006); Jaws (1975); The Impossible (2012); Society of the Snow (2023);"
        "Papillon (1973); Apocalypto (2006); Captain Phillips (2013); Lone Survivor (2013); The Edge (1997); Kon-Tiki (2012);"
        "47 Meters Down (2017); Arctic (2018)"),
        ["بهترین فیلم~های بقا و زنده~ماندن", "فیلم~هایی که ببینید می~فهمید ارزش زندگی چیه", "تنها در دل طبیعت؛ فیلم~های بقا"],
        ["کدوم فیلم بقا بهتره؟", "نبرد فیلم~های بقا و زنده~ماندن"],
        ["وقتی همه چیز از دست رفته و فقط اراده می~مونه. کدوم فیلم رو نفس~بریده دیدین؟",
         "فیلم~هایی دربارهٔ مرز بین مرگ و زندگی."],
        ["بقا", "ماجراجویی"]),
    _c("disaster", "movie", _parse(
        "Titanic (1997); The Impossible (2012); Twister (1996); Armageddon (1998); Deep Impact (1998); The Day After Tomorrow (2004);"
        "2012 (2009); Volcano (1997); Dante's Peak (1997); The Towering Inferno (1974); Poseidon (2006); San Andreas (2015);"
        "Contagion (2011); Outbreak (1995); The Perfect Storm (2000); Independence Day (1996); Pompeii (2014); The Core (2003);"
        "Sully (2016); Deepwater Horizon (2016); Greenland (2020); Don't Look Up (2021); The Wave (2015); Flight (2012)"),
        ["بهترین فیلم~های فاجعه و بلایای طبیعی", "فیلم~هایی که دنیا توشون به هم می~ریزه", "فاجعه روی پرده؛ فیلم~های برتر"],
        ["کدوم فیلم فاجعه بهتره؟", "نبرد فیلم~های فاجعه"],
        ["زلزله، سونامی، شهاب~سنگ و هرچی که فکرش رو بکنید. کدوم رو بیشتر باور کردین؟",
         "فیلم~هایی که دنیا رو به آستانهٔ نابودی می~رسونن."],
        ["فاجعه", "اکشن"]),
    _c("music_films", "movie", _parse(
        "La La Land (2016); Whiplash (2014); Bohemian Rhapsody (2018); Rocketman (2019); A Star Is Born (2018); Walk the Line (2005);"
        "Ray (2004); The Sound of Music (1965); Singin' in the Rain (1952); West Side Story (1961); West Side Story (2021);"
        "Chicago (2002); Moulin Rouge! (2001); Les Misérables (2012); The Greatest Showman (2017); Mamma Mia! (2008);"
        "Sing Street (2016); Once (2007); Begin Again (2013); Amadeus (1984); Grease (1978); Cabaret (1972);"
        "Dreamgirls (2006); Almost Famous (2000); Straight Outta Compton (2015); 8 Mile (2002); Inside Llewyn Davis (2013);"
        "Elvis (2022); Mary Poppins (1964); My Fair Lady (1964)"),
        ["بهترین فیلم~های موسیقایی و موزیکال", "فیلم~هایی که با موسیقی~شون یادتون می~مونن", "موسیقی و سینما؛ بهترین فیلم~ها"],
        ["کدوم فیلم موسیقایی بهتره؟", "نبرد فیلم~های موزیکال"],
        ["فیلم~هایی که آهنگ~هاشون تا مدت~ها توی سرتون می~مونه. کدوم آهنگ هنوز براتون زنده~ست؟",
         "از زندگی~نامهٔ ستاره~های موسیقی تا موزیکال~های کلاسیک."],
        ["موسیقی", "موزیکال"]),
    _c("friendship", "movie", _parse(
        "The Intouchables (2011); Stand by Me (1986); Toy Story (1995); Good Will Hunting (1997); The Shawshank Redemption (1994);"
        "Green Book (2018); Rain Man (1988); Thelma & Louise (1991); Dumb and Dumber (1994); Superbad (2007); The Hangover (2009);"
        "Booksmart (2019); Midnight Run (1988); Butch Cassidy and the Sundance Kid (1969); Lethal Weapon (1987); Rush Hour (1998);"
        "Fried Green Tomatoes (1991); 3 Idiots (2009); Dil Chahta Hai (2001); Zindagi Na Milegi Dobara (2011); Sideways (2004);"
        "The Bucket List (2007); Y Tu Mamá También (2001); Ted (2012)"),
        ["بهترین فیلم~های دوستی", "فیلم~هایی که دوستی رو جشن می~گیرن", "دوست~های سینما؛ فیلم~هایی که باید با رفیق دید"],
        ["کدوم فیلم دوستی بهتره؟", "نبرد فیلم~های دوستی"],
        ["این فیلم~ها رو با رفیق~هاتون ببینید. با کدوم دوست~تون یاد کدوم فیلم می~افتید؟",
         "دوستی~های ماندگار روی پرده."],
        ["دوستی", "کمدی"]),
    _c("family", "movie", _parse(
        "Home Alone (1990); Little Miss Sunshine (2006); The Royal Tenenbaums (2001); The Incredibles (2004); Coco (2017);"
        "Meet the Parents (2000); Parenthood (1989); Mrs. Doubtfire (1993); Finding Nemo (2003); Big Fish (2003);"
        "August: Osage County (2013); Captain Fantastic (2016); Little Women (2019); Kramer vs. Kramer (1979); Ordinary People (1980);"
        "The Descendants (2011); The Squid and the Whale (2005); Tokyo Story (1953); Shoplifters (2018); Still Walking (2008);"
        "Like Father, Like Son (2013); Nebraska (2013); Marriage Story (2019); Eat Drink Man Woman (1994); The Farewell (2019);"
        "Fences (2016); The Tree of Life (2011)"),
        ["بهترین فیلم~های خانوادگی", "فیلم~هایی دربارهٔ خانواده؛ با همه~ی خوبی~ها و بدی~هاش", "فیلم~هایی که با خانواده می~شه دید"],
        ["کدوم فیلم خانوادگی بهتره؟", "نبرد فیلم~های خانواده"],
        ["خانواده، جایی که همه چیز شروع میشه. کدوم فیلم شما رو به یاد خانواده~تون انداخت؟",
         "از کمدی~های شاد تا درام~های تلخ دربارهٔ خانواده."],
        ["خانوادگی", "درام"]),
    _c("underrated", "movie", _parse(
        "The Fall (2006); Children of Men (2006); Blade Runner (1982); The Iron Giant (1999); Donnie Darko (2001); Office Space (1999);"
        "The Big Lebowski (1998); Moon (2009); Hot Fuzz (2007); In Bruges (2008); Gattaca (1997); Sunshine (2007); Zodiac (2007);"
        "Dredd (2012); Cloud Atlas (2012); The Nice Guys (2016); Edge of Tomorrow (2014); Brazil (1985);"
        "Scott Pilgrim vs. the World (2010); Snowpiercer (2013); Source Code (2011); Predestination (2014); Coherence (2013);"
        "Hunt for the Wilderpeople (2016); Locke (2013); Bone Tomahawk (2015); The Man from Earth (2007); Warrior (2011);"
        "Kubo and the Two Strings (2016); The Lighthouse (2019)"),
        ["فیلم~هایی که حقشون دیده نشدنه", "فیلم~های دست~کم گرفته شده~ای که باید دید", "شاهکارهای کم~سروصدا"],
        ["کدوم فیلم دست~کم گرفته شده بهتره؟", "نبرد فیلم~های دست~کم گرفته شده"],
        ["بعضی فیلم~ها وقتی اومدن دیده نشدن و بعد از چند سال ارزششون معلوم شد. شما کدومشون رو دوست دارید؟",
         "فیلم~هایی که حیف بود نبینید."],
        ["دست~کم گرفته شده", "پیشنهادی"]),
    _c("iranian_social", "movie", _parse(
        "Just 6.5 (2019); Nahid (2015); A Man of Integrity (2017); The Salesman (2016); A Separation (2011); About Elly (2009);"
        "Fireworks Wednesday (2006); Under the Skin of the City (2001); Hit the Road (2021); Leila's Brothers (2022); A Hero (2021);"
        "Ballad of a White Cow (2020); The Circle (2000); The Lizard (2004); The Color of Paradise (1999); Baran (2001);"
        "Marmoulak (2004); Life and Nothing More (1992); Through the Olive Trees (1994); The Runner (1984);"
        "Bashu, the Little Stranger (1989); Children of Heaven (1997); Close-Up (1990)"),
        ["درام~های اجتماعی ایرانی که باید دید", "فیلم~های ایرانی که جامعه رو آینه گرفتن", "بهترین فیلم~های ایرانی از نگاه اجتماعی"],
        ["کدوم فیلم اجتماعی ایرانی بهتره؟", "نبرد درام~های اجتماعی ایران"],
        ["فیلم~هایی که زندگی روزمره رو بدون فیلتر نشون میدن. کدومش بیشتر با شما حرف زد؟",
         "سینمای اجتماعی ایران، از کلاسیک~ها تا فیلم~های امروز."],
        ["ایرانی", "اجتماعی"]),
    _c("series_comedy", "tv_series", _parse(
        "Friends (1994); The Office (2005); Seinfeld (1989); Parks and Recreation (2009); Brooklyn Nine-Nine (2013);"
        "How I Met Your Mother (2005); The Big Bang Theory (2007); Arrested Development (2003); Community (2009); Modern Family (2009);"
        "Curb Your Enthusiasm (2000); Schitt's Creek (2015); Ted Lasso (2020); 30 Rock (2006); Frasier (1993);"
        "It's Always Sunny in Philadelphia (2005); Scrubs (2001); Fleabag (2016); Veep (2012); What We Do in the Shadows (2019)"),
        ["بهترین سریال~های کمدی", "سریال~هایی که از خنده روده~بر می~شید", "کمدی~هایی که می~شه صدبار دید"],
        ["کدوم سریال کمدی بهتره؟", "نبرد سریال~های کمدی"],
        ["سریال~هایی که همیشه حال آدم رو خوب می~کنن. کدوم رو بیشتر بار دیدین؟",
         "برای شب~هایی که فقط می~خواید بخندید."],
        ["کمدی", "سریال~های خنده~دار"]),
    _c("series_fantasy", "tv_series", _parse(
        "Game of Thrones (2011); House of the Dragon (2022); The Witcher (2019); Vikings (2013); The Last Kingdom (2015);"
        "His Dark Materials (2019); Merlin (2008); Outlander (2014); Shadow and Bone (2021); The Wheel of Time (2021);"
        "Rome (2005); Spartacus (2010); Black Sails (2014); The Mandalorian (2019); Arcane (2021);"
        "The Lord of the Rings: The Rings of Power (2022); Dark Matter (2015); Penny Dreadful (2014); Troy: Fall of a City (2018)"),
        ["بهترین سریال~های حماسی و فانتزی", "سریال~هایی با جهان~های بزرگ و جنگ~های حماسی", "حماسه و فانتزی روی صفحهٔ کوچک"],
        ["کدوم سریال حماسی بهتره؟", "نبرد سریال~های فانتزی و حماسی"],
        ["اژدها، شمشیر و تاج و تخت. کدوم دنیا رو بیشتر دوست دارید؟",
         "سریال~هایی که ساعت~ها شما رو به جهان دیگه~ای می~برن."],
        ["فانتزی", "حماسی"]),
    _c("series_prestige", "tv_series", _parse(
        "Chernobyl (2019); Band of Brothers (2001); The Pacific (2010); The Crown (2016); Downton Abbey (2010); Mare of Easttown (2021);"
        "Normal People (2020); The Queen's Gambit (2020); Boardwalk Empire (2010); Succession (2018); Mad Men (2007);"
        "The Handmaid's Tale (2017); Big Little Lies (2017); This Is Us (2016); Six Feet Under (2001); Friday Night Lights (2006);"
        "The Bear (2022); Gilmore Girls (2000); Shameless (2011); Rome (2005)"),
        ["بهترین سریال~های درام و مینی~سریال~های تحسین~شده", "درام~هایی که باید در کارنامه~تون باشن", "سریال~هایی که جایزه جمع کردن"],
        ["کدوم سریال درام بهتره؟", "نبرد سریال~های درام"],
        ["قصه~های عمیق و بازیگری درخشان. کدوم رو تا آخر دیدین؟",
         "سریال~هایی که اگه ندیدید، باید تو فهرست~تون باشن."],
        ["درام", "مینی~سریال"]),
    _c("series_animation", "tv_series", _parse(
        "Rick and Morty (2013); BoJack Horseman (2014); Avatar: The Last Airbender (2005); The Simpsons (1989); South Park (1997);"
        "Arcane (2021); Attack on Titan (2013); Death Note (2006); Cowboy Bebop (1998); Fullmetal Alchemist: Brotherhood (2009);"
        "Family Guy (1999); Futurama (1999); Bob's Burgers (2011); Gravity Falls (2012); Hunter x Hunter (2011);"
        "Neon Genesis Evangelion (1995); Love, Death & Robots (2019); Castlevania (2017)"),
        ["بهترین سریال~های انیمیشنی", "انیمه و انیمیشن؛ سریال~هایی که باید دید", "سریال~های انیمیشنی که فقط برای بچه~ها نیستن"],
        ["کدوم سریال انیمیشنی بهتره؟", "نبرد انیمه و انیمیشن~های سریالی"],
        ["از سیمپسون~ها تا انیمه~های تاریک، همه یه جا. کدوم رو بیشتر دوست دارید؟",
         "انیمیشن~هایی که کلی فکر پشتشونه."],
        ["انیمیشن", "انیمه"]),
    _c("series_scifi", "tv_series", _parse(
        "The Expanse (2015); Battlestar Galactica (2004); Star Trek: The Next Generation (1987); Firefly (2002); Foundation (2021);"
        "Doctor Who (2005); The X-Files (1993); Altered Carbon (2018); Babylon 5 (1993); Star Trek: Discovery (2017); Andor (2022);"
        "Silo (2023); For All Mankind (2019); Halo (2022); Orphan Black (2013); Stranger Things (2016); Westworld (2016);"
        "The Mandalorian (2019); Black Mirror (2011); Dark (2017)"),
        ["بهترین سریال~های علمی~تخیلی و فضایی", "سریال~هایی که آینده رو نشونتون میدن", "علمی~تخیلی روی صفحهٔ کوچک"],
        ["کدوم سریال علمی~تخیلی بهتره؟", "نبرد سریال~های علمی~تخیلی"],
        ["سفینه~ها، ماورا و پرسش~هایی دربارهٔ آینده. کدوم رو بیشتر دوست دارید؟",
         "از کلاسیک~های ستاره~ای تا سریال~های امروزی."],
        ["علمی~تخیلی", "فضایی"]),
    _c("series_spy", "tv_series", _parse(
        "Homeland (2011); The Americans (2013); 24 (2001); Killing Eve (2018); Slow Horses (2022); Bodyguard (2018); Line of Duty (2012);"
        "Luther (2010); Sherlock (2010); The Night Manager (2016); Fauda (2015); Tehran (2020); Jack Ryan (2018); Alias (2001);"
        "Person of Interest (2011); Money Heist (2017); Prison Break (2005); True Detective (2014); Mindhunter (2017);"
        "Breaking Bad (2008)"),
        ["بهترین سریال~های جاسوسی و پلیسی", "سریال~های مهیج جاسوسی که نفس رو بند میارن", "مأمور~ها و جاسوس~ها روی صفحهٔ کوچک"],
        ["کدوم سریال جاسوسی بهتره؟", "نبرد سریال~های جاسوسی و پلیسی"],
        ["دروغ، خیانت و ساعت~شماری برای نجات. کدوم سریال شما رو میخکوب کرد؟",
         "سریال~هایی که هر قسمتشون با تعلیق تموم میشه."],
        ["جاسوسی", "مهیج"]),
)

CONCEPTS_BY_KEY = {c.key: c for c in CONCEPTS}


def pick_concepts(rng: random.Random, work: str) -> list[Concept]:
    """The concepts of this kind of work, in a random order."""
    pool = [c for c in CONCEPTS if c.work == work]
    rng.shuffle(pool)
    return pool
