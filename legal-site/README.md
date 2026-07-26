# legal-site

Generated static mirror of the in-app legal screens (`src/app/legal/*`).

- **Source of truth:** `src/content/legal/{privacyPolicy,termsOfService}.ts`
- **Regenerate:** `npm run legal:html` (after ANY content edit — a parity test in
  `src/__tests__/content/legal/htmlParity.test.ts` fails if the committed HTML drifts)
- **Published by:** [`vigneshashokan/fantasy-gaffer-site`](https://github.com/vigneshashokan/fantasy-gaffer-site),
  which pulls these files from `main` at build time and serves them at
  `https://fantasy-gaffer.com/{privacy,terms}`.

Don't edit the `.html` files directly, and don't add a Pages workflow here — the
site repo owns deployment.
