import { AlgorithmsManager } from "./AlgorithmsManager";

export default function AdminAlgorithmsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-ink">الگوریتم‌ها</h1>
      <p className="mt-2 text-sm text-muted">
        امتیاز و رتبه‌بندی، Elo نبردها و Taste DNA: پارامترهای فعلی، وضعیت امتیازهای ذخیره‌شده، و توضیح قدم‌به‌قدم امتیاز هر عنوان با
        امکان شبیه‌سازی پارامترهای دیگر.
      </p>
      <AlgorithmsManager />
    </div>
  );
}
