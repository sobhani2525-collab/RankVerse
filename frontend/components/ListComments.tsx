"use client";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { addListComment } from "@/lib/api";
import { ListComment } from "@/lib/types";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fa-IR");
}

export default function ListComments({
  slug,
  initialComments,
}: {
  slug: string;
  initialComments: ListComment[];
}) {
  const { token, isAuthenticated, user } = useAuth();
  const [comments, setComments] = useState(initialComments);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !body.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const comment = await addListComment(token, slug, { body: body.trim() });
      setComments((prev) => [...prev, { ...comment, username: user?.username ?? comment.username }]);
      setBody("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در ارسال نظر");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-10">
      <h2 className="mb-4 text-lg font-bold text-ink">
        نظرات <span className="num text-muted">({comments.length})</span>
      </h2>

      {isAuthenticated ? (
        <form onSubmit={handleSubmit} className="mb-6 flex flex-col gap-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="نظر خود را بنویسید..."
            rows={2}
            className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-ink outline-none focus:border-gold/50"
          />
          {error && <p className="text-sm text-gold">{error}</p>}
          <button
            type="submit"
            disabled={submitting || !body.trim()}
            className="self-end rounded-lg bg-gold px-4 py-2 text-sm font-bold text-bg transition hover:bg-gold/90 disabled:opacity-50"
          >
            {submitting ? "در حال ارسال..." : "ارسال نظر"}
          </button>
        </form>
      ) : (
        <p className="mb-6 text-sm text-muted">برای ثبت نظر وارد حساب کاربری‌تان شوید.</p>
      )}

      {comments.length === 0 ? (
        <p className="text-sm text-muted">هنوز نظری ثبت نشده. اولین نفر باشید!</p>
      ) : (
        <div className="flex flex-col gap-4">
          {comments.map((c) => (
            <div key={c.id} className="rounded-lg border border-border bg-surface/60 px-4 py-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm font-medium text-teal">
                  @{c.username ?? "کاربر"}
                </span>
                <span className="num text-xs text-muted">{formatDate(c.created_at)}</span>
              </div>
              <p className="text-sm text-ink">{c.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}