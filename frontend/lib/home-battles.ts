export type PairSide = "a" | "b";

export interface PairVoteState {
  chosen: PairSide | null;
  votes: number;
}

/** The optimistic state after tapping a poster; a second tap on an already-voted pair changes nothing. */
export function applyPairVote(state: PairVoteState, side: PairSide): PairVoteState {
  if (state.chosen) return state;
  return { chosen: side, votes: state.votes + 1 };
}
