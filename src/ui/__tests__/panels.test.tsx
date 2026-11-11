import { fireEvent, render, screen } from '@testing-library/react-native';

import { NoteReadout } from '../NoteReadout';
import { StatusPanel } from '../StatusPanel';

describe('StatusPanel', () => {
  it('offers a start button when idle', async () => {
    const onPress = jest.fn();
    await render(<StatusPanel status="idle" error={null} onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Tap to start' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('shows progress without a button while starting', async () => {
    await render(<StatusPanel status="requesting" error={null} onPress={jest.fn()} />);
    expect(screen.getByText('Starting microphone…')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('explains a denied permission and links to settings', async () => {
    await render(<StatusPanel status="denied" error={null} onPress={jest.fn()} />);
    expect(screen.getByText(/needs the microphone/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open settings' })).toBeTruthy();
  });

  it('shows the error message with a retry button', async () => {
    await render(<StatusPanel status="error" error="No microphone was found." onPress={jest.fn()} />);
    expect(screen.getByText('No microphone was found.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });
});

describe('NoteReadout', () => {
  it('asks for a note when there is no signal', async () => {
    await render(<NoteReadout display={null} />);
    expect(screen.getByText('Play a note')).toBeTruthy();
  });

  it('shows the note, octave, cents and frequency', async () => {
    await render(
      <NoteReadout display={{ note: 70, cents: 12, hz: 469.5, inTune: false, held: false }} />,
    );
    expect(screen.getByText('A')).toBeTruthy();
    expect(screen.getByText('♯')).toBeTruthy();
    // The octave of the note itself, and of the neighbouring note (B4).
    expect(screen.getAllByText('4')).toHaveLength(2);
    expect(screen.getByText(/^B4$/)).toBeTruthy();
    expect(screen.getByText(/\+12 cents/)).toBeTruthy();
    expect(screen.getByText(/469\.5 Hz/)).toBeTruthy();
    expect(screen.getByLabelText('A sharp 4, 12 cents sharp')).toBeTruthy();
  });

  it('shows the neighbouring note on the side the pitch leans to, and none in tune', async () => {
    const { rerender } = await render(
      <NoteReadout display={{ note: 69, cents: 20, hz: 445.1, inTune: false, held: false }} />,
    );
    expect(screen.getByText(/^A♯4$/)).toBeTruthy();
    expect(screen.queryByText(/^G♯4$/)).toBeNull();

    await rerender(
      <NoteReadout display={{ note: 69, cents: -20, hz: 434.9, inTune: false, held: false }} />,
    );
    expect(screen.getByText(/^G♯4$/)).toBeTruthy();
    expect(screen.queryByText(/^A♯4$/)).toBeNull();

    await rerender(
      <NoteReadout display={{ note: 69, cents: 2, hz: 440.5, inTune: true, held: false }} />,
    );
    expect(screen.queryByText(/^G♯4$/)).toBeNull();
    expect(screen.queryByText(/^A♯4$/)).toBeNull();
  });

  it('says so in words when in tune, and describes flat notes', async () => {
    const { rerender } = await render(
      <NoteReadout display={{ note: 64, cents: 1, hz: 329.8, inTune: true, held: false }} />,
    );
    expect(screen.getByText(/In tune ✓/)).toBeTruthy();
    expect(screen.getByLabelText('E 4, in tune')).toBeTruthy();

    await rerender(
      <NoteReadout display={{ note: 64, cents: -20, hz: 325.8, inTune: false, held: false }} />,
    );
    expect(screen.getByText(/−20 cents/)).toBeTruthy();
    expect(screen.getByLabelText('E 4, 20 cents flat')).toBeTruthy();
  });
});
