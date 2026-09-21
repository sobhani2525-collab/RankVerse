import Link from "next/link";
import { notFound } from "next/navigation";
import ListCard, { AuthorAvatar } from "@/components/lists/list-card";
import { getPublicUser, getPublicUserLists } from "@/lib/api";
import { listSummaryToListCard } from "@/lib/entity-card-adapters";

export const revalidate = 120;

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;

  let user;
  try {
    user = await getPublicUser(username);
  } catch {
    notFound();
  }

  let lists: Awaited<ReturnType<typeof getPublicUserLists>> = [];
  try {
    lists = await getPublicUserLists(username);
  } catch {
    lists = [];
  }

  const joinedAt = new Date(user.created_at).toLocaleDateString("fa-IR");

  return (
    <main className="mx-auto max-w-3xl px-6 py-14">
      <Link href="/" className="text-sm text-muted hover:text-gold">
        بازگشت به فهرست
      </Link>

      <div className="mt-6 flex items-center gap-4">
        <AuthorAvatar author={{ username: user.username }} sizeClassName="h-16 w-16" textClassName="text-xl" />
        <div>
          <h1 className="font-display text-2xl text-ink">@{user.username}</h1>
          <p className="num mt-1 text-sm text-muted">عضویت از {joinedAt}</p>
        </div>
      </div>

      <h2 className="mt-10 mb-4 text-lg font-bold text-ink">لیست‌های {user.username}</h2>

      {lists.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface/60 px-6 py-10 text-center text-muted">
          این کاربر هنوز لیست عمومی‌ای نساخته.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-6">
          {lists.map((list) => (
            <ListCard key={list.id} list={listSummaryToListCard(list)} />
          ))}
        </div>
      )}
    </main>
  );
}
