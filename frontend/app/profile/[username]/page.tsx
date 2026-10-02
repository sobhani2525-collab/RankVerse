import { notFound } from "next/navigation";
import { AuthorAvatar } from "@/components/lists/list-card";
import ListTicketCard from "@/components/lists/list-ticket-card";
import StatTile from "@/components/profile/stat-tile";
import TasteDnaSection from "@/components/TasteDnaSection";
import ProgressBar from "@/components/ProgressBar";
import { SectionHeading } from "@/components/list-detail/ui";
import { ListIcon, SwordsIcon, MessageCircleIcon } from "@/components/list-detail/icons";
import { toFaDigits } from "@/lib/format-number";
import { getPublicUser, getPublicUserLists, getPublicTasteDna, isNotFoundError } from "@/lib/api";
import { listSummaryToTicketCard } from "@/lib/entity-card-adapters";

export const revalidate = 600;

// No paths are prerendered at build; each one is rendered on its first
// visit and then served from the ISR cache. Without this export the route
// is fully dynamic and `revalidate` above only affects the fetch cache.
export async function generateStaticParams() {
  return [];
}

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;

  // Both reads only need the username, so they run together.
  const listsPromise = getPublicUserLists(username).catch(
    (): Awaited<ReturnType<typeof getPublicUserLists>> => [],
  );
  const tastePromise = getPublicTasteDna(username).catch(() => null);
  let user;
  try {
    user = await getPublicUser(username);
  } catch (err) {
    // Only a real 404 is a 404: a timeout or 5xx rethrows, so ISR keeps
    // the last good page instead of caching "not found" for an hour.
    if (isNotFoundError(err)) notFound();
    throw err;
  }
  const [lists, taste] = await Promise.all([listsPromise, tastePromise]);
  const contribution = taste?.contribution_stats ?? null;
  const contributionPercent =
    contribution != null ? Math.max(0, Math.min(100, contribution.contribution_score)) : null;

  return (
    <main className="mx-auto max-w-[1440px] px-4 pb-24 pt-10 lg:px-20 lg:pt-16">
      <div className="flex items-center gap-5 border-b border-border-soft pb-10">
        <AuthorAvatar
          author={{ username: user.username }}
          sizeClassName="h-20 w-20 md:h-24 md:w-24"
          textClassName="text-2xl md:text-3xl"
        />
        <div>
          <h1 className="font-display text-3xl text-ink md:text-4xl">{user.username}</h1>
        </div>
      </div>

      <div className="mt-10">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
          <StatTile
            mono="LISTS"
            value={toFaDigits(lists.length)}
            label="فهرست‌های ساخته‌شده"
            icon={<ListIcon size={20} />}
            accent="#4FB8A6"
            valueClassName="text-teal"
          />
          <StatTile
            mono="BATTLES"
            value={toFaDigits(contribution?.battles_count ?? 0)}
            label="نبرد"
            icon={<SwordsIcon size={20} />}
            accent="#A99BFF"
            valueClassName="text-violet-light"
          />
          <StatTile
            mono="COMMENTS"
            value={toFaDigits(contribution?.comments_count ?? 0)}
            label="نظر"
            icon={<MessageCircleIcon size={20} />}
            accent="#8A93A6"
          />
        </div>

        {contribution != null && contributionPercent != null && (
          <div className="mt-4 rounded-2xl border border-border-soft bg-surface/60 px-6 py-4">
            <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
              <span>امتیاز مشارکت</span>
              <span className="num text-ink">{toFaDigits(Math.round(contribution.contribution_score))}</span>
            </div>
            <ProgressBar value={contributionPercent} fillClassName="bg-teal" />
          </div>
        )}
      </div>

      {taste && (
        <section className="mt-14">
          <SectionHeading en="TASTE DNA" fa="دی‌ان‌ای سلیقه" />
          <div className="mt-5">
            <TasteDnaSection profile={taste} hideAnchors />
          </div>
        </section>
      )}

      <section className="mt-16">
        <SectionHeading en="CREATED LISTS" fa="فهرست‌های ساخته‌شده" />
        <div className="mt-5">
          {lists.length === 0 ? (
            <div className="rounded-2xl border border-border-soft bg-surface/60 px-5 py-8 text-center text-sm text-muted">
              این کاربر هنوز فهرست عمومی‌ای نساخته.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
              {lists.map((list) => (
                <ListTicketCard key={list.id} list={listSummaryToTicketCard(list)} />
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
