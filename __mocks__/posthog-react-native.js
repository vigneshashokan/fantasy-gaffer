// Manual mock — jest auto-uses this for every `posthog-react-native` import so
// tests never load the real native SDK. Tests that assert analytics behaviour
// override this with a local jest.mock(...).
const React = require('react');

class PostHog {
  capture() {}
  identify() {}
  reset() {}
  optIn() {}
  optOut() {}
  reloadFeatureFlagsAsync() {
    return Promise.resolve({});
  }
  getFeatureFlag() {
    return undefined;
  }
  isFeatureEnabled() {
    return undefined;
  }
  get optedOut() {
    return false;
  }
}

const PostHogProvider = ({ children }) => React.createElement(React.Fragment, null, children);
const useFeatureFlag = () => undefined;
const usePostHog = () => new PostHog();

module.exports = {
  __esModule: true,
  default: PostHog,
  PostHog,
  PostHogProvider,
  useFeatureFlag,
  usePostHog,
};
