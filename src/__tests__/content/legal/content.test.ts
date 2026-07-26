import { privacyPolicy, termsOfService, type LegalDoc } from '@/content/legal';

// Flatten a doc to one lowercase string for topic-coverage assertions.
function flatten(doc: LegalDoc): string {
  const parts: string[] = [doc.title, doc.intro ?? ''];
  for (const s of doc.sections) {
    parts.push(s.heading);
    for (const b of s.blocks) {
      if (b.type === 'paragraph') parts.push(b.text);
      else parts.push(...b.items);
    }
  }
  return parts.join('\n').toLowerCase();
}

describe('legal content — structural invariants', () => {
  for (const [name, doc] of [
    ['privacyPolicy', privacyPolicy],
    ['termsOfService', termsOfService],
  ] as const) {
    it(`${name} has a title, lastUpdated and at least 6 sections`, () => {
      expect(doc.title.length).toBeGreaterThan(0);
      // Shape, not a pinned literal: the date is meant to change whenever the
      // copy does, so asserting a specific one just breaks on every edit.
      expect(doc.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(doc.sections.length).toBeGreaterThanOrEqual(6);
      for (const s of doc.sections) {
        expect(s.heading.length).toBeGreaterThan(0);
        expect(s.blocks.length).toBeGreaterThan(0);
      }
    });

    // [OPERATOR LEGAL NAME] reached the live hosted policy, because nothing
    // failed when it was left unfilled. These docs face App Review.
    it(`${name} has no unfilled [PLACEHOLDER] tokens`, () => {
      expect(flatten(doc)).not.toMatch(/\[[a-z][a-z ]+\]/);
    });
  }
});

describe('privacy policy — required topics (issue #46)', () => {
  const text = flatten(privacyPolicy);
  it.each([
    'collect',
    'supabase',
    'posthog',
    'sentry',
    'revenuecat',
    'third part',
    'delet',
    'your rights',
    'children',
    'privacy@fantasy-gaffer.com',
  ])('covers %s', (kw) => {
    expect(text).toContain(kw);
  });
});

describe('terms of service — required topics (issue #46)', () => {
  const text = flatten(termsOfService);
  it.each([
    'acceptable use',
    'subscription',
    'cancel',
    'liability',
    'governing law',
    'not affiliated',
    'premier league',
    'as is',
  ])('covers %s', (kw) => {
    expect(text).toContain(kw);
  });
});
