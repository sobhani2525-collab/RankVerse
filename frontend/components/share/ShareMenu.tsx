"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ShareSource,
  canShareFile,
  copyText,
  downloadBlob,
  eitaaShareUrl,
  prefersNativeShare,
  telegramShareUrl,
  whatsappShareUrl,
  withShareParams,
} from "@/lib/share";

const STORY_FILENAME = "cinemagozin-champion.png";

interface Props {
  url: string;
  title: string;
  text: string;
  /** Lazily builds the story image; called only after the user interacts. */
  getImage?: () => Promise<Blob | null>;
  size?: number;
  shape?: "circle" | "square";
  /** "icon" = the round/square icon button; "button" = a labelled primary button. */
  variant?: "icon" | "button";
  label?: string;
}

/**
 * Share button. Touch devices open the OS share sheet (with the image file when
 * there is one, which is how Instagram stories/Telegram/WhatsApp get it); other
 * devices get a popover with Telegram / WhatsApp / Eitaa / Instagram / copy.
 */
export default function ShareMenu({ url, title, text, getImage, size = 44, shape = "circle", variant = "icon", label = "اشتراک‌گذاری" }: Props) {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Open upward when the popover would run off the bottom of the viewport.
  const [up, setUp] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const imagePromise = useRef<Promise<Blob | null> | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const flash = useCallback((msg: string) => {
    setNotice(msg);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 2500);
  }, []);
  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  // Started on pointerdown so the image is ready (or nearly) by the time the
  // click needs it -- browsers expire the user activation navigator.share needs.
  const prepareImage = useCallback((): Promise<Blob | null> => {
    if (!getImage) return Promise.resolve(null);
    if (!imagePromise.current) {
      const p = getImage().catch(() => null);
      imagePromise.current = p;
      void p.then((b) => {
        if (!b && imagePromise.current === p) imagePromise.current = null;
      });
    }
    return imagePromise.current;
  }, [getImage]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !popRef.current) return;
    const t = triggerRef.current.getBoundingClientRect();
    const h = popRef.current.offsetHeight + 16;
    setUp(window.innerHeight - t.bottom < h && t.top > window.innerHeight - t.bottom);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    popRef.current?.querySelector<HTMLElement>("a,button")?.focus();
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function onTrigger() {
    if (open) {
      setOpen(false);
      return;
    }
    if (prefersNativeShare()) {
      const blob = await prepareImage();
      const file = blob ? new File([blob], STORY_FILENAME, { type: "image/png" }) : null;
      const data: ShareData = { title, text, url: withShareParams(url, "native") };
      if (file && canShareFile(file)) data.files = [file];
      try {
        await navigator.share(data);
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return; // user closed the sheet
        // otherwise fall through to the popover
      }
    }
    setOpen(true);
  }

  async function copy() {
    const ok = await copyText(withShareParams(url, "copy"));
    flash(ok ? "لینک کپی شد" : "کپی لینک ممکن نشد");
    setOpen(false);
  }

  async function saveStory() {
    const blob = await prepareImage();
    if (!blob) {
      flash("ساخت تصویر ممکن نشد");
      return;
    }
    downloadBlob(blob, STORY_FILENAME);
    flash("تصویر ذخیره شد؛ آن را در استوری اینستاگرام بگذار");
    setOpen(false);
  }

  const link = (src: ShareSource, build: (u: string, t: string) => string) => build(withShareParams(url, src), text);

  const itemCls =
    "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-right text-[13px] text-ink-dim transition hover:bg-surface2 hover:text-teal focus-visible:bg-surface2 focus-visible:outline-none";

  const iconSize = variant === "icon" ? size * 0.4 : 16;

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onPointerDown={getImage ? () => void prepareImage() : undefined}
        onClick={onTrigger}
        style={variant === "icon" ? { width: size, height: size } : undefined}
        className={
          variant === "icon"
            ? `relative flex shrink-0 items-center justify-center border border-border transition hover:border-teal/40 hover:text-teal ${
                shape === "square" ? "rounded-xl bg-surface text-ink" : "rounded-full bg-surface/60 text-muted"
              }`
            : "btn-primary inline-flex items-center gap-2 text-sm hover:opacity-90"
        }
      >
        <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <line x1="8.6" y1="10.6" x2="15.4" y2="6.4" />
          <line x1="8.6" y1="13.4" x2="15.4" y2="17.6" />
        </svg>
        {variant === "button" && label}
      </button>

      {open && (
        <div ref={popRef} role="menu" dir="rtl" className={`absolute end-0 z-50 w-[min(15rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-1.5 text-right shadow-xl ${up ? "bottom-full mb-2" : "top-full mt-2"}`}>
          <a role="menuitem" aria-label="اشتراک در تلگرام" className={itemCls} href={link("telegram", telegramShareUrl)} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>
            تلگرام
          </a>
          <a role="menuitem" aria-label="اشتراک در واتس‌اپ" className={itemCls} href={link("whatsapp", whatsappShareUrl)} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>
            واتس‌اپ
          </a>
          <a role="menuitem" aria-label="اشتراک در ایتا" className={itemCls} href={link("eitaa", eitaaShareUrl)} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>
            ایتا
          </a>
          {getImage && (
            <button type="button" role="menuitem" aria-label="ذخیرهٔ تصویر برای استوری اینستاگرام" className={itemCls} onClick={saveStory}>
              ذخیرهٔ تصویر برای استوری اینستاگرام
            </button>
          )}
          <button type="button" role="menuitem" aria-label="کپی لینک" className={itemCls} onClick={copy}>
            کپی لینک
          </button>
        </div>
      )}

      {notice && (
        <span role="status" className="absolute end-0 top-full z-50 mt-2 whitespace-nowrap rounded-md border border-border bg-surface2 px-2 py-1 text-[11px] text-teal shadow">
          {notice}
        </span>
      )}
    </div>
  );
}
