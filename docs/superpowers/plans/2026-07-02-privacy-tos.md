# Privacy Policy & Terms of Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship drafted Privacy Policy + Terms of Service as source-controlled typed content, rendered in native in-app screens (reachable from Settings and signup) and emitted as static HTML for hosting.

**Architecture:** A single typed `LegalDoc` source of truth per document (`src/content/legal/`). A themed `LegalDocView` renders it natively; two root routes (`src/app/legal/{privacy,terms}.tsx`) host the screens; Settings + signup link to them. A pure `renderLegalHtml` + a `tsx` build script emit matching static HTML into `legal-site/`, guarded by a parity test so the hosted copy can never silently drift from the in-app copy.

**Tech Stack:** Expo SDK 54 / React Native 0.81 / React 19, expo-router v6 (file routes, typedRoutes), TypeScript, Jest (jest-expo), `tsx` (dev-only script runner).

## Global Constraints

- **Read the versioned Expo docs (https://docs.expo.dev/versions/v56.0.0/) before writing Expo code.** APIs in this band changed (expo-router v6).
- **React Compiler is ON** — do NOT hand-roll `useMemo`/`useCallback`/`React.memo`.
- **typedRoutes is ON** — `tsc --noEmit` will flag the new `/legal/privacy` and `/legal/terms` pathnames (and `router.push` calls to them) until the dev server regenerates `.expo/types/router.d.ts`. Tests mock `expo-router`, so tests are unaffected. This is expected; not a real error.
- **Content modules under `src/content/legal/` MUST use relative imports** (`./types`), never the `@/` alias — the `tsx` hosting script resolves them without Jest's `moduleNameMapper`. Screens and `LegalDocView` may use `@/` freely (they never run under `tsx`).
- **Tests are only collected from `**/__tests__/**/*.test.ts(x)`.** A `*.test.ts` outside an `__tests__/` dir is silently ignored. Mirror the `src/` tree under `src/__tests__/`.
- **Local Jest after running Metro:** `watchman shutdown-server` then `npx jest --watchman=false --runInBand --forceExit`. CI is unaffected. Single file: `npx jest path/to/file.test.tsx`.
- **`tsc` does not run in Jest** — run `npx tsc --noEmit` before claiming done; ignore only the known typedRoutes-staleness lines above and the pre-existing baseline errors.
- **No new native/runtime dependencies.** `tsx` is a dev-only devDependency (esbuild-based, never bundled into the app, never compiled by EAS) — safe.
- **Operator-supplied legal values are searchable placeholders** kept verbatim: `[OPERATOR LEGAL NAME]`, `[GOVERNING LAW JURISDICTION]`. Privacy contact defaults to `privacy@fantasy-gaffer.com`; `lastUpdated` defaults to `'2026-07-02'`.
- **Do not rename the `fpl` scheme or FPL-as-API references.** "FPL" in the legal copy means the public data source; the not-affiliated clause is required.
- **End every commit message with:** `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: Legal content model + Privacy Policy + Terms of Service

**Files:**
- Create: `src/content/legal/types.ts`
- Create: `src/content/legal/privacyPolicy.ts`
- Create: `src/content/legal/termsOfService.ts`
- Create: `src/content/legal/index.ts`
- Test: `src/__tests__/content/legal/content.test.ts`

**Interfaces:**
- Produces: `type Block = { type: 'paragraph'; text: string } | { type: 'bullets'; items: string[] }`; `type Section = { heading: string; blocks: Block[] }`; `type LegalDoc = { title: string; lastUpdated: string; intro?: string; sections: Section[] }`. Exports `privacyPolicy: LegalDoc`, `termsOfService: LegalDoc`. `index.ts` re-exports the types and both docs.

- [ ] **Step 1: Write the failing content-completeness test**

Create `src/__tests__/content/legal/content.test.ts`:

```ts
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
      expect(doc.lastUpdated).toBe('2026-07-02');
      expect(doc.sections.length).toBeGreaterThanOrEqual(6);
      for (const s of doc.sections) {
        expect(s.heading.length).toBeGreaterThan(0);
        expect(s.blocks.length).toBeGreaterThan(0);
      }
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/__tests__/content/legal/content.test.ts --watchman=false --runInBand --forceExit`
Expected: FAIL — `Cannot find module '@/content/legal'`.

- [ ] **Step 3: Create the content model**

Create `src/content/legal/types.ts`:

```ts
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
```

- [ ] **Step 4: Create the Privacy Policy content**

Create `src/content/legal/privacyPolicy.ts`. Placeholders `[OPERATOR LEGAL NAME]` and `[GOVERNING LAW JURISDICTION]` are deliberate — the operator replaces them before publishing.

```ts
import type { LegalDoc } from './types';

export const privacyPolicy: LegalDoc = {
  title: 'Privacy Policy',
  lastUpdated: '2026-07-02',
  intro:
    'This Privacy Policy explains what information Fantasy Gaffer ("the app", "we", "us") collects, how we use it, and the choices you have. Fantasy Gaffer is operated by [OPERATOR LEGAL NAME]. We recommend reviewing this policy together with our Terms of Service.',
  sections: [
    {
      heading: 'Information we collect',
      blocks: [
        {
          type: 'paragraph',
          text: 'We collect only what we need to run the app and improve it:',
        },
        {
          type: 'bullets',
          items: [
            'Account information — your name and email address, provided when you create an account, and the authentication tokens that keep you signed in.',
            'Fantasy Premier League (FPL) data you choose to connect — your FPL entry (team) id, team name, and squad picks, read from the public FPL API to power projections and advice.',
            'Push notification token — only if you enable notifications, so we can deliver deadline and price-change alerts to your device.',
            'Usage analytics — anonymous events about which screens and features you use, to help us understand what to improve.',
            'Crash diagnostics — device model, operating system version, and error reports when the app crashes, so we can fix bugs.',
          ],
        },
      ],
    },
    {
      heading: 'How we use your information',
      blocks: [
        {
          type: 'bullets',
          items: [
            'To provide the app: sign you in, connect your FPL team, and generate projections and advisory decisions.',
            'To send the notifications you have enabled.',
            'To diagnose crashes and improve stability and performance.',
            'To understand aggregate, anonymous usage so we can prioritise features.',
          ],
        },
      ],
    },
    {
      heading: 'Third-party services',
      blocks: [
        {
          type: 'paragraph',
          text: 'We rely on a small number of trusted providers, each processing only the data needed for its role. We never sell your data.',
        },
        {
          type: 'bullets',
          items: [
            'Supabase — authentication and backend database (account and profile data).',
            'PostHog — anonymous product analytics.',
            'Sentry — crash and error reporting.',
            'RevenueCat — subscription management, if and when you purchase a paid plan.',
            'Apple and Google — sign-in providers and app distribution through their stores.',
          ],
        },
      ],
    },
    {
      heading: 'Analytics and your choices',
      blocks: [
        {
          type: 'paragraph',
          text: 'You can turn off analytics at any time in Settings under "Share usage data". Crash reporting is treated as an essential service for app stability and is always on, but it is scrubbed of personal information — we attach only an internal account identifier, never your email or IP address.',
        },
      ],
    },
    {
      heading: 'Data retention and deletion',
      blocks: [
        {
          type: 'paragraph',
          text: 'We keep your account data for as long as your account is active. You can delete your account from within the app (Settings → account deletion). Deletion is subject to a short grace period during which you can restore the account; after that, your profile data is removed. We may retain limited information where required to comply with legal obligations.',
        },
      ],
    },
    {
      heading: 'Your rights',
      blocks: [
        {
          type: 'paragraph',
          text: 'Depending on where you live (including the EU and UK under the GDPR), you have rights over your personal data, including the right to access, correct, export, and delete it, and to object to certain processing. You can exercise these rights by deleting your account in the app or by contacting us at the email below.',
        },
      ],
    },
    {
      heading: 'Security',
      blocks: [
        {
          type: 'paragraph',
          text: 'We use reasonable technical and organisational measures to protect your data, including encrypted connections and access controls. No method of transmission or storage is completely secure, but we work to protect your information.',
        },
      ],
    },
    {
      heading: 'International data transfers',
      blocks: [
        {
          type: 'paragraph',
          text: 'Some of our providers process data on servers located outside your country, including in the United States. Where we transfer data internationally, we take steps to ensure it remains protected.',
        },
      ],
    },
    {
      heading: "Children's privacy",
      blocks: [
        {
          type: 'paragraph',
          text: 'Fantasy Gaffer is not directed to children under 13, and we do not knowingly collect personal information from them. If you believe a child has provided us information, please contact us and we will delete it.',
        },
      ],
    },
    {
      heading: 'Changes to this policy',
      blocks: [
        {
          type: 'paragraph',
          text: 'We may update this policy from time to time. When we do, we will revise the "Last updated" date above and, where appropriate, notify you in the app.',
        },
      ],
    },
    {
      heading: 'Contact us',
      blocks: [
        {
          type: 'paragraph',
          text: 'For any privacy question or request, contact us at privacy@fantasy-gaffer.com.',
        },
      ],
    },
  ],
};
```

- [ ] **Step 5: Create the Terms of Service content**

Create `src/content/legal/termsOfService.ts`:

```ts
import type { LegalDoc } from './types';

export const termsOfService: LegalDoc = {
  title: 'Terms of Service',
  lastUpdated: '2026-07-02',
  intro:
    'These Terms of Service ("Terms") govern your use of the Fantasy Gaffer app, operated by [OPERATOR LEGAL NAME]. By creating an account or using the app, you agree to these Terms. If you do not agree, please do not use the app.',
  sections: [
    {
      heading: 'Eligibility and your account',
      blocks: [
        {
          type: 'bullets',
          items: [
            'You must be at least 13 years old to use Fantasy Gaffer.',
            'You agree to provide accurate information and to keep your account credentials secure.',
            'You are responsible for activity that happens under your account.',
          ],
        },
      ],
    },
    {
      heading: 'Acceptable use',
      blocks: [
        {
          type: 'paragraph',
          text: 'You agree not to misuse the app. In particular, you will not:',
        },
        {
          type: 'bullets',
          items: [
            'Use the app for any unlawful purpose or in violation of these Terms.',
            'Attempt to reverse engineer, decompile, or extract source code from the app.',
            'Scrape or access the service through automated means beyond normal app use.',
            'Interfere with, disrupt, or attempt to gain unauthorised access to the app or its systems.',
            'Infringe the rights of others or upload unlawful content.',
          ],
        },
      ],
    },
    {
      heading: 'The service and FPL data',
      blocks: [
        {
          type: 'paragraph',
          text: 'Fantasy Gaffer surfaces publicly available Fantasy Premier League data alongside our own projections and advisory suggestions (such as captaincy, transfer, and chip advice). These outputs are informational only. We do not guarantee their accuracy or any particular fantasy result, and they are not financial or professional advice. Decisions you make remain your own.',
        },
      ],
    },
    {
      heading: 'Subscriptions and payments',
      blocks: [
        {
          type: 'bullets',
          items: [
            'Some features may require a paid subscription, billed through the Apple App Store or Google Play.',
            'Subscriptions renew automatically unless cancelled before the end of the current period.',
            'You can manage or cancel your subscription in your App Store or Google Play account settings.',
            'Payments and refunds are handled by the app stores and subject to their policies.',
          ],
        },
      ],
    },
    {
      heading: 'Intellectual property',
      blocks: [
        {
          type: 'paragraph',
          text: 'The app, including its design, content, and software, is owned by [OPERATOR LEGAL NAME] and protected by intellectual property laws. We grant you a limited, personal, non-transferable licence to use the app in accordance with these Terms.',
        },
      ],
    },
    {
      heading: 'Disclaimers',
      blocks: [
        {
          type: 'paragraph',
          text: 'The app is provided "as is" and "as available", without warranties of any kind, whether express or implied, including fitness for a particular purpose and non-infringement. We do not warrant that the app will be uninterrupted, error-free, or that projections will be accurate.',
        },
      ],
    },
    {
      heading: 'Limitation of liability',
      blocks: [
        {
          type: 'paragraph',
          text: 'To the maximum extent permitted by law, [OPERATOR LEGAL NAME] will not be liable for any indirect, incidental, special, or consequential damages, or for any loss arising from your use of, or inability to use, the app.',
        },
      ],
    },
    {
      heading: 'Not affiliated with the Premier League or FPL',
      blocks: [
        {
          type: 'paragraph',
          text: 'Fantasy Gaffer is an independent app. It is not affiliated with, endorsed by, sponsored by, or associated with the Premier League, the official Fantasy Premier League, or any of their affiliates. "FPL" refers to the publicly available Fantasy Premier League data source. All related trademarks belong to their respective owners.',
        },
      ],
    },
    {
      heading: 'Termination',
      blocks: [
        {
          type: 'paragraph',
          text: 'We may suspend or terminate your access if you breach these Terms. You may stop using the app at any time and delete your account from within the app.',
        },
      ],
    },
    {
      heading: 'Governing law',
      blocks: [
        {
          type: 'paragraph',
          text: 'These Terms are governed by the laws of [GOVERNING LAW JURISDICTION], without regard to its conflict-of-laws rules.',
        },
      ],
    },
    {
      heading: 'Changes to these Terms',
      blocks: [
        {
          type: 'paragraph',
          text: 'We may update these Terms from time to time. When we do, we will revise the "Last updated" date above. Your continued use of the app after changes take effect means you accept the updated Terms.',
        },
      ],
    },
    {
      heading: 'Contact',
      blocks: [
        {
          type: 'paragraph',
          text: 'Questions about these Terms? Contact us at privacy@fantasy-gaffer.com.',
        },
      ],
    },
  ],
};
```

- [ ] **Step 6: Create the barrel export**

Create `src/content/legal/index.ts`:

```ts
export type { Block, Section, LegalDoc } from './types';
export { privacyPolicy } from './privacyPolicy';
export { termsOfService } from './termsOfService';
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx jest src/__tests__/content/legal/content.test.ts --watchman=false --runInBand --forceExit`
Expected: PASS (all structural + topic assertions green).

- [ ] **Step 8: Commit**

```bash
git add src/content/legal src/__tests__/content/legal/content.test.ts
git commit -m "feat(legal): typed Privacy Policy + ToS content

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: LegalDocView renderer

**Files:**
- Create: `src/components/legal/LegalDocView.tsx`
- Test: `src/__tests__/components/legal/legalDocView.test.tsx`

**Interfaces:**
- Consumes: `LegalDoc` from `@/content/legal`; `ApexTokens` from `@/constants/apexTokens`.
- Produces: `export function LegalDocView({ doc, tk }: { doc: LegalDoc; tk: ApexTokens }): JSX.Element` — a `ScrollView` rendering `lastUpdated`, optional `intro`, and each section's heading + blocks. Does NOT render `doc.title` (the screen header carries it).

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/components/legal/legalDocView.test.tsx`:

```tsx
import React from 'react';
import { render } from '@testing-library/react-native';
import { LegalDocView } from '@/components/legal/LegalDocView';
import { apexTokens } from '@/constants/apexTokens';
import type { LegalDoc } from '@/content/legal';

const tk = apexTokens(true, 'classic');

const fixture: LegalDoc = {
  title: 'Test Doc',
  lastUpdated: '2026-07-02',
  intro: 'Intro line here.',
  sections: [
    {
      heading: 'First Section',
      blocks: [
        { type: 'paragraph', text: 'A paragraph of text.' },
        { type: 'bullets', items: ['Bullet one', 'Bullet two'] },
      ],
    },
  ],
};

describe('LegalDocView', () => {
  it('renders lastUpdated, intro, heading, paragraph and bullets', () => {
    const { getByText } = render(<LegalDocView doc={fixture} tk={tk} />);
    expect(getByText(/Last updated 2026-07-02/)).toBeTruthy();
    expect(getByText('Intro line here.')).toBeTruthy();
    expect(getByText('First Section')).toBeTruthy();
    expect(getByText('A paragraph of text.')).toBeTruthy();
    expect(getByText('Bullet one')).toBeTruthy();
    expect(getByText('Bullet two')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/__tests__/components/legal/legalDocView.test.tsx --watchman=false --runInBand --forceExit`
Expected: FAIL — `Cannot find module '@/components/legal/LegalDocView'`.

- [ ] **Step 3: Implement LegalDocView**

Create `src/components/legal/LegalDocView.tsx`:

```tsx
import React from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { ApexTokens } from '@/constants/apexTokens';
import type { LegalDoc } from '@/content/legal';

export function LegalDocView({ doc, tk }: { doc: LegalDoc; tk: ApexTokens }) {
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.updated, { color: tk.faint }]}>
        Last updated {doc.lastUpdated}
      </Text>

      {doc.intro ? (
        <Text style={[styles.paragraph, { color: tk.variant }]}>{doc.intro}</Text>
      ) : null}

      {doc.sections.map((section, si) => (
        <View key={si} style={styles.section}>
          <Text style={[styles.heading, { color: tk.text }]}>{section.heading}</Text>
          {section.blocks.map((block, bi) =>
            block.type === 'paragraph' ? (
              <Text key={bi} style={[styles.paragraph, { color: tk.variant }]}>
                {block.text}
              </Text>
            ) : (
              <View key={bi} style={styles.bullets}>
                {block.items.map((item, ii) => (
                  <View key={ii} style={styles.bulletRow}>
                    <Text style={[styles.bulletDot, { color: tk.faint }]}>•</Text>
                    <Text style={[styles.bulletText, { color: tk.variant }]}>{item}</Text>
                  </View>
                ))}
              </View>
            ),
          )}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 22, paddingTop: 16, paddingBottom: 40 },
  updated: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 12.5,
    marginBottom: 14,
  },
  section: { marginBottom: 20 },
  heading: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 16,
    marginBottom: 8,
  },
  paragraph: {
    fontFamily: 'Archivo_400Regular',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 8,
  },
  bullets: { marginTop: 2 },
  bulletRow: { flexDirection: 'row', marginBottom: 6 },
  bulletDot: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 14,
    lineHeight: 21,
    width: 16,
  },
  bulletText: {
    flex: 1,
    fontFamily: 'Archivo_400Regular',
    fontSize: 14,
    lineHeight: 21,
  },
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/__tests__/components/legal/legalDocView.test.tsx --watchman=false --runInBand --forceExit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/legal/LegalDocView.tsx src/__tests__/components/legal/legalDocView.test.tsx
git commit -m "feat(legal): themed LegalDocView renderer

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Legal screens (routes)

**Files:**
- Create: `src/app/legal/privacy.tsx`
- Create: `src/app/legal/terms.tsx`
- Test: `src/__tests__/app/legal/legalScreens.test.tsx`

**Interfaces:**
- Consumes: `LegalDocView` (Task 2); `privacyPolicy`/`termsOfService` (Task 1); `ScreenHeader` from `@/components/ui/ScreenHeader`; `getTheme`/`apexTokens`; `useThemeStore`; `useRouter`.
- Produces: default-export screen components at routes `/legal/privacy` and `/legal/terms`.

The root `<Stack screenOptions={{ headerShown: false }} />` (`src/app/_layout.tsx`) auto-registers any route file under `src/app/`, so no folder `_layout.tsx` is needed — the screens supply their own `ScreenHeader`.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/app/legal/legalScreens.test.tsx`:

```tsx
import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('@/store/themeStore', () => ({
  __esModule: true,
  useThemeStore: () => ({ paletteKey: 'classic', dark: true, setPaletteKey: jest.fn() }),
}));

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => ({ back: mockBack }),
}));

import PrivacyScreen from '@/app/legal/privacy';
import TermsScreen from '@/app/legal/terms';

describe('legal screens', () => {
  it('privacy screen renders its header title and content', () => {
    const { getAllByText } = render(<PrivacyScreen />);
    expect(getAllByText('Privacy Policy').length).toBeGreaterThan(0);
  });

  it('terms screen renders its header title and content', () => {
    const { getAllByText } = render(<TermsScreen />);
    expect(getAllByText('Terms of Service').length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/__tests__/app/legal/legalScreens.test.tsx --watchman=false --runInBand --forceExit`
Expected: FAIL — `Cannot find module '@/app/legal/privacy'`.

- [ ] **Step 3: Implement the privacy screen**

Create `src/app/legal/privacy.tsx`:

```tsx
import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useThemeStore } from '@/store/themeStore';
import { getTheme } from '@/constants/theme';
import { apexTokens } from '@/constants/apexTokens';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { LegalDocView } from '@/components/legal/LegalDocView';
import { privacyPolicy } from '@/content/legal';

export default function PrivacyScreen() {
  const router = useRouter();
  const { paletteKey, dark } = useThemeStore();
  const t = getTheme(paletteKey, dark);
  const tk = apexTokens(dark, paletteKey);

  return (
    <View style={{ flex: 1, backgroundColor: tk.bg }}>
      <ScreenHeader
        title={privacyPolicy.title}
        onBack={() => router.back()}
        gradFrom={t.primary}
        gradTo={dark ? '#0C1018' : '#5B0F63'}
      />
      <LegalDocView doc={privacyPolicy} tk={tk} />
    </View>
  );
}
```

- [ ] **Step 4: Implement the terms screen**

Create `src/app/legal/terms.tsx`:

```tsx
import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useThemeStore } from '@/store/themeStore';
import { getTheme } from '@/constants/theme';
import { apexTokens } from '@/constants/apexTokens';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { LegalDocView } from '@/components/legal/LegalDocView';
import { termsOfService } from '@/content/legal';

export default function TermsScreen() {
  const router = useRouter();
  const { paletteKey, dark } = useThemeStore();
  const t = getTheme(paletteKey, dark);
  const tk = apexTokens(dark, paletteKey);

  return (
    <View style={{ flex: 1, backgroundColor: tk.bg }}>
      <ScreenHeader
        title={termsOfService.title}
        onBack={() => router.back()}
        gradFrom={t.primary}
        gradTo={dark ? '#0C1018' : '#5B0F63'}
      />
      <LegalDocView doc={termsOfService} tk={tk} />
    </View>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx jest src/__tests__/app/legal/legalScreens.test.tsx --watchman=false --runInBand --forceExit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/legal src/__tests__/app/legal/legalScreens.test.tsx
git commit -m "feat(legal): in-app privacy + terms screens

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Wire Settings, signup, links, and config

**Files:**
- Modify: `src/constants/links.ts`
- Modify: `app.config.ts:69-76` (the `extra` object)
- Modify: `src/lib/external.ts` (remove unused `openTerms`)
- Modify: `src/app/(home)/settings.tsx` (Terms row → in-app nav; add Privacy row)
- Modify: `src/app/(onboarding)/signup.tsx` (disclosure line)
- Test: `src/__tests__/settingsScreen.test.tsx` (update), `src/__tests__/signupScreen.test.tsx` (update)

**Interfaces:**
- Consumes: routes `/legal/privacy`, `/legal/terms` (Task 3).
- Produces: `PRIVACY_URL` in `links.ts`; `extra.privacyPolicyUrl` / `extra.termsUrl` in config.

- [ ] **Step 1: Update the links constants**

Replace the body of `src/constants/links.ts` with:

```ts
// src/constants/links.ts
//
// External destinations. The legal URLs are the hosted mirrors of the in-app
// legal screens (src/app/legal/*); they are consumed by store-listing config
// (app.config.ts extra) and are what the store submission (#45) points at.
// In-app, Settings and signup navigate to the native screens, not these URLs.

export const APP_STORE_URL = 'https://fantasy-gaffer.com';
export const TERMS_URL = 'https://fantasy-gaffer.com/terms';
export const PRIVACY_URL = 'https://fantasy-gaffer.com/privacy';
export const FEEDBACK_EMAIL = 'feedback@fantasy-gaffer.com';
```

- [ ] **Step 2: Add the URLs to app config `extra`**

In `app.config.ts`, import the constants at the top of the file (after the existing import line `import type { ExpoConfig } from 'expo/config';`):

```ts
import { PRIVACY_URL, TERMS_URL } from './src/constants/links';
```

Then add two keys to the `extra` object (currently `app.config.ts:69-76`), after `sentryDsn`:

```ts
  extra: {
    eas: { projectId: 'c0fe66cb-f0e7-4f6a-a0fb-2c927022a5af' },
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    posthogKey: process.env.EXPO_PUBLIC_POSTHOG_KEY,
    posthogHost: process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
    sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
    privacyPolicyUrl: PRIVACY_URL,
    termsUrl: TERMS_URL,
  },
```

Note: `src/constants/links.ts` has no runtime imports, so importing it into `app.config.ts` is safe (no Expo/RN runtime pulled into config evaluation). Verify the import path resolves relative to the repo root (`./src/constants/links`).

- [ ] **Step 3: Remove the now-unused `openTerms` from external.ts**

`openTerms` is only referenced by Settings (being re-pointed to in-app nav) and its test (updated below). Remove it and its now-unused imports. Edit `src/lib/external.ts`:
- Delete the `import * as WebBrowser from 'expo-web-browser';` line.
- Change the links import from `import { APP_STORE_URL, TERMS_URL, FEEDBACK_EMAIL } from '@/constants/links';` to `import { APP_STORE_URL, FEEDBACK_EMAIL } from '@/constants/links';`.
- Delete the entire `openTerms` function.

(`shareApp` and `sendFeedback` are untouched. The `expo-web-browser` config plugin stays in `app.config.ts`.)

- [ ] **Step 4: Update the Settings screen — Terms row + new Privacy row**

In `src/app/(home)/settings.tsx`:

Remove `openTerms` from the external import (line 19). Change:
```ts
import { shareApp, sendFeedback, openTerms } from '@/lib/external';
```
to:
```ts
import { shareApp, sendFeedback } from '@/lib/external';
```

In the "More" `SectionCard`, replace the single Terms `SettingsRow` (currently `settings.tsx:76-85`) with a Privacy Policy row followed by a Terms row, both navigating in-app:

```tsx
          <SettingsRow
            icon={<PrivacyIcon color={tk.faint} />}
            label="Privacy Policy"
            onPress={() => router.push('/legal/privacy')}
            tk={tk}
            showDivider
          />
          <SettingsRow
            icon={<TermsIcon color={tk.faint} />}
            label="Terms of Service"
            onPress={() => router.push('/legal/terms')}
            tk={tk}
            showDivider
          />
```

Add a `PrivacyIcon` component next to the existing `TermsIcon` (near `settings.tsx:205`):

```tsx
function PrivacyIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
```

(The `useRouter()` hook is already in scope as `router` at `settings.tsx:23`.)

- [ ] **Step 5: Add the signup disclosure line**

In `src/app/(onboarding)/signup.tsx`, add a disclosure block between the `PillBtn` (ends line 207) and the `footerWrap` `View` (line 209). `router` is already imported at line 11.

```tsx
        <Text style={[styles.legalHint, { color: t.textMuted }]}>
          By creating an account, you agree to our{' '}
          <Text
            style={[styles.legalLink, { color: t.accent }]}
            onPress={() => router.push('/legal/terms')}
          >
            Terms of Service
          </Text>{' '}
          and{' '}
          <Text
            style={[styles.legalLink, { color: t.accent }]}
            onPress={() => router.push('/legal/privacy')}
          >
            Privacy Policy
          </Text>
          .
        </Text>
```

Add these two style entries to the `StyleSheet.create({...})` at the bottom of the file (e.g. after `submitBtn`):

```ts
  legalHint: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 12.5,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 16,
  },
  legalLink: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 12.5,
  },
```

- [ ] **Step 6: Update the Settings test**

In `src/__tests__/settingsScreen.test.tsx`:

Change the `@/lib/external` mock (lines 42-47) to drop `openTerms`:
```ts
jest.mock('@/lib/external', () => ({
  __esModule: true,
  shareApp: jest.fn().mockResolvedValue(undefined),
  sendFeedback: jest.fn().mockResolvedValue({ ok: true }),
}));
```

Change the `expo-router` mock (lines 58-61) to capture `push`:
```ts
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => ({ back: jest.fn(), push: (p: string) => mockPush(p) }),
}));
```

Update the import line (line 64) to drop `openTerms`:
```ts
import { shareApp, sendFeedback } from '@/lib/external';
```

In the "More actions" `beforeEach` (lines 102-107), remove the `(openTerms as jest.Mock).mockClear();` line and add `mockPush.mockClear();`.

Replace the `openTerms` test (lines 121-125) with two navigation tests:
```ts
  it('navigates to the in-app Terms screen when the Terms row is pressed', () => {
    const { getByText } = render(<Settings />);
    fireEvent.press(getByText('Terms of Service'));
    expect(mockPush).toHaveBeenCalledWith('/legal/terms');
  });

  it('navigates to the in-app Privacy screen when the Privacy row is pressed', () => {
    const { getByText } = render(<Settings />);
    fireEvent.press(getByText('Privacy Policy'));
    expect(mockPush).toHaveBeenCalledWith('/legal/privacy');
  });
```

- [ ] **Step 7: Update the signup test**

In `src/__tests__/signupScreen.test.tsx`:

Add a `mockPush` alongside the existing mocks (near line 6):
```ts
const mockPush = jest.fn();
```

Extend the `expo-router` mock (lines 13-19) with `push`:
```ts
jest.mock('expo-router', () => ({
  __esModule: true,
  router: {
    replace: (p: string) => mockReplace(p),
    back: () => mockBack(),
    push: (p: string) => mockPush(p),
  },
}));
```

Add `mockPush.mockReset();` to the `beforeEach` (near line 32). Then add a test:
```ts
  it('navigates to legal screens from the disclosure links', () => {
    const { getByText } = render(<SignUp />);
    fireEvent.press(getByText('Terms of Service'));
    expect(mockPush).toHaveBeenCalledWith('/legal/terms');
    fireEvent.press(getByText('Privacy Policy'));
    expect(mockPush).toHaveBeenCalledWith('/legal/privacy');
  });
```

- [ ] **Step 8: Run the updated tests**

Run: `npx jest src/__tests__/settingsScreen.test.tsx src/__tests__/signupScreen.test.tsx --watchman=false --runInBand --forceExit`
Expected: PASS (all settings + signup tests, including the new navigation tests).

- [ ] **Step 9: Commit**

```bash
git add src/constants/links.ts app.config.ts src/lib/external.ts src/app/\(home\)/settings.tsx src/app/\(onboarding\)/signup.tsx src/__tests__/settingsScreen.test.tsx src/__tests__/signupScreen.test.tsx
git commit -m "feat(legal): link Settings + signup to in-app legal screens

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: HTML emission + drift-guard

**Files:**
- Create: `src/content/legal/renderHtml.ts`
- Create: `scripts/build-legal-html.ts`
- Create: `legal-site/privacy.html` (generated)
- Create: `legal-site/terms.html` (generated)
- Modify: `package.json` (add `tsx` devDependency + `legal:html` script)
- Test: `src/__tests__/content/legal/htmlParity.test.ts`

**Interfaces:**
- Consumes: `LegalDoc`/`Block` from `./types`; `privacyPolicy`/`termsOfService` (Task 1).
- Produces: `export function renderLegalHtml(doc: LegalDoc): string` — deterministic, HTML-escaped, self-contained HTML document (no trailing newline).

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/content/legal/htmlParity.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/__tests__/content/legal/htmlParity.test.ts --watchman=false --runInBand --forceExit`
Expected: FAIL — `Cannot find module '@/content/legal/renderHtml'`.

- [ ] **Step 3: Implement renderLegalHtml**

Create `src/content/legal/renderHtml.ts` (relative imports only):

```ts
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
```

- [ ] **Step 4: Add the build script**

Create `scripts/build-legal-html.ts`:

```ts
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
```

- [ ] **Step 5: Add `tsx` and the npm script**

Run: `npm install --save-dev tsx`

Then add the script to `package.json`'s `scripts` block (after `"test": "jest"`):

```json
    "test": "jest",
    "legal:html": "tsx scripts/build-legal-html.ts"
```

- [ ] **Step 6: Generate the HTML**

Run: `npm run legal:html`
Expected output: `Wrote legal-site/privacy.html and legal-site/terms.html`, creating `legal-site/privacy.html` and `legal-site/terms.html`.

Confirm they are not git-ignored: `git status --short legal-site/` should list both files as untracked (to be added).

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx jest src/__tests__/content/legal/htmlParity.test.ts --watchman=false --runInBand --forceExit`
Expected: PASS — the `renderLegalHtml` unit assertions and both parity checks (committed HTML `===` freshly rendered).

- [ ] **Step 8: Commit**

```bash
git add src/content/legal/renderHtml.ts scripts/build-legal-html.ts legal-site/privacy.html legal-site/terms.html package.json package-lock.json src/__tests__/content/legal/htmlParity.test.ts
git commit -m "feat(legal): static HTML emitter + drift-guard for hosted pages

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Full-suite + type-check verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `watchman shutdown-server; npx jest --watchman=false --runInBand --forceExit`
Expected: All suites pass, including the new `content`, `legalDocView`, `legalScreens`, `htmlParity` suites and the updated `settingsScreen` / `signupScreen` suites.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No NEW errors beyond (a) the known pre-existing baseline errors and (b) typedRoutes-staleness on `/legal/privacy` and `/legal/terms` (these resolve once the dev server regenerates `.expo/types/router.d.ts`; tests are unaffected). If any OTHER error references the new files, fix it.

- [ ] **Step 3: Lint the changed files (optional but recommended)**

Run: `npm run lint`
Note: `expo lint` may generate an untracked `eslint.config.js` — do NOT commit it. Fix any lint errors in the new/changed files.

- [ ] **Step 4: No commit** (verification only). If Steps 1-3 surfaced fixes, they were committed against the task that owns the file.

---

## Notes for the operator (post-implementation, not code)

Before store submission (#45), replace the placeholder tokens in `src/content/legal/privacyPolicy.ts` and `termsOfService.ts`, then re-run `npm run legal:html`:
- `[OPERATOR LEGAL NAME]` — the legal entity operating the app.
- `[GOVERNING LAW JURISDICTION]` — e.g. "England and Wales".
- Confirm `privacy@fantasy-gaffer.com` routes, or swap it for `admin@fantasy-gaffer.com`.
- Deploy `legal-site/` to static hosting (Cloudflare Pages / Vercel / GitHub Pages) so `https://fantasy-gaffer.com/privacy` and `/terms` resolve, then enter the privacy URL into App Store Connect + Play Console (#45).
