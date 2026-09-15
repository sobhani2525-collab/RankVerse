"use client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import LoginForm from "@/components/LoginForm";

export default function LoginPage() {
  const router = useRouter();

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-14">
      <h1 className="text-center text-2xl font-bold text-ink">ورود به RankVerse</h1>
      <p className="mt-2 text-center text-sm text-muted">
        برای رای‌دادن به فیلم‌ها وارد حساب خود شوید
      </p>

      <div className="mt-8">
        <LoginForm onSuccess={() => router.push("/")} />
      </div>

      <p className="mt-4 text-center text-sm">
        <Link href="/forgot-password" className="text-teal hover:underline">
          فراموشی رمز عبور
        </Link>
      </p>

      <p className="mt-6 text-center text-sm text-muted">
        حساب ندارید؟{" "}
        <Link href="/register" className="text-teal hover:underline">
          ثبت‌نام کنید
        </Link>
      </p>
    </main>
  );
}
