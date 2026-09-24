"use client";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useAuthGate } from "@/contexts/AuthGateContext";
import ListItemsManager from "@/components/ListItemsManager";
import AddListItem from "@/components/AddListItem";
import { useListViewer } from "./ListViewerContext";
import { SectionHeading } from "./ui";

/**
 * The "NODES" section: shows the server-rendered spine (children), and
 * for viewers who can edit, swaps it for the existing ListItemsManager
 * (reorder/remove) and opens AddListItem. Leaving edit mode or adding an
 * item refreshes the page so the spine's edges are recomputed.
 */
export default function ListManageArea({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const { requireAuth } = useAuthGate();
  const { slug, detail, following, refresh } = useListViewer();
  const [managing, setManaging] = useState(false);
  const [adding, setAdding] = useState(false);

  const canManage = detail.is_owner || detail.items.some((i) => i.can_remove);
  const canAddAuthed =
    detail.is_owner ||
    detail.contribution_mode === "anyone" ||
    (detail.contribution_mode === "followers_only" && following);
  // A logged-out visitor's follower status is unknown until they log in, so
  // don't pre-validate it -- show the button for anything but owner_only and
  // let the backend's permission check surface the real answer post-login.
  const showAdd = token ? canAddAuthed : detail.contribution_mode !== "owner_only";

  function toggleManaging() {
    if (managing) refresh();
    setManaging((v) => !v);
  }

  const toolButton =
    "flex h-11 items-center rounded-xl border px-3.5 text-[13px] transition lg:h-10";

  return (
    <section aria-labelledby="list-nodes-heading" className="flex flex-col">
      <div className="mb-6 border-b border-border-soft pb-5 lg:mb-9 lg:pb-7" id="list-nodes-heading">
        <SectionHeading
          en="NODES"
          fa="آیتم‌های لیست"
          aside={
            (canManage || showAdd) && (
              <div className="flex gap-2">
                {showAdd && !adding && (
                  <button
                    type="button"
                    onClick={() => requireAuth(() => setAdding(true))}
                    className={`${toolButton} border-gold/40 text-gold hover:border-gold/70`}
                  >
                    + افزودن آیتم
                  </button>
                )}
                {canManage && detail.items.length > 0 && (
                  <button
                    type="button"
                    onClick={toggleManaging}
                    aria-pressed={managing}
                    className={`${toolButton} border-border text-muted hover:border-teal/40 hover:text-teal`}
                  >
                    {managing ? "پایان ویرایش" : "مدیریت آیتم‌ها"}
                  </button>
                )}
              </div>
            )
          }
        />
      </div>

      {adding && (
        <div className="mb-8 flex flex-col gap-3 rounded-2xl border border-border bg-surface/60 p-4">
          <AddListItem
            slug={slug}
            listId={detail.id}
            itemCount={detail.items.length}
            entityType={detail.entity_type}
            onAdded={refresh}
          />
          <button type="button" onClick={() => setAdding(false)} className="self-start text-sm text-muted hover:text-ink">
            بستن
          </button>
        </div>
      )}

      {managing ? (
        <ListItemsManager
          key={detail.items.map((i) => i.id).join(",")}
          slug={slug}
          listType={detail.list_type}
          isRanked={detail.is_ranked}
          isOwner={detail.is_owner}
          initialItems={detail.items}
        />
      ) : detail.items.length > 0 ? (
        children
      ) : (
        <div className="rounded-2xl border border-border bg-surface/60 px-6 py-10 text-center text-muted">
          این لیست هنوز آیتمی ندارد.
        </div>
      )}
    </section>
  );
}
