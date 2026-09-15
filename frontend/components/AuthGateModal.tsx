"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthGate } from "@/contexts/AuthGateContext";
import LoginForm from "./LoginForm";

export default function AuthGateModal() {
  const router = useRouter();
  const { isModalOpen, hasReason, closeModal, runPendingAction } = useAuthGate();

  useEffect(() => {
    if (!isModalOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeModal();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isModalOpen, closeModal]);

  if (!isModalOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={closeModal}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm rounded-2xl border border-border bg-surface p-6"
      >
        <button
          onClick={closeModal}
          aria-label="بستن"
          className="absolute left-4 top-4 text-muted transition hover:text-ink"
        >
          ✕
        </button>

        <h2 className="text-center text-xl font-bold text-ink">ورود به حساب</h2>
        {hasReason && (
          <p className="mt-2 text-center text-sm text-muted">برای این کار باید وارد شوید</p>
        )}

        <div className="mt-6">
          <LoginForm onSuccess={runPendingAction} />
        </div>

        <p className="mt-4 text-center text-sm">
          <button
            type="button"
            onClick={() => {
              closeModal();
              router.push("/forgot-password");
            }}
            className="text-teal hover:underline"
          >
            فراموشی رمز عبور
          </button>
        </p>

        <p className="mt-6 text-center text-sm text-muted">
          حساب ندارید؟{" "}
          <button
            type="button"
            onClick={() => {
              closeModal();
              router.push("/register");
            }}
            className="text-teal hover:underline"
          >
            ثبت‌نام کنید
          </button>
        </p>
      </div>
    </div>
  );
}
