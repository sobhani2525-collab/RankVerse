import { describe, expect, it } from "vitest";
import { withFollowing } from "@/lib/follow-toggle";

describe("withFollowing", () => {
  it("flips only the matching user", () => {
    const users = [{ id: "a", following: false }, { id: "b", following: false }];
    expect(withFollowing(users, "a", true)).toEqual([{ id: "a", following: true }, { id: "b", following: false }]);
  });
});
