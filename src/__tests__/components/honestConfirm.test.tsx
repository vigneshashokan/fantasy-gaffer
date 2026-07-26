// #174 — the app is advisory-only: confirming saves a plan, it does NOT write
// back to FPL. ApplyAllCard used to claim "Your team has been updated" (false,
// and a missed deadline for anyone who believed it) and ConfirmTransferBar's
// confirm was an empty TODO with no feedback at all. Both now state what really
// happened and hand off to the official FPL app.
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { apexTokens } from '@/constants/apexTokens';

jest.mock('@/lib/external', () => ({ __esModule: true, openFplTeam: jest.fn() }));

import { ApplyAllCard } from '@/components/team/ApplyAllCard';
import { ConfirmTransferBar } from '@/components/transfer/ConfirmTransferBar';
import { openFplTeam } from '@/lib/external';

const tk = apexTokens(true, 'classic');

beforeEach(() => (openFplTeam as jest.Mock).mockClear());

describe('ApplyAllCard — honest confirm copy', () => {
  it('never claims the FPL team was updated', () => {
    const { getByText, queryByText } = render(
      <ApplyAllCard count={2} onUndo={jest.fn()} onConfirm={jest.fn()} tk={tk} />,
    );
    fireEvent.press(getByText('Save plan'));
    expect(queryByText('Your team has been updated')).toBeNull();
    expect(getByText('Plan saved')).toBeTruthy();
    expect(getByText('Apply it in the official FPL app before the deadline')).toBeTruthy();
  });

  it('offers a working handoff to FPL, and only clears on Done', () => {
    const onConfirm = jest.fn();
    const { getByText } = render(
      <ApplyAllCard count={1} onUndo={jest.fn()} onConfirm={onConfirm} tk={tk} />,
    );
    fireEvent.press(getByText('Save plan'));
    // The saved state must survive long enough to be tapped — it used to
    // self-dismiss on a 1150ms timer.
    fireEvent.press(getByText('Open FPL'));
    expect(openFplTeam).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.press(getByText('Done'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe('ConfirmTransferBar — post-tap state', () => {
  it('confirms into a saved state with an FPL handoff instead of doing nothing', () => {
    const { getByText, queryByText } = render(
      <ConfirmTransferBar outName="Haaland" inName="Wood" onDone={jest.fn()} tk={tk} />,
    );
    fireEvent.press(getByText('Confirm transfer'));
    expect(queryByText('Confirm transfer')).toBeNull();
    expect(
      getByText('Plan saved — apply it in the official FPL app before the deadline'),
    ).toBeTruthy();
    fireEvent.press(getByText('Open FPL'));
    expect(openFplTeam).toHaveBeenCalledTimes(1);
  });

  it('dismisses via Done', () => {
    const onDone = jest.fn();
    const { getByText } = render(
      <ConfirmTransferBar outName="Haaland" inName="Wood" onDone={onDone} tk={tk} />,
    );
    fireEvent.press(getByText('Confirm transfer'));
    fireEvent.press(getByText('Done'));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
