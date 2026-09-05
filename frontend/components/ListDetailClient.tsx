"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import { getListBySlug } from "@/lib/api";
import { ListDetail, ListComment } from "@/lib/types";
import ListActions from "./ListActions";
import ListComments from "./ListComments";
import AddListItem from "./AddListItem";

export default function ListDetailClient({
  slug,
  initialDetail,
  initialComments,
}: {
  slug: string;
  initialDetail: ListDetail;
  initialComments: ListComment[];
}) {
  const { token, user, loading: authLoading } = useAuth();
  const [detail, setDetail] = useState(initialDetail);

  useEffect(() => {
    if (!authLoading && token) {
      getListBySlug(slug, token)
        .then(setDetail)
        .catch(() => {
          // keep the publicly-fetched detail if the authenticated refetch fails
        });
    }
  }, [authLoading, token, slug]);

    const isOwner = detail.is_owner;

  return (
    <main className="mx-auto max-w-3xl px-6 py-14">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {detail.entity_type && (
          <span className="num rounded-full border border-border px-2.5 py-0.5 text-xs text-muted">
            {detail.entity_type}
          </span>
        )}
        {detail.tags.map((tag) => (
          <span key={tag} className="num rounded-full border border-teal/30 bg-teal/5 px-2.5 py-0.5 text-xs text-teal">
            #{tag}
          </span>
        ))}
      </div>

      <h1 className="text-2xl font-bold text-ink">{detail.title}</h1>
      {detail.owner_username && (
        <p className="mt-1 text-sm text-muted">
          ساخته شده توسط{" "}
          <span className="text-teal">@{detail.owner_username}</span>
        </p>
      )}
      {detail.description && (
        <p className="mt-3 text-ink/80">{detail.description}</p>
      )}

      <div className="mt-5">
        <ListActions
          slug={slug}
          initialLiked={detail.is_liked}
          initialFollowing={detail.is_following}
          initialLikeCount={detail.like_count}
          initialFollowerCount={detail.follower_count}
          isOwner={isOwner}
        />
      </div>

  {isOwner && (
        <AddListItem
          slug={slug}
          entityType={detail.entity_type}
          onAdded={() => {
            getListBySlug(slug, token).then(setDetail);
          }}
        />
      )}
      <div className="mt-8 flex flex-col gap-3">
        {detail.items.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface/60 px-6 py-10 text-center text-muted">
            این لیست هنوز آیتمی ندارد.
          </div>
        ) : (
          detail.items.map((item, idx) => {
            const posterUrl = item.entity.poster_path
              ? `https://image.tmdb.org/t/p/w200${item.entity.poster_path}`
              : null;
            return (
              <div
                key={item.id}
                className="flex items-center gap-4 rounded-xl border border-border bg-surface/60 px-4 py-3"
              >
                {detail.is_ranked && (
                  <span className="num w-9 shrink-0 text-center text-lg text-muted">
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                )}
                <div className="h-16 w-11 shrink-0 overflow-hidden rounded-md bg-surface2">
                  {posterUrl ? (
                    <Image
                      src={posterUrl}
                      alt={item.entity.title}
                      width={44}
                      height={64}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-muted">
                      —
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <Link
                    href={
                      item.entity.entity_type === "movie"
                        ? `/movies/${item.entity.slug}`
                        : "#"
                    }
                    className="truncate font-medium text-ink hover:text-gold"
                  >
                    {item.entity.title}
                  </Link>
                  {item.note && (
                    <p className="mt-0.5 truncate text-sm text-muted">{item.note}</p>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <ListComments slug={slug} initialComments={initialComments} />
    </main>
  );
}