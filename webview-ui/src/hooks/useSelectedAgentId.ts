import { useEffect, useState } from 'react';

import type { OfficeState } from '../office/engine/officeState.js';

/**
 * The selected character's id as React state.
 *
 * Selection lives in the imperative OfficeState: the canvas toggles it on
 * click, the Debug View and the e2e hooks set it directly. React only needs to
 * know WHEN it changes, so this samples it once per frame (the cadence
 * ToolOverlay already re-renders at) and re-renders only on a change.
 */
export function useSelectedAgentId(officeState: OfficeState): number | null {
  const [selected, setSelected] = useState<number | null>(officeState.selectedAgentId);

  useEffect(() => {
    let rafId = 0;
    const tick = () => {
      const current = officeState.selectedAgentId;
      setSelected((prev) => (prev === current ? prev : current));
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [officeState]);

  return selected;
}
