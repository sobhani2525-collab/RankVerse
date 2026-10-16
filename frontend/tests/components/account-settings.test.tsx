import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const api = vi.hoisted(() => ({ changeMyPassword: vi.fn(), deleteMyAccount: vi.fn() }));
const auth = vi.hoisted(() => ({ getToken: vi.fn(() => "tok"), logout: vi.fn() }));
const router = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("@/lib/api", () => api);
vi.mock("@/lib/auth-context", () => ({ useAuth: () => auth }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import AccountSettings from "@/components/profile/account-settings";

beforeEach(() => {
  vi.clearAllMocks();
  auth.getToken.mockReturnValue("tok");
});

async function fillPasswords(user: ReturnType<typeof userEvent.setup>, current: string, next: string, repeat: string) {
  await user.type(screen.getByLabelText("رمز فعلی"), current);
  await user.type(screen.getByLabelText("رمز جدید"), next);
  await user.type(screen.getByLabelText("تکرار رمز جدید"), repeat);
  await user.click(screen.getByRole("button", { name: "تغییر رمز" }));
}

describe("change password form", () => {
  it("refuses a repeat that does not match, without calling the API", async () => {
    const user = userEvent.setup();
    render(<AccountSettings />);
    await fillPasswords(user, "OldSecret!1", "NewSecret!123", "NewSecret!124");
    expect(await screen.findByRole("alert")).toHaveTextContent("یکی نیست");
    expect(api.changeMyPassword).not.toHaveBeenCalled();
  });

  it("submits, confirms and clears the fields", async () => {
    api.changeMyPassword.mockResolvedValue({ changed: true });
    const user = userEvent.setup();
    render(<AccountSettings />);
    await fillPasswords(user, "OldSecret!1", "NewSecret!123", "NewSecret!123");
    expect(api.changeMyPassword).toHaveBeenCalledWith("tok", "OldSecret!1", "NewSecret!123");
    expect(await screen.findByRole("status")).toHaveTextContent("رمز عبور تغییر کرد");
    expect(screen.getByLabelText("رمز فعلی")).toHaveValue("");
  });

  it("shows the server's message when the current password is wrong", async () => {
    api.changeMyPassword.mockRejectedValue(new Error("رمز عبور فعلی درست نیست"));
    const user = userEvent.setup();
    render(<AccountSettings />);
    await fillPasswords(user, "wrong", "NewSecret!123", "NewSecret!123");
    expect(await screen.findByRole("alert")).toHaveTextContent("رمز عبور فعلی درست نیست");
  });
});

describe("delete account form", () => {
  it("asks for the password first and only then deletes, signs out and goes home", async () => {
    api.deleteMyAccount.mockResolvedValue({ deleted: true });
    const user = userEvent.setup();
    render(<AccountSettings />);

    expect(screen.queryByLabelText(/برای تأیید/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "حذف حساب من" }));
    await user.type(screen.getByLabelText(/برای تأیید/), "Sup3rSecret!1");
    await user.click(screen.getByRole("button", { name: "حذف همیشگی حساب" }));

    await waitFor(() => expect(api.deleteMyAccount).toHaveBeenCalledWith("tok", "Sup3rSecret!1"));
    expect(auth.logout).toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith("/");
  });

  it("keeps the session when the password is rejected", async () => {
    api.deleteMyAccount.mockRejectedValue(new Error("رمز عبور درست نیست"));
    const user = userEvent.setup();
    render(<AccountSettings />);
    await user.click(screen.getByRole("button", { name: "حذف حساب من" }));
    await user.type(screen.getByLabelText(/برای تأیید/), "nope");
    await user.click(screen.getByRole("button", { name: "حذف همیشگی حساب" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("رمز عبور درست نیست");
    expect(auth.logout).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });
});
