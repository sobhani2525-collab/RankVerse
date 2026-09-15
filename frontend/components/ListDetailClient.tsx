"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useAuthGate } from "@/contexts/AuthGateContext";
import { getListBySlug } from "@/lib/api";
import { ListDetail, ListComment } from "@/lib/types";
import ListActions from "./ListActions";
import ListComments from "./ListComments";
import AddListItem from "./AddListItem";
import ListItemsManager from "./ListItemsManager";
import ListEditPanel from "./ListEditPanel";
import { CONTRIBUTION_MODE_LABELS } from "./ListSettings";
import ShareListButton from "./ShareListButton";

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
        <span className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted">
          {CONTRIBUTION_MODE_LABELS[detail.contribution_mode]}
        </span>
      </div>

      <div className="flex items-start justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink">{detail.title}</h1>
        {isOwner && (
          <button
            onClick={() => setIsEditing((v) => !v)}
            className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition hover:border-gold/40 hover:text-gold"
          >
            {isEditing ? "بستن ویرایش" : "ویرایش"}
          </button>
        )}
      </div>

      {detail.owner_username && (
        <p className="mt-1 text-sm text-muted">
          ساخته شده توسط{" "}
          <span className="text-teal">@{detail.owner_username}</span>
        </p>
      )}
      {detail.description && (
        <p className="mt-3 text-ink/80">{detail.description}</p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <ListActions
          slug={slug}
          initialLiked={detail.is_liked}
          initialFollowing={detail.is_following}
          initialLikeCount={detail.like_count}
          initialFollowerCount={detail.follower_count}
        />
        <ShareListButton slug={slug} title={detail.title} />
      </div>

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

      {showAddItemButton && !showAddItemForm && (
        <div className="mt-8">
          <button
            onClick={() => requireAuth(() => setShowAddItemForm(true))}
            className="rounded-lg border border-border px-4 py-2 text-sm text-ink transition hover:border-gold/40 hover:text-gold"
          >
            + افزودن آیتم
          </button>
        </div>
      )}

      {showAddItemForm && (
        <div className="mt-8">
          <AddListItem
            slug={slug}
            entityType={detail.entity_type}
            onAdded={refetch}
          />
        </div>
      )}

      <div className="mt-8">
        <ListItemsManager
          key={detail.items.map((i) => i.id).join(",")}
          slug={slug}
          listType={detail.list_type}
          isRanked={detail.is_ranked}
          isOwner={isOwner}
          initialItems={detail.items}
        />
      </div>

      <ListComments slug={slug} initialComments={initialComments} />
    </main>
  );
}
