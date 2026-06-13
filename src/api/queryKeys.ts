// src/api/queryKeys.ts
//
// Single source of truth for TanStack Query cache keys. Use these everywhere
// — never hand-roll a key array — so invalidation has one place to look.

export const queryKeys = {
  clubs:          ['clubs'] as const,
  players:        ['players'] as const,
  bootstrap:      ['bootstrap'] as const,
  eventLive:      (gw: number) => ['eventLive', gw] as const,
  fixtures:       (gw: number) => ['fixtures', gw] as const,
  profile:        (userId: string) => ['profile', userId] as const,
  manager:        (teamId: number) => ['manager', teamId] as const,
  managerHistory: (teamId: number) => ['managerHistory', teamId] as const,
  squad:          (teamId: number, gw: number) => ['squad', teamId, gw] as const,
};
