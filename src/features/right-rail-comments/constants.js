export const SCRIPT_ID = 'tubekit';
// Safari's overlay scrollbar, widened on hover, reaches 14px in from the panel's right edge (11px thumb + 3px inset).
export const SCROLLBAR_AREA_WIDTH = 14;
export const COMMENTS_WAIT_MS = 20_000;
export const LIVE_COMMENTS_GRACE_MS = 3_000;
export const SCROLL_IDLE_MS = 150;
export const COMMENTS_CHECK_MS = 250;

export const SELECTORS = {
  watch: 'ytd-watch-flexy',
  primary: '#primary',
  secondary: '#secondary',
  secondaryInner: '#secondary-inner',
  related: 'ytd-watch-next-secondary-results-renderer#related, #related',
  comments: 'ytd-comments#comments',
};
