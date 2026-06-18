import { assertAlmostEquals, assertEquals } from '@std/assert';
import { FEATURE_COLUMNS } from '../feature-spec.ts';
import { buildFeatureRow, type ClubStrength, type HistoryRow } from '../lib/features.ts';
import { artifact, predict } from '../lib/scorer.ts';
import fixture from '../artifacts/parity-fixture.json' with { type: 'json' };

Deno.test('artifact loaded with all positions and the v1 contract', () => {
  assertEquals(artifact.model_version, 'v1.0.0');
  assertEquals(artifact.feature_columns, FEATURE_COLUMNS);
});

Deno.test('golden-fixture parity: Deno features + scoring match Python to 1e-6', () => {
  for (const c of fixture.cases) {
    const prior = c.prior_rows as unknown as HistoryRow[];
    const strengths: Record<number, ClubStrength> = {};
    for (const [k, v] of Object.entries(c.club_strengths)) {
      strengths[Number(k)] = v as ClubStrength;
    }
    const feat = buildFeatureRow(prior, c.target, strengths);
    for (const col of FEATURE_COLUMNS) {
      assertAlmostEquals(feat[col], (c.expected_features as Record<string, number>)[col], 1e-6,
        `feature ${col} for ${c.position}`);
    }
    assertAlmostEquals(predict(artifact, feat, c.position, 0.25), c.expected.p25, 1e-6);
    assertAlmostEquals(predict(artifact, feat, c.position, 0.5), c.expected.p50, 1e-6);
    assertAlmostEquals(predict(artifact, feat, c.position, 0.75), c.expected.p75, 1e-6);
  }
});
