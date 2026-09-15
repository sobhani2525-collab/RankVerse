"use client";
import { createContext, useContext, useCallback, useRef, useState, ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";

type PendingAction = () => void | Promise<void>;

interface AuthGateContextType {
  isModalOpen: boolean;
  /** True when the modal was opened by requireAuth (there's a reason to show), false for a plain openLoginModal(). */
  hasReason: boolean;
  requireAuth: (action: PendingAction) => void;
  openLoginModal: () => void;
  closeModal: () => void;
  /** Called by the modal itself after a successful login. */
  runPendingAction: () => void | Promise<void>;
}

const AuthGateContext = createContext<AuthGateContextType | undefined>(undefined);

export function AuthGateProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [hasReason, setHasReason] = useState(false);
  const pendingActionRef = useRef<PendingAction | null>(null);

  const requireAuth = useCallback(
    (action: PendingAction) => {
      if (isAuthenticated) {
        action();
        return;
      }
      pendingActionRef.current = action;
      setHasReason(true);
      setIsModalOpen(true);
    },
    [isAuthenticated]
  );

  const openLoginModal = useCallback(() => {
    pendingActionRef.current = null;
    setHasReason(false);
    setIsModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    // Dismissing without success drops the pending action -- it never runs.
    pendingActionRef.current = null;
    setIsModalOpen(false);
    setHasReason(false);
  }, []);

  const runPendingAction = useCallback(() => {
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    setIsModalOpen(false);
    setHasReason(false);
    return action?.();
  }, []);

  return (
    <AuthGateContext.Provider
      value={{ isModalOpen, hasReason, requireAuth, openLoginModal, closeModal, runPendingAction }}
    >
      {children}
    </AuthGateContext.Provider>
  );
}

export function useAuthGate() {
  const ctx = useContext(AuthGateContext);
  if (!ctx) throw new Error("useAuthGate must be used within AuthGateProvider");
  return ctx;
}
