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
