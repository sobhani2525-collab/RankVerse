import ConditionalHeader from "@/components/ConditionalHeader";
import AuthGateModal from "@/components/AuthGateModal";
import { AuthProvider } from "@/lib/auth-context";
import { AuthGateProvider } from "@/contexts/AuthGateContext";
import { FavoritesProvider } from "@/contexts/FavoritesContext";
import { WatchLaterProvider } from "@/contexts/WatchLaterContext";
import type { Metadata } from "next";
import { vazirmatn, jetbrainsMono, lalezar } from "./fonts";
import "./globals.css";
import { SITE_DESCRIPTION, SITE_LOCALE, SITE_NAME, SITE_TAGLINE, SITE_URL } from "@/lib/site";

// NOTE: no alternates.canonical and no openGraph.url here -- children
// inherit them, so every page would canonicalize to "/". Each page sets its
// own. (A page's openGraph also REPLACES this one rather than merging, so
// pages that set it repeat siteName/locale.)
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — ${SITE_TAGLINE}`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: SITE_LOCALE,
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    images: ["/logo.png"],
  },
  twitter: { card: "summary" },
  robots: { index: true, follow: true, "max-image-preview": "large" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="fa"
      dir="rtl"
      className={`${vazirmatn.variable} ${jetbrainsMono.variable} ${lalezar.variable}`}
    >
      <body className="min-h-screen antialiased">
        <AuthProvider>
          <AuthGateProvider>
            <FavoritesProvider>
              <WatchLaterProvider>
                <ConditionalHeader />
                {children}
                <AuthGateModal />
              </WatchLaterProvider>
            </FavoritesProvider>
          </AuthGateProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
