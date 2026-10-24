import { notFound } from "next/navigation";
import { AuthorAvatar } from "@/components/lists/list-card";
import ListTicketCard from "@/components/lists/list-ticket-card";
import TasteDnaSection from "@/components/TasteDnaSection";
import ProfileStats from "@/components/profile/profile-stats";
import { SectionHeading } from "@/components/list-detail/ui";
import { ListIcon, SwordsIcon, MessageCircleIcon } from "@/components/list-detail/icons";
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

  return (
    <main className="mx-auto max-w-[1440px] px-4 pb-24 pt-10 lg:px-20 lg:pt-16">
      <div className="flex items-center gap-5 border-b border-border-soft pb-10">
        <AuthorAvatar
          author={{ username: user.username, avatarKey: user.avatar_key }}
          sizeClassName="h-20 w-20 md:h-24 md:w-24"
          textClassName="text-3xl md:text-4xl"
        />
        <div className="min-w-0">
          <h1 className="font-display text-3xl text-ink md:text-4xl">{user.display_name || user.username}</h1>
          {user.display_name && (
            <p dir="ltr" className="mt-1 text-right text-sm text-muted">
              @{user.username}
            </p>
          )}
          {user.bio && <p className="mt-3 max-w-xl whitespace-pre-line text-[15px] leading-8 text-ink/85">{user.bio}</p>}
        </div>
      </div>

      <div className="mt-10">
        <ProfileStats
          contributionScore={contribution?.contribution_score ?? null}
          stats={[
            { key: "lists", value: lists.length, label: "فهرست ساخته‌شده", icon: <ListIcon size={18} />, tone: "text-teal" },
            { key: "votes", value: contribution?.battles_count ?? 0, label: "رأی در نبردها", icon: <SwordsIcon size={18} />, tone: "text-violet-light" },
            { key: "comments", value: contribution?.comments_count ?? 0, label: "نظر", icon: <MessageCircleIcon size={18} />, tone: "text-ink-dim" },
          ]}
        />
      </div>

      {taste && (
        <section className="mt-14">
          <SectionHeading en="TASTE DNA" fa="دی‌ان‌ای سلیقه" />
          <div className="mt-5">
            <TasteDnaSection profile={taste} hideAnchors perspective="other" />
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
