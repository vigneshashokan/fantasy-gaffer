import artifactJson from '../artifacts/xpts-v1.json' with { type: 'json' };

export interface Artifact {
  model_version: string;
  feature_columns: string[];
  coefficients: Record<string, Record<string, Record<string, number>>>;
}

export const artifact: Artifact = artifactJson as unknown as Artifact;

const QKEY: Record<number, string> = { 0.25: '0.25', 0.5: '0.5', 0.75: '0.75' };

export function qkey(q: number): string {
  return QKEY[q] ?? String(q);
}

export function predict(
  art: Artifact,
  featureRow: Record<string, number>,
  position: string,
  quantile: number,
): number {
  const coefs = art.coefficients[position];
  if (!coefs) return 0;
  const entry = coefs[qkey(quantile)];
  let total = entry.const;
  for (const c of art.feature_columns) total += entry[c] * Number(featureRow[c]);
  return total;
}
