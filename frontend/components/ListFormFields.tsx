"use client";
import TagComposer from "@/components/TagComposer";
import { LIST_FIELD } from "@/components/form-styles";

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
      <label className="block">
        <span className="mb-1.5 block text-sm text-ink-dim">عنوان فهرست</span>
        <input
          type="text"
          required
          maxLength={200}
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder={titlePlaceholder}
          autoFocus={autoFocus}
          className={LIST_FIELD}
        />
      </label>

      {titleHint}

      <label className="block">
        <span className="mb-1.5 block text-sm text-ink-dim">توضیح (اختیاری)</span>
        <textarea
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="این فهرست دربارهٔ چیست؟ چرا این آیتم‌ها؟"
          rows={3}
          className={LIST_FIELD}
        />
      </label>

      <TagComposer tags={tags} onChange={onTagsChange} />
    </>
  );
}
