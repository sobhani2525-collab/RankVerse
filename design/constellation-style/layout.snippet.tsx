// Drop into app/layout.tsx — only the <html>/<body> className changes.
import { vazirmatn, plexMono, lalezar } from "./fonts";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="fa"
      dir="rtl"
      className={`${vazirmatn.variable} ${plexMono.variable} ${lalezar.variable}`}
    >
      <body className="bg-bg text-ink font-sans">{children}</body>
    </html>
  );
}
