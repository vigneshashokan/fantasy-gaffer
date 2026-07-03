import { serialize, deserialize } from '@/lib/query/mapCodec';

describe('query cache Map codec', () => {
  it('documents the bug it fixes: plain JSON drops Map contents', () => {
    // JSON.stringify(new Map(...)) === '{}', which is why a persisted Map-valued
    // query (useProjections/useLive) rehydrates as a bare object and crashes
    // consumers that call .get().
    expect(JSON.stringify(new Map([['a', 1]]))).toBe('{}');
  });

  it('round-trips a string-keyed Map, preserving Map-ness and values', () => {
    const input = { data: new Map([['a', { p50: 1 }], ['b', { p50: 2 }]]) };
    const out = deserialize<{ data: Map<string, { p50: number }> }>(serialize(input));
    expect(out.data).toBeInstanceOf(Map);
    expect(out.data.get('a')).toEqual({ p50: 1 });
    expect(out.data.get('b')).toEqual({ p50: 2 });
  });

  it('round-trips a number-keyed Map (e.g. useLive Map<number,…>)', () => {
    const input = { live: new Map<number, number>([[1, 10], [2, 20]]) };
    const out = deserialize<{ live: Map<number, number> }>(serialize(input));
    expect(out.live).toBeInstanceOf(Map);
    expect(out.live.get(1)).toBe(10);
    expect(out.live.get(2)).toBe(20);
  });

  it('round-trips nested Maps inside a dehydrated-cache-shaped object', () => {
    const client = {
      clientState: { queries: [{ state: { data: new Map([['x', 1]]) } }] },
    };
    const out = deserialize<typeof client>(serialize(client));
    const restored = out.clientState.queries[0].state.data;
    expect(restored).toBeInstanceOf(Map);
    expect(restored.get('x')).toBe(1);
  });

  it('round-trips an empty Map to an empty Map (not {})', () => {
    const out = deserialize<{ m: Map<string, number> }>(serialize({ m: new Map() }));
    expect(out.m).toBeInstanceOf(Map);
    expect(out.m.size).toBe(0);
  });

  it('leaves plain objects and arrays unchanged', () => {
    const input = { a: 1, b: [1, 2, 3], c: { d: 'e' }, n: null };
    expect(deserialize(serialize(input))).toEqual(input);
  });
});
