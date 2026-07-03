// Emits the hosted static HTML mirror of the in-app legal screens from the same
// LegalDoc source of truth. Run: npm run legal:html
// Relative imports (no @/ alias) so tsx resolves the module graph directly.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { privacyPolicy } from '../src/content/legal/privacyPolicy';
import { termsOfService } from '../src/content/legal/termsOfService';
import { renderLegalHtml } from '../src/content/legal/renderHtml';

const outDir = join(process.cwd(), 'legal-site');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'privacy.html'), renderLegalHtml(privacyPolicy));
writeFileSync(join(outDir, 'terms.html'), renderLegalHtml(termsOfService));
console.log('Wrote legal-site/privacy.html and legal-site/terms.html');
