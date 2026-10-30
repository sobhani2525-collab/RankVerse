import { describe, expect, it } from "vitest";
import { pickInRun, pickPayload, startRun } from "@/lib/home-battles";

describe("winner-stays run", () => {
  it("keeps the winner in its slot and brings the next challenger", () => {
    const run = pickInRun(startRun("a", "b", ["c", "d"]), 1);
    expect(run.slots).toEqual(["c", "b"]);
    expect(run.champ).toBe(1);
    expect(run.queue).toEqual(["d"]);
    expect(run.picks).toBe(1);
  });

  it("saves the pick as champion, challenger and winner", () => {
    const run = pickInRun(startRun("a", "b", ["c"]), 0); // a stays, c arrives
    expect(pickPayload(run, 1)).toEqual({ champion: "a", challenger: "c", winner: "c" });
  });

  it("finishes with the last winner when nobody is left", () => {
    const run = pickInRun(startRun("a", "b", []), 0);
    expect(run.done).toBe(true);
    expect(run.winner).toBe("a");
    expect(pickInRun(run, 1)).toBe(run);
  });
});
