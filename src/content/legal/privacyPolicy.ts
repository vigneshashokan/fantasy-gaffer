import type { LegalDoc } from './types';

export const privacyPolicy: LegalDoc = {
  title: 'Privacy Policy',
  lastUpdated: '2026-07-26',
  intro:
    'This Privacy Policy explains what information Fantasy Gaffer ("the app", "we", "us") collects, how we use it, and the choices you have. Fantasy Gaffer is operated by Vignesh Ashokan. We recommend reviewing this policy together with our Terms of Service.',
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
      heading: 'Legal bases for processing',
      blocks: [
        {
          type: 'paragraph',
          text: 'If you are in the European Economic Area or the United Kingdom, we process your personal data on the following legal bases under the GDPR:',
        },
        {
          type: 'bullets',
          items: [
            'Performance of a contract — creating and securing your account, connecting your Fantasy Premier League team, and generating the projections and advice the app exists to provide. Without this information we cannot deliver the service.',
            'Legitimate interests — diagnosing crashes, maintaining security and stability, and understanding aggregate product usage so we can decide what to improve. We weigh these interests against your rights, keep the data to a minimum, and you can switch off usage analytics at any time in Settings.',
            'Consent — sending push notifications, which happens only after you grant permission on your device. You can withdraw it at any time in your device settings.',
            'Legal obligation — retaining limited records where the law requires us to.',
          ],
        },
      ],
    },
    {
      heading: 'Third-party services',
      blocks: [
        {
          type: 'paragraph',
          text: 'We rely on a small number of trusted third party providers, each processing only the data needed for its role. We never sell your data.',
        },
        {
          type: 'bullets',
          items: [
            'Supabase — authentication and backend database (account and profile data), hosted on Amazon Web Services (AWS) infrastructure in the United States.',
            'PostHog — anonymous product analytics, processed in the United States.',
            'Sentry — crash and error reporting, processed in the United States.',
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
          text: 'Fantasy Gaffer stores and processes data in the United States. Our database and authentication provider, Supabase, hosts our data on Amazon Web Services (AWS) infrastructure in the US East (N. Virginia) region, and our analytics and crash-reporting providers process data in the United States as well. If you are located in the European Economic Area, the United Kingdom, or another region that restricts international data transfers, this means your personal data is transferred outside your country. Where that happens, the transfer is made under the European Commission’s Standard Contractual Clauses — together with the UK International Data Transfer Addendum where it applies — and under data processing agreements with each provider that require them to protect your data to those standards.',
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
