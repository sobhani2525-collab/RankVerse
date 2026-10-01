import { cache } from "react";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import Link from "next/link";
import RelatedLists from "@/components/RelatedLists";
import ListComments from "@/components/ListComments";
import { ListViewerProvider } from "@/components/list-detail/ListViewerContext";
import ListHero from "@/components/list-detail/ListHero";
import ListDNA from "@/components/list-detail/ListDNA";
import ListManageArea from "@/components/list-detail/ListManageArea";
import ListBattlePreview from "@/components/list-detail/ListBattlePreview";
import { ListBattleProvider } from "@/components/list-detail/ListBattleContext";
import { getListBySlug, getListComments } from "@/lib/api";
import { entityPosterUrl } from "@/lib/list-constellation";
import { detailPathFor } from "@/lib/entity-routes";
import { displayTitle } from "@/lib/title";
import { toFaDigits } from "@/lib/format-number";
import { decodeListSlug, listHref } from "@/lib/list-url";
import { SITE_LOCALE, SITE_NAME, absoluteUrl, excerpt } from "@/lib/site";
import type { ListComment, ListDetail } from "@/lib/types";

// Shared by generateMetadata and the page so one request hits the API once.
const loadList = cache((slug: string) => getListBySlug(slug));

const MAX_NAMES_IN_DESCRIPTION = 4;

function itemNoun(detail: ListDetail): string {
  const types = new Set(detail.items.map((i) => i.entity.entity_type));
  const onlyMedia = [...types].every((t) => t === "movie" || t === "tv_series");
  if (!onlyMedia) return "مورد";
  if (types.size === 2) return "فیلم و سریال";
  return types.has("tv_series") ? "سریال" : "فیلم";
}

function listDescription(detail: ListDetail): string {
  if (detail.description?.trim()) return excerpt(detail.description, 160);
  const count = detail.items.length;
  const owner = detail.owner_username ? ` ساخته‌ی ${detail.owner_username}` : "";
  if (count === 0) return `لیست «${detail.title}»${owner} در ${SITE_NAME}.`;
  const names = detail.items
    .slice(0, MAX_NAMES_IN_DESCRIPTION)
    .map((i) => i.entity.title_fa || i.entity.title)
    .join("، ");
  const more = count > MAX_NAMES_IN_DESCRIPTION ? "…" : "";
  return excerpt(
    `لیست «${detail.title}»${owner} با ${toFaDigits(count)} ${itemNoun(detail)}: ${names}${more}`,
    160,
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const slug = decodeListSlug((await params).slug);
  let detail: ListDetail;
  try {
    detail = await loadList(slug);
  } catch {
    return { title: "لیست پیدا نشد", robots: { index: false, follow: false } };
  }

  const path = listHref(detail.slug);
  const description = listDescription(detail);
  const isPrivate = detail.visibility !== "public";
  const isEmpty = detail.items.length === 0;
  const first = detail.items[0]?.entity;
  const image = detail.cover_image_url || (first ? entityPosterUrl(first, "w780") : null);
  const keywords = [
    ...(detail.tags ?? []),
    ...detail.items.slice(0, 10).map((i) => i.entity.title_fa || i.entity.title),
    "لیست فیلم",
  ];

  return {
    title: detail.title,
    description,
    keywords,
    alternates: { canonical: path },
    robots: isPrivate
      ? { index: false, follow: false }
      : isEmpty
        ? { index: false, follow: true }
        : { index: true, follow: true },
    openGraph: {
      type: "article",
      url: path,
      siteName: SITE_NAME,
      locale: SITE_LOCALE,
      title: detail.title,
      description,
      publishedTime: detail.created_at,
      modifiedTime: detail.updated_at ?? undefined,
      tags: detail.tags,
      images: image ? [{ url: image }] : undefined,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title: detail.title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

function listJsonLd(detail: ListDetail) {
  const url = absoluteUrl(listHref(detail.slug));
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ItemList",
        "@id": `${url}#list`,
        name: detail.title,
        description: listDescription(detail),
        url,
        inLanguage: "fa-IR",
        numberOfItems: detail.items.length,
        ...(detail.owner_username
          ? { author: { "@type": "Person", name: detail.owner_username } }
          : {}),
        dateCreated: detail.created_at,
        ...(detail.updated_at ? { dateModified: detail.updated_at } : {}),
        itemListElement: detail.items.map((item, index) => {
          const path = detailPathFor(item.entity.entity_type, item.entity.slug);
          return {
            "@type": "ListItem",
            position: index + 1,
            name: displayTitle(item.entity),
            ...(path ? { url: absoluteUrl(path) } : {}),
          };
        }),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: SITE_NAME, item: absoluteUrl("/") },
          { "@type": "ListItem", position: 2, name: "لیست‌های کاربران", item: absoluteUrl("/lists") },
          { "@type": "ListItem", position: 3, name: detail.title, item: url },
        ],
      },
    ],
  };
}

/**
 * List detail ("Constellation" layout): the list as a path through the
 * knowledge graph. Desktop: hero + DNA, then spine + a 380px sidebar
 * (battle, related lists, comments). Mobile: one column in that order.
 */
export default async function ListDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const slug = decodeListSlug((await params).slug);

  let detail: ListDetail;
  try {
    detail = await loadList(slug);
  } catch {
    notFound();
  }

  // An old slug (after a rename, or a pre-Persian Finglish one) resolves
  // server-side; send it to the canonical URL. Outside the try/catch on
  // purpose: permanentRedirect works by throwing.
  if (detail.slug !== slug) permanentRedirect(listHref(detail.slug));

  let comments: ListComment[] = [];
  try {
    comments = await getListComments(detail.slug);
  } catch {
    comments = [];
  }

  return (
    <ListViewerProvider slug={detail.slug} initialDetail={detail}>
      <ListBattleProvider>
      <main className="mx-auto max-w-[1440px] px-4 pb-8 lg:px-20">
        {detail.visibility === "public" && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify(listJsonLd(detail)).replace(/</g, "\\u003c"),
            }}
          />
        )}
        <div className="flex flex-col gap-8 pb-9 pt-8 lg:flex-row lg:items-start lg:gap-14 lg:pb-14 lg:pt-[72px]">
          <ListHero detail={detail} />
          {detail.dna && <ListDNA dna={detail.dna} itemCount={detail.items.length} />}
        </div>

        <div className="flex flex-col gap-12 lg:flex-row lg:items-start lg:gap-14">
          <div className="min-w-0 flex-1">
            <ListManageArea />
          </div>

          <aside className="flex shrink-0 flex-col gap-10 lg:w-[380px] lg:gap-7">
            <ListBattlePreview />
            <RelatedLists slug={detail.slug} />
            <ListComments slug={detail.slug} initialComments={comments} />
          </aside>
        </div>

        <footer className="mt-14 flex flex-col gap-2 border-t border-border-soft pb-4 pt-6 text-xs leading-[1.8] text-dim lg:mt-20 lg:flex-row lg:items-center lg:justify-between lg:gap-6 lg:text-[13px]">
          <span>
            {detail.list_type === "community_ordered"
              ? "ترتیب این لیست با رأی کاربران تعیین می‌شود؛"
              : "ترتیب این لیست انتخاب سازنده است؛"}{" "}
            امتیاز ترکیبی از رأی جامعه، روند محبوبیت و نتایج نبردها محاسبه می‌شود.
          </span>
          <Link href="/rankings" className="flex min-h-[44px] shrink-0 items-center text-violet-light hover:text-ink">
            روش امتیازدهی
          </Link>
        </footer>
      </main>
      </ListBattleProvider>
    </ListViewerProvider>
  );
}
