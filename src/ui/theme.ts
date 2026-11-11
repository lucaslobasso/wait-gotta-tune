export const colors = {
  bg: '#0B0D10',
  /** Background when the pitch is right on the note. */
  bgInTune: '#0B3D26',
  surface: '#151A21',
  line: '#2A323D',
  text: '#F2F4F7',
  dim: '#7B8794',
  /** Too high: tune down (amber, shown on the right). */
  offPitch: '#FFB020',
  /** Too low: tune up (blue, shown on the left). */
  tooLow: '#4DA3FF',
  inTune: '#3DDC84',
  error: '#FF5D5D',
} as const;

export const MAX_COLUMN_WIDTH = 560;
