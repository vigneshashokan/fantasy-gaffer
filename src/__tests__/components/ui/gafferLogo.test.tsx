import React from 'react';
import { render } from '@testing-library/react-native';
import { Image, Text } from 'react-native';
import { GafferLogo } from '@/components/ui/GafferLogo';

// #201: the wordmark is set in type, not loaded from art. These pin the two
// things that actually broke before — stale brand text baked into a PNG, and a
// light variant that did not exist — plus the footprint the nine onboarding
// screens lay out against.
describe('GafferLogo wordmark', () => {
  it('renders the post-rebrand name as text, never "FPL"', () => {
    const { getByText, queryByText } = render(<GafferLogo />);
    expect(getByText('Fantasy Gaffer')).toBeTruthy();
    expect(queryByText(/FPL/)).toBeNull();
  });

  it('loads no image, so no wordmark art can go stale again', () => {
    const { UNSAFE_queryAllByType } = render(<GafferLogo size={46} />);
    expect(UNSAFE_queryAllByType(Image)).toHaveLength(0);
  });

  it('boxes to the requested height so it drops into the old Image layout', () => {
    const { UNSAFE_getByType } = render(<GafferLogo size={46} />);
    expect(UNSAFE_getByType(Text).props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ lineHeight: 46 })]),
    );
  });

  it('uses the Archivo weight the root layout actually registers', () => {
    const { UNSAFE_getByType } = render(<GafferLogo />);
    expect(UNSAFE_getByType(Text).props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fontFamily: 'Archivo_900Black' }),
      ]),
    );
  });

  // The retired art had no working light variant, so the component tinted the
  // dark PNG white and flattened the mark's green accent. Colour is now just a
  // prop, and both directions have to keep working.
  it('inks dark on light surfaces and white on dark ones', () => {
    const onLight = render(<GafferLogo />);
    expect(onLight.UNSAFE_getByType(Text).props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: '#37003C' })]),
    );

    const onDark = render(<GafferLogo light />);
    expect(onDark.UNSAFE_getByType(Text).props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: '#FFFFFF' })]),
    );
  });
});

describe('GafferLogo mark', () => {
  it('still renders the image — the mark carries no text and needed no rebrand', () => {
    const { UNSAFE_getAllByType } = render(<GafferLogo variant="mark" size={40} />);
    const images = UNSAFE_getAllByType(Image);
    expect(images).toHaveLength(1);
    expect(images[0].props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ height: 40, width: 40 * (574 / 401) }),
      ]),
    );
  });
});
