export type Slot = 0 | 1;

/** One in-place "winner stays" run: two slots on screen, the rest waiting in a queue. */
export interface RunState<T> {
  slots: [T, T];
  /** The slot whose item has been staying (the first pair has none yet; slot 0 stands in). */
  champ: Slot;
  queue: T[];
  done: boolean;
  winner: T | null;
  picks: number;
}

export function startRun<T>(a: T, b: T, rest: T[]): RunState<T> {
  return { slots: [a, b], champ: 0, queue: rest, done: false, winner: null, picks: 0 };
}

/** The pair a pick on `side` is saved as: the item that was staying, its challenger, and the one chosen. */
export function pickPayload<T>(run: RunState<T>, side: Slot): { champion: T; challenger: T; winner: T } {
  return { champion: run.slots[run.champ], challenger: run.slots[run.champ === 0 ? 1 : 0], winner: run.slots[side] };
}

/** The chosen item stays in its slot and the next one takes the other; with nobody left the run is done. */
export function pickInRun<T>(run: RunState<T>, side: Slot): RunState<T> {
  if (run.done) return run;
  const winner = run.slots[side];
  const picks = run.picks + 1;
  if (run.queue.length === 0) return { ...run, champ: side, done: true, winner, picks };
  const slots: [T, T] = side === 0 ? [winner, run.queue[0]] : [run.queue[0], winner];
  return { slots, champ: side, queue: run.queue.slice(1), done: false, winner: null, picks };
}
