"use client";
import { useState } from "react";

export default function ShareListButton({ slug, title }: { slug: string; title: string }) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    const url = `${window.location.origin}/lists/${slug}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: `${title} | RankVerse`, url });
        return;
      } catch {
        // fall through to clipboard copy
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard permission denied; nothing more we can do
    }
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition hover:border-teal/40 hover:text-teal"
    >
      {copied ? "لینک کپی شد ✓" : "🔗 اشتراک‌گذاری"}
    </button>
  );
}
