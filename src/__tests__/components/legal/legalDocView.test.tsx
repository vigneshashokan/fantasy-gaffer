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
