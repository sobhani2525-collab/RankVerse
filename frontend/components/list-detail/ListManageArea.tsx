"use client";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useAuthGate } from "@/contexts/AuthGateContext";
import ListItemsManager from "@/components/ListItemsManager";
import { useListViewer } from "./ListViewerContext";
import ConstellationSpine from "./ConstellationSpine";
import AddItemNode from "./AddItemNode";
import { SectionHeading } from "./ui";
import { PlusIcon } from "./icons";

/**
 * The "NODES" section: the constellation spine with the add-item node at
 * its end, and -- for viewers who can edit -- the existing
 * ListItemsManager (reorder/remove) in place of the spine. Leaving edit
 * mode refreshes the page so the spine's edges are recomputed.
 */
export default function ListManageArea() {
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
  // An item still being saved has no real id yet to reorder or remove.
  const savingItem = detail.items.some((i) => i.id.startsWith("temp-"));

  function toggleManaging() {
    if (managing) refresh();
    setManaging((v) => !v);
  }

  function openAdd() {
    requireAuth(() => {
      if (managing) {
        setManaging(false);
        refresh();
      }
      setAdding(true);
    });
  }

  const toolButton = "flex h-11 items-center gap-1.5 rounded-xl border px-3.5 text-[13px] font-bold transition";

  return (
    <section aria-labelledby="list-nodes-heading" className="flex flex-col">
      <div className="mb-6 border-b border-border-soft pb-5 lg:mb-9 lg:pb-7" id="list-nodes-heading">
        <SectionHeading
          en="NODES"
          fa="آیتم‌های لیست"
          aside={
            (canManage || showAdd) && (
              <div className="flex gap-2">
                {canManage && detail.items.length > 0 && (
                  <button
                    type="button"
                    onClick={toggleManaging}
                    disabled={savingItem}
                    aria-pressed={managing}
                    className={`${toolButton} border-border font-normal text-muted hover:border-teal/40 hover:text-teal disabled:opacity-50`}
                  >
                    {managing ? "پایان ویرایش" : "مدیریت آیتم‌ها"}
                  </button>
                )}
                {showAdd && (
                  <button
                    type="button"
                    onClick={openAdd}
                    className={`${toolButton} border-dashed border-[#4CC9A6] bg-[rgba(76,201,166,0.08)] text-[#4CC9A6] hover:bg-[rgba(76,201,166,0.14)]`}
                  >
                    <PlusIcon size={16} />
                    افزودن آیتم
                  </button>
                )}
              </div>
            )
          }
        />
      </div>

      {managing ? (
        <ListItemsManager
          key={detail.items.map((i) => i.id).join(",")}
          slug={slug}
          listType={detail.list_type}
          isRanked={detail.is_ranked}
          isOwner={detail.is_owner}
          initialItems={detail.items}
        />
      ) : (
        <ConstellationSpine
          addSlot={showAdd && <AddItemNode open={adding} onOpen={openAdd} onClose={() => setAdding(false)} />}
        />
      )}
    </section>
  );
}
