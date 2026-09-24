import Link from "next/link";
import type { ListDetail } from "@/lib/types";
import { toFaDigits } from "@/lib/format-number";
import { relativeTimeFa } from "@/lib/relative-time";
import { connectionCount, isUpdatedToday, TAG_CHIP } from "@/lib/list-constellation";
import { Chip, MonoLabel, RingDot } from "./ui";
import ListHeroActions from "./ListHeroActions";

function kickerFor(detail: ListDetail): { en: string; fa: string } {
  if (detail.list_type === "community_ordered") {
    return { en: "USER LIST · COMMUNITY", fa: "لیست با ترتیب جمعی" };
  }
  return detail.is_ranked
    ? { en: "USER LIST · RANKED", fa: "لیست رتبه‌دار کاربر" }
    : { en: "USER LIST", fa: "لیست کاربر" };
}

export default function ListHero({ detail }: { detail: ListDetail }) {
  const kicker = kickerFor(detail);
  const nodes = detail.items.length;
  const links = connectionCount(detail);
  const updatedToday = detail.updated_at ? isUpdatedToday(detail.updated_at) : false;

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-[18px] lg:gap-6">
      <div className="flex items-center gap-3 lg:gap-3.5">
        <RingDot />
        <div className="flex flex-col gap-0.5 lg:gap-1">
          <MonoLabel className="text-dim" size="text-[11px] lg:text-xs">
            {kicker.en}
          </MonoLabel>
          <span className="text-[13px] text-muted lg:text-[15px]">{kicker.fa}</span>
        </div>
      </div>

      <h1 className="text-[34px] font-black leading-[1.3] text-ink lg:text-[68px] lg:leading-[1.15]">
        {detail.title}
        {nodes > 0 && (
          <>
            <br />
            <span className="text-dim">
              {toFaDigits(nodes)} گره، {toFaDigits(links)} اتصال.
            </span>
          </>
        )}
      </h1>

      {detail.description && (
        <p className="max-w-[720px] whitespace-pre-line text-[15px] leading-[1.9] text-ink-dim lg:text-lg">
          {detail.description}
        </p>
      )}

      <div className="flex items-center justify-between gap-3.5 lg:justify-start">
        {detail.owner_username && (
          <Link
            href={`/profile/${detail.owner_username}`}
            className="flex min-h-[44px] items-center gap-2.5 text-ink lg:gap-3"
          >
            <span
              className="flex h-10 w-10 items-center justify-center rounded-full border border-violet-light bg-surface-2 font-extrabold uppercase text-violet-light lg:h-11 lg:w-11"
              aria-hidden="true"
            >
              {detail.owner_username.charAt(0)}
            </span>
            <span className="flex flex-col">
              <span dir="ltr" className="text-sm font-bold lg:text-[15px]">
                @{detail.owner_username}
              </span>
              <span className="text-xs text-muted lg:text-[13px]">سازنده لیست</span>
            </span>
          </Link>
        )}
        {detail.owner_username && detail.updated_at && (
          <span className="hidden h-7 w-px bg-border lg:block" aria-hidden="true" />
        )}
        {detail.updated_at &&
          (updatedToday ? (
            <span className="flex items-center gap-2 text-xs text-teal lg:text-[13px]">
              <span className="h-[7px] w-[7px] rounded-full bg-teal shadow-[0_0_0_3px_rgba(79,184,166,0.18)]" />
              امروز به‌روز شد
            </span>
          ) : (
            <span className="text-xs text-dim lg:text-[13px]">
              به‌روزرسانی {relativeTimeFa(detail.updated_at)}
            </span>
          ))}
      </div>

      {detail.tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {detail.tags.map((tag) => (
            <Chip key={tag} tone={TAG_CHIP}>
              #{tag}
            </Chip>
          ))}
        </div>
      )}

      <ListHeroActions />
    </div>
  );
}
