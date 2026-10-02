"use client";
import TagComposer from "@/components/TagComposer";

/**
 * Title / description / tags, shared by the new-list form and the list
 * edit panel so both look and behave the same.
 */
export default function ListFormFields({
  title,
  description,
  tags,
  onTitleChange,
  onDescriptionChange,
  onTagsChange,
  titlePlaceholder = "عنوان فهرست",
  autoFocus = false,
  titleHint,
}: {
  title: string;
  description: string;
  tags: string[];
  onTitleChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  onTagsChange: (v: string[]) => void;
  titlePlaceholder?: string;
  autoFocus?: boolean;
  /** Rendered right under the title (e.g. similar-list suggestions). */
  titleHint?: React.ReactNode;
}) {
  return (
    <>
      <label className="flex flex-col gap-2">
        <span className="text-sm font-bold text-ink-dim">عنوان فهرست</span>
        <input
          type="text"
          required
          maxLength={200}
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder={titlePlaceholder}
          autoFocus={autoFocus}
          className="w-full border-b-2 border-border bg-transparent pb-3 text-2xl font-extrabold leading-snug text-ink outline-none transition placeholder:font-bold placeholder:text-dim focus:border-gold lg:text-3xl"
        />
      </label>

      {titleHint}

      <label className="flex flex-col gap-2">
        <span className="text-sm font-bold text-ink-dim">
          توضیح <span className="font-normal text-dim">(اختیاری)</span>
        </span>
        <textarea
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="این فهرست دربارهٔ چیست؟ چرا این آیتم‌ها؟"
          rows={3}
          className="w-full resize-none rounded-xl border border-border bg-bg/40 px-3.5 py-3 text-[15px] leading-relaxed text-ink outline-none transition placeholder:text-dim focus:border-teal/50"
        />
      </label>

      <TagComposer tags={tags} onChange={onTagsChange} />
    </>
  );
}
