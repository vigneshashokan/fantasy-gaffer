import { AccessibilityInfo } from 'react-native';
import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { act } from 'react-test-renderer';
import {
  MAX_FONT_SCALE,
  announce,
  useReducedMotion,
  useA11yAnnounce,
} from '@/lib/a11y';

describe('a11y primitives', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('MAX_FONT_SCALE is 1.4', () => {
    expect(MAX_FONT_SCALE).toBe(1.4);
  });

  it('announce() forwards non-empty messages to AccessibilityInfo', () => {
    const spy = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
    announce('Hello');
    expect(spy).toHaveBeenCalledWith('Hello');
  });

  it('announce() ignores empty messages', () => {
    const spy = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
    announce('');
    expect(spy).not.toHaveBeenCalled();
  });

  it('useReducedMotion resolves the initial system value', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    let value: boolean | undefined;
    function Probe() {
      value = useReducedMotion();
      return null;
    }
    render(<Probe />);
    await act(async () => {});
    expect(value).toBe(true);
  });

  it('useA11yAnnounce announces only when the message changes', () => {
    const spy = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
    function Probe({ msg }: { msg: string | null }) {
      useA11yAnnounce(msg);
      return <Text>{msg}</Text>;
    }
    const r = render(<Probe msg={null} />);
    expect(spy).not.toHaveBeenCalled();
    r.rerender(<Probe msg="Saved" />);
    expect(spy).toHaveBeenCalledTimes(1);
    r.rerender(<Probe msg="Saved" />);
    expect(spy).toHaveBeenCalledTimes(1); // unchanged message → no re-announce
  });
});
