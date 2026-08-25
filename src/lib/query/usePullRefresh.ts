// src/lib/query/usePullRefresh.ts
//
// RefreshControl state for a pull-to-refresh, tied to the USER'S pull only.
//
// Every screen used to wire `refreshing={isRefetching}`, which is true for any
// refetch — including the automatic refetchOnWindowFocus / refetchOnReconnect
// ones. Those spun the control with no gesture behind it, and on iOS a
// programmatically-shown spinner routinely fails to retract: the app came back
// to the foreground and the page sat there with a stuck spinner wedged under
// the header. Data still refreshes in the background; it just no longer drives
// this control.

import { useState } from 'react';

export function usePullRefresh(refetch: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);
  return {
    refreshing,
    onRefresh: async () => {
      setRefreshing(true);
      try {
        await refetch();
      } finally {
        setRefreshing(false);
      }
    },
  };
}
