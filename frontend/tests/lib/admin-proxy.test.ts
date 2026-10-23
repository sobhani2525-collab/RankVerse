import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));

import { callerIp } from "@/lib/admin-proxy";

describe("callerIp", () => {
  it("takes the rightmost public hop, not the forgeable first one", () => {
    expect(callerIp("1.2.3.4, 203.0.113.9")).toBe("203.0.113.9");
    expect(callerIp("1.2.3.4, 203.0.113.9, 10.0.0.7, 172.20.1.1")).toBe("203.0.113.9");
    expect(callerIp("2001:db8::1, fd00::2")).toBe("2001:db8::1");
  });

  it("ignores junk and falls back to the nearest hop when nothing is public", () => {
    expect(callerIp("not-an-ip, 198.51.100.4")).toBe("198.51.100.4");
    expect(callerIp("127.0.0.1")).toBe("127.0.0.1");
    expect(callerIp(null)).toBeNull();
  });
});
