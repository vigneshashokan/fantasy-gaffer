// jest.mock is hoisted, so @tanstack/react-query resolves to the same module
// instance in the outer scope AND inside jest.isolateModules — otherwise
// isolateModules makes a fresh onlineManager the outer spy cannot intercept.
jest.mock('@tanstack/react-query', () => jest.requireActual('@tanstack/react-query'));

// jest.mock with no factory: tells Jest to use __mocks__/@react-native-community/netinfo.js.
// The explicit call (even with no factory) ensures isolateModules uses the same
// mock registry entry, so jest.requireMock() below returns the same instance
// as the import NetInfo in the module under test.
jest.mock('@react-native-community/netinfo');

import NetInfo from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';

describe('query onlineManager bridge', () => {
  it('drives onlineManager from NetInfo connectivity', () => {
    const setSpy = jest
      .spyOn(onlineManager, 'setEventListener')
      .mockImplementation(() => {});
    const unsubscribe = jest.fn();
    const addSpy = (NetInfo.addEventListener as jest.Mock).mockReturnValue(unsubscribe);

    jest.isolateModules(() => {
      require('@/lib/query/onlineManager');
    });

    // Registered exactly one online event listener.
    expect(setSpy).toHaveBeenCalledTimes(1);
    const setup = setSpy.mock.calls[0][0] as (
      setOnline: (online: boolean) => void,
    ) => () => void;

    // Invoking the setup subscribes to NetInfo.
    const setOnline = jest.fn();
    const cleanup = setup(setOnline);
    expect(addSpy).toHaveBeenCalledWith(expect.any(Function));

    // isConnected true -> online; false/null -> offline.
    const onChange = addSpy.mock.calls[0][0] as (
      s: { isConnected: boolean | null },
    ) => void;
    onChange({ isConnected: true });
    expect(setOnline).toHaveBeenLastCalledWith(true);
    onChange({ isConnected: false });
    expect(setOnline).toHaveBeenLastCalledWith(false);
    onChange({ isConnected: null });
    expect(setOnline).toHaveBeenLastCalledWith(false);

    // Cleanup unsubscribes.
    cleanup();
    expect(unsubscribe).toHaveBeenCalledTimes(1);

    setSpy.mockRestore();
    addSpy.mockReset();
  });
});
