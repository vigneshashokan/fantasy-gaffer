import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderLegalHtml } from '@/content/legal/renderHtml';
import { privacyPolicy, termsOfService, type LegalDoc } from '@/content/legal';

describe('renderLegalHtml', () => {
  const doc: LegalDoc = {
    title: 'Esc & Test <x>',
    lastUpdated: '2026-07-02',
    intro: 'Intro & stuff',
    sections: [
      {
        heading: 'H <one>',
        blocks: [
          { type: 'paragraph', text: 'Para & "quote"' },
          { type: 'bullets', items: ['Item <1>', 'Item & 2'] },
        ],
      },
    ],
  };

  it('escapes special characters in text', () => {
    const html = renderLegalHtml(doc);
    expect(html).toContain('<title>Esc &amp; Test &lt;x&gt;</title>');
    expect(html).toContain('<h1>Esc &amp; Test &lt;x&gt;</h1>');
    expect(html).toContain('Para &amp; &quot;quote&quot;');
    expect(html).toContain('<li>Item &lt;1&gt;</li>');
    expect(html).toContain('<li>Item &amp; 2</li>');
    // Raw unescaped markup from content must not leak through.
    expect(html).not.toContain('<x>');
  });

  it('renders structural elements', () => {
    const html = renderLegalHtml(doc);
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('Last updated 2026-07-02');
    expect(html).toContain('<h2>H &lt;one&gt;</h2>');
  });
});

describe('hosted HTML parity (drift-guard)', () => {
  it.each([
    ['privacy.html', privacyPolicy],
    ['terms.html', termsOfService],
  ] as const)('legal-site/%s matches renderLegalHtml output', (file, doc) => {
    const committed = readFileSync(join(process.cwd(), 'legal-site', file), 'utf8');
    expect(committed).toBe(renderLegalHtml(doc));
    // If this fails, regenerate with: npm run legal:html
  });
});
