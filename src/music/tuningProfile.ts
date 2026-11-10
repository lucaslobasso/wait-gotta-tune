/**
 * A tuning mode. A profile with no targets is chromatic ("Auto"): the tuner snaps to
 * the nearest note. An instrument profile lists its strings from string 1 (the
 * thinnest, drawn at the top) to the last string (drawn at the bottom).
 */
export type TuningTarget = { midi: number };

export type TuningProfile = { id: string; name: string; targets: readonly TuningTarget[] };

function strings(...midi: number[]): TuningTarget[] {
  return midi.map((m) => ({ midi: m }));
}

export const CHROMATIC: TuningProfile = { id: 'chromatic', name: 'Auto', targets: [] };

/** Standard tuning, string 1 to 6: E4 B3 G3 D3 A2 E2. */
export const GUITAR: TuningProfile = {
  id: 'guitar',
  name: 'Guitar',
  targets: strings(64, 59, 55, 50, 45, 40),
};

/** Standard 4-string tuning, string 1 to 4: G2 D2 A1 E1. */
export const BASS: TuningProfile = { id: 'bass', name: 'Bass', targets: strings(43, 38, 33, 28) };

/** Standard re-entrant tuning, string 1 to 4: A4 E4 C4 G4 (the 4th string is the high G). */
export const UKULELE: TuningProfile = {
  id: 'ukulele',
  name: 'Ukulele',
  targets: strings(69, 64, 60, 67),
};

export const PROFILES: readonly TuningProfile[] = [CHROMATIC, GUITAR, BASS, UKULELE];

/**
 * The string to tune after `current`: the next one down that is not done yet,
 * wrapping around to the top. Null when every string is done.
 */
export function nextString(
  count: number,
  current: number,
  done: ReadonlySet<number>,
): number | null {
  for (let step = 1; step <= count; step++) {
    const index = (current + step) % count;
    if (!done.has(index)) return index;
  }
  return null;
}
