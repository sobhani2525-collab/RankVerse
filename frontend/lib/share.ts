export type ShareSource = "telegram" | "whatsapp" | "eitaa" | "instagram" | "copy" | "native";

/** Tags a shared link so shares can be counted later; pages ignore ref/src. */
export function withShareParams(url: string, src: ShareSource): string {
  try {
    const u = new URL(url);
    u.searchParams.set("ref", "share");
    u.searchParams.set("src", src);
    return u.toString();
  } catch {
    return url;
  }
}

export function telegramShareUrl(url: string, text: string): string {
  return `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
}

export function whatsappShareUrl(url: string, text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;
}

// TODO(manual test): the Eitaa share-link pattern below mirrors Telegram's and
// is NOT confirmed as official -- الگوی لینک ایتا باید دستی تست شود.
export function eitaaShareUrl(url: string, text: string): string {
  return `https://eitaa.com/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
}

/** Touch devices get the OS share sheet; desktops get ShareMenu's popover. */
export function prefersNativeShare(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") return false;
  try {
    return window.matchMedia("(pointer: coarse)").matches;
  } catch {
    return false;
  }
}

export function canShareFile(file: File): boolean {
  return typeof navigator !== "undefined" && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
}

export function downloadBlob(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
