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

// The official FPL team page. Fantasy Gaffer is advisory-only — write-back to
// FPL is Phase 6 (FPL has no public write API), so every "confirm" in this app
// saves a plan locally and hands the user off here to actually apply it.
export const FPL_MY_TEAM_URL = 'https://fantasy.premierleague.com/my-team';
