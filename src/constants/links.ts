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

// Universal Link host (#71). Three things must agree on it or auth email links
// break: the `applinks:` entry in app.config.ts, the redirect we ask Supabase
// for (lib/auth/email.ts), and the URL we parse on the way back
// (lib/auth/deepLink.ts). Hence one constant rather than three literals.
//
// Must also be on the Supabase Auth redirect allowlist — GoTrue silently
// rewrites an unlisted redirect_to to the project's Site URL.
export const AUTH_LINK_HOST = 'fantasy-gaffer.com';
export const VERIFY_URL = `https://${AUTH_LINK_HOST}/verify`;
export const RESET_PASSWORD_URL = `https://${AUTH_LINK_HOST}/reset-password`;

// The official FPL team page. Fantasy Gaffer is advisory-only — write-back to
// FPL is Phase 6 (FPL has no public write API), so every "confirm" in this app
// saves a plan locally and hands the user off here to actually apply it.
export const FPL_MY_TEAM_URL = 'https://fantasy.premierleague.com/my-team';
