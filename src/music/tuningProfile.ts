/**
 * Seam for future per-instrument modes. A profile with no targets is chromatic
 * ("auto"): the tuner snaps to the nearest note. Profiles with targets (e.g. guitar
 * E2 A2 D3 G3 B3 E4) will snap to the nearest target instead. Not used by any logic yet.
 */
export type TuningTarget = { midi: number; label?: string };

export type TuningProfile = { id: string; name: string; targets: readonly TuningTarget[] };

export const CHROMATIC: TuningProfile = { id: 'chromatic', name: 'Auto', targets: [] };
