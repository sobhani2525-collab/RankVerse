import { MessagesManager } from "./MessagesManager";

export default function AdminMessagesPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-ink">پیام‌های کاربران</h1>
      <p className="mt-2 text-sm text-muted">
        پیام‌های صفحهٔ «ارتباط با ما»: گزارش خطا، محتوای نامناسب، اطلاعات نادرست، پیشنهادها و درخواست‌های حق نشر.
      </p>
      <MessagesManager />
    </div>
  );
}
