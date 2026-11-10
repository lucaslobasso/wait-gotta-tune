import { midiToNote } from '../notes';
import { BASS, CHROMATIC, GUITAR, nextString, PROFILES, UKULELE } from '../tuningProfile';

function labels(profile: { targets: readonly { midi: number }[] }): string[] {
  return profile.targets.map((t) => {
    const note = midiToNote(t.midi);
    return `${note.name}${note.octave}`;
  });
}

describe('tuning profiles', () => {
  it('lists strings from string 1 (thinnest) to the last', () => {
    expect(labels(GUITAR)).toEqual(['E4', 'B3', 'G3', 'D3', 'A2', 'E2']);
    expect(labels(BASS)).toEqual(['G2', 'D2', 'A1', 'E1']);
    expect(labels(UKULELE)).toEqual(['A4', 'E4', 'C4', 'G4']);
  });

  it('offers Auto first, then the instruments', () => {
    expect(PROFILES.map((p) => p.name)).toEqual(['Auto', 'Guitar', 'Bass', 'Ukulele']);
    expect(CHROMATIC.targets).toHaveLength(0);
  });
});

describe('nextString', () => {
  it('moves to the next string down', () => {
    expect(nextString(6, 0, new Set([0]))).toBe(1);
    expect(nextString(6, 3, new Set([3]))).toBe(4);
  });

  it('wraps around to strings that are not done yet', () => {
    expect(nextString(6, 5, new Set([5]))).toBe(0);
    expect(nextString(4, 3, new Set([0, 3]))).toBe(1);
  });

  it('skips strings that are already done', () => {
    expect(nextString(6, 1, new Set([1, 2, 3]))).toBe(4);
  });

  it('returns null when every string is done', () => {
    expect(nextString(4, 3, new Set([0, 1, 2, 3]))).toBeNull();
  });
});
