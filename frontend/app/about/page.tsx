import Link from "next/link";
import { LegalPage, LegalSection, legalMetadata } from "@/components/LegalPage";

export const metadata = legalMetadata(
  "/about",
  "درباره سینماگزین",
  "سینماگزین چیست، رتبه‌بندی‌هایش چطور ساخته می‌شوند و اطلاعات فیلم‌ها و سریال‌ها از کجا می‌آید.",
);

export default function AboutPage() {
  return (
    <LegalPage
      kicker="About"
      title="درباره سینماگزین"
      intro="سینماگزین جایی برای کشف سینماست: فیلم‌ها، سریال‌ها، هنرمندان و ژانرها را روی یک نقشهٔ به‌هم‌پیوسته می‌بینی، امتیاز می‌دهی، در نبردها رأی می‌دهی و فهرست خودت را می‌سازی."
    >
      <LegalSection title="رتبه‌بندی‌ها چطور ساخته می‌شوند">
        <p>
          امتیاز هر اثر ترکیبی است از امتیاز کاربران سینماگزین، امتیازهای مرجع جهانی و نتیجهٔ نبردها. اثری که هنوز رأی کافی ندارد به
          میانگین نزدیک نگه داشته می‌شود تا چند رأی محدود آن را بالا یا پایین نبرد. هرچه کاربران بیشتری رأی بدهند، سهم نظر
          جامعهٔ سینماگزین بیشتر می‌شود. <Link href="/rankings">رتبه‌بندی‌ها</Link> را ببین.
        </p>
      </LegalSection>

      <LegalSection title="نقشهٔ ارتباط‌ها">
        <p>
          پشت سایت یک گراف دانش است: هر فیلم به کارگردان، بازیگران، ژانرها و آثار مشابهش وصل است. همین ارتباط‌ها پیشنهادها،
          «سلیقهٔ سینمایی» تو و فهرست‌های پیشنهادی را می‌سازند.
        </p>
      </LegalSection>

      <LegalSection title="منبع اطلاعات">
        <p>
          اطلاعات و پوستر فیلم‌ها، سریال‌ها و هنرمندان از{" "}
          <a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer">
            TMDb
          </a>{" "}
          گرفته شده است. This product uses the TMDB API but is not endorsed or certified by TMDB. خلاصهٔ داستان‌ها و
          زندگی‌نامه‌هایی که به فارسی در دسترس نبودند به کمک هوش مصنوعی ترجمه شده‌اند و ممکن است خطا داشته باشند.
        </p>
      </LegalSection>

      <LegalSection title="با ما در تماس باش">
        <p>
          پیشنهاد، گزارش خطا یا اصلاح اطلاعات را از <Link href="/contact">ارتباط با ما</Link> بفرست. قواعد سایت در{" "}
          <Link href="/terms">قوانین استفاده</Link> و نحوهٔ نگه‌داری اطلاعاتت در <Link href="/privacy">حریم خصوصی</Link> آمده است.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
