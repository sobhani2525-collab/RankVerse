"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { getListBySlug } from "@/lib/api";
import { ListDetail, ListComment } from "@/lib/types";
import ListActions from "./ListActions";
import ListComments from "./ListComments";
import AddListItem from "./AddListItem";
import ListItemsManager from "./ListItemsManager";

export default function ListDetailClient({
  slug,
  initialDetail,
  initialComments,
}: {
  slug: string;
  initialDetail: ListDetail;
  initialComments: ListComment[];
}) {
  const { token, loading: authLoading } = useAuth();
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
        <div className="mt-8">
          <AddListItem
            slug={slug}
            entityType={detail.entity_type}
            onAdded={() => {
              if (token) {
                getListBySlug(slug, token).then(setDetail);
              }
            }}
          />
        </div>
      )}

      <div className="mt-8">
        <ListItemsManager
          key={detail.items.map((i) => i.id).join(",")}
          slug={slug}
          isRanked={detail.is_ranked}
          isOwner={isOwner}
          initialItems={detail.items}
        />
      </div>

      <ListComments slug={slug} initialComments={initialComments} />
    </main>
  );
}