// Typed legal-document model — the single source of truth rendered both in-app
// (LegalDocView) and as static HTML (renderLegalHtml). Keep imports relative:
// this module graph is also loaded by the tsx hosting script, which does not
// resolve the @/ alias.

export type Block =
  | { type: 'paragraph'; text: string }
  | { type: 'bullets'; items: string[] };

export type Section = { heading: string; blocks: Block[] };

export type LegalDoc = {
  title: string;
  lastUpdated: string; // ISO date, e.g. '2026-07-02'
  intro?: string;
  sections: Section[];
};
