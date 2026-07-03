// src/lib/query/mapCodec.ts
//
// JSON (de)serialisation that PRESERVES Map values for the persisted query cache
// (#39). Plain JSON.stringify turns a Map into "{}" — so any query whose data is
// a Map (useProjections → Map<string,ProjectionStat>, useLive → Map<number,…>,
// season fixtures) rehydrated on cold start as a bare object and crashed every
// consumer that called .get() (TypeError: proj.get is not a function).
//
// We tag Map values on the way out and rebuild them on the way in. Pure and
// dependency-free (no react-native imports) so it unit-tests without the
// AsyncStorage chain; consumed by persister.ts.

const MAP_TAG = '$$map';

interface TaggedMap {
  [MAP_TAG]: [unknown, unknown][];
}

function isTaggedMap(value: unknown): value is TaggedMap {
  return (
    value != null &&
    typeof value === 'object' &&
    Array.isArray((value as Record<string, unknown>)[MAP_TAG])
  );
}

function replacer(_key: string, value: unknown): unknown {
  if (value instanceof Map) {
    return { [MAP_TAG]: Array.from(value.entries()) };
  }
  return value;
}

function reviver(_key: string, value: unknown): unknown {
  if (isTaggedMap(value)) {
    return new Map(value[MAP_TAG]);
  }
  return value;
}

export function serialize<T>(client: T): string {
  return JSON.stringify(client, replacer);
}

export function deserialize<T>(cached: string): T {
  return JSON.parse(cached, reviver) as T;
}
