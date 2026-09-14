import ConditionalHeader from "@/components/ConditionalHeader";
import { AuthProvider } from "@/lib/auth-context";
import type { Metadata } from "next";
import { Vazirmatn, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const vazirmatn = Vazirmatn({
  subsets: ["arabic"],
  variable: "--font-vazirmatn",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  // Needed so relative image URLs from file-convention metadata (like
  // opengraph-image.tsx) resolve to absolute URLs in og:image tags --
  // without it Next falls back to http://localhost:3000 even in prod,
  // since we're not on Vercel (no automatic VERCEL_URL).
  metadataBase: new URL("https://rankverse-frontend.sobhani2525.workers.dev"),
  title: "RankVerse — نقشه‌ی برترین‌های سینما",
  description:
    "رتبه‌بندی فیلم‌ها بر پایه گراف دانش، ترکیب هوش جمعی کاربران و هوش مصنوعی.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fa" dir="rtl" className={`${vazirmatn.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen antialiased">
        <AuthProvider>
          <ConditionalHeader />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
