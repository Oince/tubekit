export const SCRIPT_ID = 'tubekit';
const SAFARI_OVERLAY_SCROLLBAR_HOVER_WIDTH = 11;
const SAFARI_OVERLAY_SCROLLBAR_EDGE_INSET = 3;
export const SCROLLBAR_AREA_WIDTH = SAFARI_OVERLAY_SCROLLBAR_HOVER_WIDTH + SAFARI_OVERLAY_SCROLLBAR_EDGE_INSET;
export const COMMENTS_WAIT_MS = 20_000;
export const LIVE_COMMENTS_GRACE_MS = 3_000;
export const SCROLL_IDLE_MS = 150;
export const COMMENTS_CHECK_MS = 250;

export const SELECTORS = {
  primary: '#primary',
  secondary: '#secondary',
  secondaryInner: '#secondary-inner',
  related: 'ytd-watch-next-secondary-results-renderer#related, #related',
  comments: 'ytd-comments#comments',
};
