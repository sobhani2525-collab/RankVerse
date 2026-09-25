import ConditionalHeader from "@/components/ConditionalHeader";
import AuthGateModal from "@/components/AuthGateModal";
import { AuthProvider } from "@/lib/auth-context";
import { AuthGateProvider } from "@/contexts/AuthGateContext";
import { FavoritesProvider } from "@/contexts/FavoritesContext";
import { WatchLaterProvider } from "@/contexts/WatchLaterContext";
import type { Metadata } from "next";
import { vazirmatn, jetbrainsMono, lalezar } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
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
