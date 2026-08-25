import { act, renderHook } from '@testing-library/react-native';
import { usePullRefresh } from '@/lib/query/usePullRefresh';

describe('usePullRefresh', () => {
  it('is only true while the pull it started is in flight', async () => {
    let resolve!: () => void;
    const refetch = jest.fn(() => new Promise<void>((r) => (resolve = r)));
    const { result } = renderHook(() => usePullRefresh(refetch));

    // A background refetch cannot reach this — nothing but onRefresh sets it.
    expect(result.current.refreshing).toBe(false);

    let pull!: Promise<void>;
    act(() => {
      pull = result.current.onRefresh();
    });
    expect(result.current.refreshing).toBe(true);

    await act(async () => {
      resolve();
      await pull;
    });
    expect(result.current.refreshing).toBe(false);
  });

  it('clears the spinner when the refetch rejects', async () => {
    const refetch = jest.fn(() => Promise.reject(new Error('offline')));
    const { result } = renderHook(() => usePullRefresh(refetch));

    await act(async () => {
      await result.current.onRefresh().catch(() => {});
    });
    expect(result.current.refreshing).toBe(false);
  });
});
