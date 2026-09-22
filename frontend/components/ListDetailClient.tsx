"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useAuthGate } from "@/contexts/AuthGateContext";
import { getListBySlug } from "@/lib/api";
import { ListDetail, ListComment } from "@/lib/types";
import ListComments from "./ListComments";
import AddListItem from "./AddListItem";
import ListItemsManager from "./ListItemsManager";
import ListEditPanel from "./ListEditPanel";
import ShareListButton from "./ShareListButton";
import ListLikeButton from "./ListLikeButton";
import ListFollowButton from "./ListFollowButton";

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
  const { requireAuth } = useAuthGate();
  const [detail, setDetail] = useState(initialDetail);
  const [isEditing, setIsEditing] = useState(false);
  const [showAddItemForm, setShowAddItemForm] = useState(false);

  function refetch() {
    if (token) {
      getListBySlug(slug, token).then(setDetail).catch(() => {});
    }
  }

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
  const canAddItemAuthed =
    isOwner ||
    detail.contribution_mode === "anyone" ||
    (detail.contribution_mode === "followers_only" && detail.is_following);
  // A logged-out visitor's follower status is unknown until they log in, so
  // don't pre-validate it -- show the button for anything but owner_only and
  // let the backend's permission check surface the real answer post-login.
  const showAddItemButton = token ? canAddItemAuthed : detail.contribution_mode !== "owner_only";

  return (
    <main className="mx-auto max-w-7xl px-6 py-14">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-2xl text-ink">{detail.title}</h1>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {isOwner && (
            <button
              onClick={() => setIsEditing((v) => !v)}
              className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition hover:border-gold/40 hover:text-gold"
            >
              {isEditing ? "بستن ویرایش" : "ویرایش"}
            </button>
          )}
          <ListFollowButton
            slug={slug}
            initialFollowing={detail.is_following}
            initialFollowerCount={detail.follower_count}
          />
          <ListLikeButton
            slug={slug}
            initialLiked={detail.is_liked}
            initialLikeCount={detail.like_count}
          />
          <ShareListButton slug={slug} title={detail.title} />
        </div>
      </div>

      {detail.description && (
        <p className="mt-3 text-ink/80">{detail.description}</p>
      )}

      {detail.owner_username && (
        <p className="mt-2 text-sm text-muted">
          ساخته شده توسط{" "}
          <Link href={`/profile/${detail.owner_username}`} className="text-teal hover:underline">
            @{detail.owner_username}
          </Link>
        </p>
      )}

      {isOwner && isEditing && (
        <ListEditPanel
          slug={slug}
          detail={detail}
          onSaved={() => {
            setIsEditing(false);
            refetch();
          }}
          onCancel={() => setIsEditing(false)}
        />
      )}

      <div className="mt-8">
        <ListItemsManager
          key={detail.items.map((i) => i.id).join(",")}
          slug={slug}
          listType={detail.list_type}
          isRanked={detail.is_ranked}
          isOwner={isOwner}
          initialItems={detail.items}
          canAddItem={showAddItemButton}
          showingAddForm={showAddItemForm}
          onRequestAdd={() => requireAuth(() => setShowAddItemForm(true))}
        />
      </div>

      {showAddItemForm && (
        <div className="mt-4">
          <AddListItem
            slug={slug}
            listId={detail.id}
            itemCount={detail.items.length}
            entityType={detail.entity_type}
            onAdded={refetch}
          />
        </div>
      )}

      <ListComments slug={slug} initialComments={initialComments} />
    </main>
  );
}
