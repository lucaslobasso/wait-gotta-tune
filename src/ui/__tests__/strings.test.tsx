import { fireEvent, render, screen } from '@testing-library/react-native';

import { GUITAR, PROFILES, UKULELE } from '../../music/tuningProfile';
import { CheckPanel } from '../CheckPanel';
import { ModePicker } from '../ModePicker';
import { StringList } from '../StringList';
import { StringReadout } from '../StringReadout';

// The fill bar is the only animated part; Reanimated needs native modules, so stub it.
jest.mock('../HoldProgress', () => ({ HoldProgress: () => null }));

const progress = { get: () => 0 } as never;

describe('ModePicker', () => {
  it('lists the modes and reports the one pressed', async () => {
    const onSelect = jest.fn();
    await render(<ModePicker profiles={PROFILES} selectedId="chromatic" onSelect={onSelect} />);
    expect(screen.getAllByRole('tab').map((tab) => tab.props.accessibilityState.selected)).toEqual([
      true,
      false,
      false,
      false,
    ]);
    await fireEvent.press(screen.getByText('Bass'));
    expect(onSelect).toHaveBeenCalledWith('bass');
  });
});

describe('StringList', () => {
  it('shows string 1 at the top and the last string at the bottom, with note and octave', async () => {
    await render(
      <StringList strings={GUITAR.targets} selected={null} done={new Set()} direction={null} onSelect={jest.fn()} />,
    );
    const rows = screen.getAllByRole('button');
    expect(rows.map((row) => row.props.accessibilityLabel)).toEqual([
      'String 1, E 4',
      'String 2, B 3',
      'String 3, G 3',
      'String 4, D 3',
      'String 5, A 2',
      'String 6, E 2',
    ]);
    expect(screen.getByText(/^E4$/)).toBeTruthy();
    expect(screen.getByText(/^E2$/)).toBeTruthy();
  });

  it('lists the ukulele strings A4 E4 C4 G4', async () => {
    await render(
      <StringList strings={UKULELE.targets} selected={null} done={new Set()} direction={null} onSelect={jest.fn()} />,
    );
    expect(screen.getAllByRole('button').map((row) => row.props.accessibilityLabel)).toEqual([
      'String 1, A 4',
      'String 2, E 4',
      'String 3, C 4',
      'String 4, G 4',
    ]);
  });

  it('selects a string when pressed', async () => {
    const onSelect = jest.fn();
    await render(
      <StringList strings={GUITAR.targets} selected={null} done={new Set()} direction={null} onSelect={onSelect} />,
    );
    await fireEvent.press(screen.getByLabelText('String 5, A 2'));
    expect(onSelect).toHaveBeenCalledWith(4);
  });

  it('marks the selected string and the ones already in tune', async () => {
    await render(
      <StringList strings={GUITAR.targets} selected={2} done={new Set([0, 1])} direction="up" onSelect={jest.fn()} />,
    );
    expect(screen.getByLabelText('String 1, E 4, in tune')).toBeTruthy();
    expect(screen.getByLabelText('String 3, G 3').props.accessibilityState.selected).toBe(true);
    expect(screen.getAllByText('✓')).toHaveLength(2);
  });
});

describe('StringList after a string check', () => {
  const verdicts = [
    { status: 'ok', cents: 2 },
    { status: 'flat', cents: -23 },
    { status: 'sharp', cents: 12 },
    { status: 'missing', cents: null },
    null,
    null,
  ] as const;

  it('shows each verdict and disables the strings that passed', async () => {
    const onSelect = jest.fn();
    await render(
      <StringList
        strings={GUITAR.targets}
        selected={1}
        done={new Set()}
        direction={null}
        onSelect={onSelect}
        verdicts={verdicts}
        skipped={new Set([0])}
      />,
    );
    const passed = screen.getByLabelText('String 1, E 4, in tune, skipped');
    expect(passed.props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(passed);
    expect(onSelect).not.toHaveBeenCalled();

    expect(screen.getByLabelText('String 2, B 3, 23 cents flat')).toBeTruthy();
    expect(screen.getByText('−23¢')).toBeTruthy();
    expect(screen.getByLabelText('String 3, G 3, 12 cents sharp')).toBeTruthy();
    expect(screen.getByText('+12¢')).toBeTruthy();
    expect(screen.getByText('?')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('String 3, G 3, 12 cents sharp'));
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it('is locked while a check runs and only marks strings already checked', async () => {
    const onSelect = jest.fn();
    const missing = { status: 'missing', cents: null } as const;
    await render(
      <StringList
        strings={UKULELE.targets}
        selected={2}
        done={new Set()}
        direction={null}
        onSelect={onSelect}
        verdicts={[{ status: 'ok', cents: 0 }, missing, missing, missing]}
        locked
      />,
    );
    await fireEvent.press(screen.getByLabelText('String 4, G 4'));
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByLabelText('String 1, A 4, in tune')).toBeTruthy();
    // String 2 was not heard; strings 3 (current) and 4 are still to come.
    expect(screen.getAllByText('?')).toHaveLength(1);
  });
});

describe('CheckPanel', () => {
  it('says which string to pluck and can be cancelled', async () => {
    const onCancel = jest.fn();
    await render(<CheckPanel index={2} midi={55} total={6} onCancel={onCancel} />);
    expect(screen.getByText('Pluck string 3')).toBeTruthy();
    expect(screen.getByLabelText('Pluck string 3, G 3')).toBeTruthy();
    await fireEvent.press(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
  });
});

describe('StringReadout', () => {
  it('asks to pluck the string when there is no signal', async () => {
    await render(<StringReadout target={40} display={null} progress={progress} />);
    expect(screen.getByText('Pluck the string')).toBeTruthy();
    expect(screen.getByLabelText('E 2, pluck the string')).toBeTruthy();
  });

  it('says to tune up when the string is flat', async () => {
    await render(
      <StringReadout
        target={40}
        display={{ note: 40, cents: -23, hz: 81.3, inTune: false, held: false }}
        progress={progress}
      />,
    );
    expect(screen.getByText(/Tune up/)).toBeTruthy();
    expect(screen.getByText(/−23 cents/)).toBeTruthy();
    expect(screen.getByLabelText('E 2, tune up')).toBeTruthy();
  });

  it('says to tune down when the string is sharp', async () => {
    await render(
      <StringReadout
        target={40}
        display={{ note: 40, cents: 140, hz: 89.3, inTune: false, held: false }}
        progress={progress}
      />,
    );
    expect(screen.getByText(/Tune down/)).toBeTruthy();
    expect(screen.getByLabelText('E 2, tune down')).toBeTruthy();
  });

  it('shows in tune', async () => {
    await render(
      <StringReadout
        target={40}
        display={{ note: 40, cents: 1, hz: 82.5, inTune: true, held: false }}
        progress={progress}
      />,
    );
    expect(screen.getByText(/In tune/)).toBeTruthy();
    expect(screen.getByText('✓')).toBeTruthy();
  });
});
