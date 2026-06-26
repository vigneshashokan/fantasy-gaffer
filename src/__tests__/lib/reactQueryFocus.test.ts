// jest.mock is hoisted above the imports by babel-jest, which ensures
// @tanstack/react-query resolves to the same module instance both in the
// outer test scope *and* inside jest.isolateModules. Without this, isolateModules
// creates a fresh focusManager that the outer spy cannot intercept.
jest.mock('@tanstack/react-query', () => jest.requireActual('@tanstack/react-query'));

import { AppState } from 'react-native';
import { focusManager } from '@tanstack/react-query';

describe('reactQueryFocus', () => {
  it('bridges AppState foreground/background into focusManager', () => {
    // Stub setEventListener so the real focusManager does not immediately invoke
    // our setup with the real setFocused (which would subscribe AppState once at
    // import time and make the assertions below non-deterministic).
    const setSpy = jest
      .spyOn(focusManager, 'setEventListener')
      .mockImplementation(() => {});
    const remove = jest.fn();
    const addSpy = jest
      .spyOn(AppState, 'addEventListener')
      .mockReturnValue({ remove } as never);

    jest.isolateModules(() => {
      require('@/lib/reactQueryFocus');
    });

    // The module registered exactly one focus event listener.
    expect(setSpy).toHaveBeenCalledTimes(1);
    const setup = setSpy.mock.calls[0][0] as (
      h: (focused?: boolean) => void,
    ) => () => void;

    // Invoking the setup subscribes to AppState 'change'.
    const handleFocus = jest.fn();
    const cleanup = setup(handleFocus);
    expect(addSpy).toHaveBeenCalledWith('change', expect.any(Function));

    // 'active' -> focused true; anything else -> false.
    const onChange = addSpy.mock.calls[0][1] as (s: string) => void;
    onChange('active');
    expect(handleFocus).toHaveBeenLastCalledWith(true);
    onChange('background');
    expect(handleFocus).toHaveBeenLastCalledWith(false);

    // Cleanup removes the subscription.
    cleanup();
    expect(remove).toHaveBeenCalledTimes(1);

    setSpy.mockRestore();
    addSpy.mockRestore();
  });
});
