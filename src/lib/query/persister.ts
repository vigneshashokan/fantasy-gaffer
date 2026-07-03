// AsyncStorage-backed persistence for the React Query cache. On a cold start the
// dehydrated cache is rehydrated from disk so the last-known squad / Top Picks /
// players render offline (#39). While online, the short per-query staleTimes +
// refetchOnReconnect refresh it in the background.
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { serialize, deserialize } from './mapCodec';

// Offline window. A persisted query is only RESTORED on a cold start if its
// gcTime >= this value, so the QueryClient default gcTime is set to match it
// (see _layout.tsx). Keep the two in lockstep.
export const CACHE_MAX_AGE = 24 * 60 * 60 * 1000; // 24h

const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'fg-query-cache',
  // Coalesce rapid cache writes — the dehydrated blob is re-serialised on change.
  throttleTime: 1000,
  // Map-preserving codec: plain JSON turns Map-valued query data into "{}".
  serialize,
  deserialize,
});

// A new app build busts the cache, so a changed query shape never rehydrates
// stale-shaped data. The `|c2` cache-format token additionally discards
// pre-Map-codec blobs (which stored Maps as "{}") so they aren't rehydrated
// broken on the first launch after this fix — bump it on any future
// serialisation/shape change.
const buster = `${Constants.expoConfig?.version ?? 'dev'}|c2`;

export const persistOptions = {
  persister,
  maxAge: CACHE_MAX_AGE,
  buster,
};
