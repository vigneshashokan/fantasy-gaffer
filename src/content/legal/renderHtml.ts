import type { LegalDoc, Block } from './types';

// Escape the five HTML-significant characters so legal prose can never break
// the generated markup. Order matters: ampersand first.
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderBlock(block: Block): string {
  if (block.type === 'paragraph') return `      <p>${esc(block.text)}</p>`;
  const items = block.items.map((i) => `        <li>${esc(i)}</li>`).join('\n');
  return `      <ul>\n${items}\n      </ul>`;
}

// Deterministic, self-contained HTML. No trailing newline — the parity test and
// the build script compare/emit this exact string.
export function renderLegalHtml(doc: LegalDoc): string {
  const title = esc(doc.title);
  const sections = doc.sections
    .map((s) => {
      const blocks = s.blocks.map(renderBlock).join('\n');
      return `    <section>\n      <h2>${esc(s.heading)}</h2>\n${blocks}\n    </section>`;
    })
    .join('\n');
  const intro = doc.intro ? `    <p class="intro">${esc(doc.intro)}</p>\n` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color: #1a2236; max-width: 720px; margin: 0 auto; padding: 40px 20px; line-height: 1.6; }
  h1 { font-size: 28px; margin-bottom: 4px; }
  h2 { font-size: 18px; margin-top: 32px; }
  .updated { color: #8b8694; font-size: 14px; margin-top: 0; }
  .intro { margin-top: 20px; }
  ul { padding-left: 20px; }
  li { margin-bottom: 6px; }
</style>
</head>
<body>
  <main>
    <h1>${title}</h1>
    <p class="updated">Last updated ${esc(doc.lastUpdated)}</p>
${intro}${sections}
  </main>
</body>
</html>`;
}
