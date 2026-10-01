"use client";

import { useEffect, useState } from "react";
import { toFaDigits } from "@/lib/format-number";

const SCORE_EVENT = "rankverse:entity-score";

/** Announce a fresh combined score (e.g. after a battle vote) so any
 *  LiveScore for the same entity on the page updates without a reload. */
export function publishEntityScore(entityId: string, score: number) {
  window.dispatchEvent(new CustomEvent(SCORE_EVENT, { detail: { entityId, score } }));
}

/** Shows an entity's combined score and follows publishEntityScore updates. */
export default function LiveScore({ entityId, score }: { entityId: string; score: number }) {
  const [live, setLive] = useState(score);

  useEffect(() => setLive(score), [score]);

  useEffect(() => {
    function onScore(e: Event) {
      const d = (e as CustomEvent<{ entityId: string; score: number }>).detail;
      if (d.entityId === entityId) setLive(d.score);
    }
    window.addEventListener(SCORE_EVENT, onScore);
    return () => window.removeEventListener(SCORE_EVENT, onScore);
  }, [entityId]);

  return <>{toFaDigits(live.toFixed(1))}</>;
}
