// Maps FPL player availability into a banner state, or null when the
// player is fully fit. status: 'a' available · 'd' doubt · 'i' injured ·
// 's' suspended · 'u' unavailable · 'n' not in squad. chanceNext is
// 0..100 or null (null = no concern flagged).
// Severity mapping: 'i','s','u','n' → 'out'; 'd' (or 'a' with chance < 100) → 'doubt'.

export type AvailabilitySeverity = 'out' | 'doubt';

export interface AvailabilityState {
  severity: AvailabilitySeverity;
}

export function availabilityState(
  status: string,
  chanceNext: number | null,
): AvailabilityState | null {
  const flaggedByStatus = status !== 'a';
  const flaggedByChance = chanceNext != null && chanceNext < 100;
  if (!flaggedByStatus && !flaggedByChance) return null;
  const out = status === 'i' || status === 's' || status === 'u' || status === 'n';
  return { severity: out ? 'out' : 'doubt' };
}
