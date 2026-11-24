const PLAYER_ID = 'movie_player';
const AD_CLASSES = ['ad-showing', 'ad-interrupting'];
const WATCH_SELECTOR = 'ytd-watch-flexy';
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const SHORTS_PATH = /^\/shorts\/([^/]+)\/?$/;
const EMBED_SHORTS_OR_CHAT_PATH = /^\/(embed|shorts|live_chat)(\/|$)/;
const PLAYING_STATE = 1;
const STOPPED_STATES = [-1, 0, 5];

export const PLAYER_SELECTOR = `#${PLAYER_ID}`;
export const NOT_AD_SELECTOR = AD_CLASSES.map(name => `:not(.${name})`).join('');
export const AD_PLAYER_SELECTORS = AD_CLASSES.map(name => `${PLAYER_SELECTOR}.${name}`);
const PLAYER_AREA_SELECTOR = `${PLAYER_SELECTOR}, ytd-player`;

export const PRIMARY_SELECTOR = '#primary';
export const SECONDARY_SELECTOR = '#secondary';
export const SECONDARY_INNER_SELECTOR = '#secondary-inner';
export const RELATED_SELECTORS = ['#related', 'ytd-watch-next-secondary-results-renderer#related'];
export const COMMENTS_SELECTOR = 'ytd-comments#comments';
const COMMENTS_HOME_SELECTOR = `${PRIMARY_SELECTOR} #below`;
const COMMENTS_LOADED_SELECTOR = 'ytd-comments-header-renderer, ytd-comment-thread-renderer, ytd-message-renderer, #header #count';

const PAGE_VIDEO_ID_ATTRIBUTE = 'video-id';
const FULLSCREEN_ATTRIBUTE = 'fullscreen';
export const WATCH_HIDDEN_ATTRIBUTE = 'hidden';
const TWO_COLUMN_PRESENT = ['is-two-columns_'];
const TWO_COLUMN_ABSENT = ['theater', FULLSCREEN_ATTRIBUTE];

export const TWO_COLUMN_SELECTOR = [
  WATCH_SELECTOR,
  ...TWO_COLUMN_PRESENT.map(name => `[${name}]`),
  ...TWO_COLUMN_ABSENT.map(name => `:not([${name}])`),
].join('');
export const NOT_TWO_COLUMN_SELECTORS = [
  ...TWO_COLUMN_PRESENT.map(name => `${WATCH_SELECTOR}:not([${name}])`),
  ...TWO_COLUMN_ABSENT.map(name => `${WATCH_SELECTOR}[${name}]`),
];
export const SCREEN_ATTRIBUTES = [...TWO_COLUMN_PRESENT, ...TWO_COLUMN_ABSENT, PAGE_VIDEO_ID_ATTRIBUTE];

const CHAT_FRAME_SELECTOR = 'ytd-live-chat-frame';
const CHAT_COLLAPSED_ATTRIBUTE = 'collapsed';
const PANEL_SELECTOR = 'ytd-engagement-panel-section-list-renderer';
const PANEL_VISIBILITY_ATTRIBUTE = 'visibility';
const PANEL_EXPANDED_VALUE = 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED';
const PANEL_COMMENTS_TARGET_ID = 'engagement-panel-comments-section';

export const YOUTUBE_PANEL_ATTRIBUTES = [PANEL_VISIBILITY_ATTRIBUTE, 'hidden', CHAT_COLLAPSED_ATTRIBUTE];

export function isDesktopSite() {
  return location.hostname === 'www.youtube.com';
}

export function urlVideoId() {
  try {
    return new URL(location.href).searchParams.get('v') || null;
  } catch {
    return null;
  }
}

export function isVideoPage() {
  return location.pathname === '/watch' && Boolean(urlVideoId());
}

export function isVideoId(value) {
  return typeof value === 'string' && VIDEO_ID_PATTERN.test(value);
}

export function shortsVideoId() {
  const match = SHORTS_PATH.exec(location.pathname);
  return match && isVideoId(match[1]) ? match[1] : null;
}

export function isEmbedShortsOrChatPage() {
  return EMBED_SHORTS_OR_CHAT_PATH.test(location.pathname);
}

export function findPlayer() {
  return document.getElementById(PLAYER_ID);
}

export function playerContaining(node) {
  if (!node || typeof node.closest !== 'function') return null;
  return node.closest(PLAYER_SELECTOR);
}

export function playerOfMediaEvent(event) {
  const target = event?.target;
  if (!target || target.tagName !== 'VIDEO') return null;
  return playerContaining(target);
}

export function isPlayerArea(node) {
  return Boolean(node && typeof node.closest === 'function' && node.closest(PLAYER_AREA_SELECTOR));
}

export function isAdShowing(player) {
  return Boolean(player) && AD_CLASSES.some(name => player.classList.contains(name));
}

export function findWatch(player) {
  const holder = player && typeof player.closest === 'function' ? player.closest(WATCH_SELECTOR) : null;
  if (holder) return holder;
  const watches = [...document.querySelectorAll(WATCH_SELECTOR)];
  if (watches.length <= 1) return watches[0] || null;
  return watches.find(watch => !watch.hidden && watch.getClientRects().length > 0) || watches.at(-1) || null;
}

function call(player, method, ...args) {
  if (!player || typeof player[method] !== 'function') throw new TypeError(`player.${method} is unavailable`);
  return player[method](...args);
}

function playerVideoId(player) {
  try {
    return call(player, 'getVideoData').video_id || null;
  } catch {
    return null;
  }
}

export function currentVideoId(player = findPlayer()) {
  if (isVideoPage()) return urlVideoId();
  return isAdShowing(player) ? null : playerVideoId(player);
}

export function playerFollowsVideo(player, videoId) {
  if (!videoId || playerVideoId(player) !== videoId) return false;
  try {
    const responseId = call(player, 'getPlayerResponse')?.videoDetails?.videoId;
    return !responseId || responseId === videoId;
  } catch {
    return true;
  }
}

export function pageVideoId(watch) {
  return watch?.getAttribute(PAGE_VIDEO_ID_ATTRIBUTE) || null;
}

export function pageFollowsUrl(watch) {
  const videoId = urlVideoId();
  return Boolean(videoId && videoId === pageVideoId(watch));
}

export function findApp() {
  return document.querySelector('ytd-app');
}

export function isBrowserFullscreen() {
  return Boolean(document.fullscreenElement);
}

export function isFullscreen(watch) {
  return isBrowserFullscreen() || Boolean(watch?.hasAttribute(FULLSCREEN_ATTRIBUTE));
}

function hasTwoColumnMarks(watch) {
  if (!watch || isBrowserFullscreen()) return false;
  return TWO_COLUMN_PRESENT.every(name => watch.hasAttribute(name)) &&
    TWO_COLUMN_ABSENT.every(name => !watch.hasAttribute(name));
}

export function isTwoColumnScreen(watch) {
  return isVideoPage() && hasTwoColumnMarks(watch);
}

export function isWatchHidden(watch) {
  return !watch || watch.hasAttribute(WATCH_HIDDEN_ATTRIBUTE);
}

export function isTwoColumnScreenLeft(watch) {
  return !isVideoPage() && hasTwoColumnMarks(watch) && !isWatchHidden(watch);
}

export function findSecondaryInner(watch) {
  return watch?.querySelector(SECONDARY_INNER_SELECTOR) || null;
}

export function findCommentsHome(watch) {
  return watch?.querySelector(COMMENTS_HOME_SELECTOR) || watch?.querySelector(PRIMARY_SELECTOR) || null;
}

export function isYoutubePanelOpen(watch) {
  const inner = findSecondaryInner(watch);
  if (!inner) return false;

  const chat = inner.querySelector(`${CHAT_FRAME_SELECTOR}:not([${CHAT_COLLAPSED_ATTRIBUTE}])`);
  if (chat && chat.getClientRects().length > 0) return true;

  const expandedPanels = [...inner.querySelectorAll(`${PANEL_SELECTOR}[${PANEL_VISIBILITY_ATTRIBUTE}="${PANEL_EXPANDED_VALUE}"]`)];
  return expandedPanels.some(panel => (
    (panel.getAttribute('target-id') || '') !== PANEL_COMMENTS_TARGET_ID && panel.getClientRects().length > 0
  ));
}

export function videoAspectRatio(player) {
  try {
    const ratio = Number(call(player, 'getVideoAspectRatio'));
    return Number.isFinite(ratio) && ratio > 0 ? ratio : NaN;
  } catch {
    return NaN;
  }
}

export function videoContentRect(player) {
  try {
    const rect = call(player, 'getVideoContentRect');
    return rect && rect.width > 0 && rect.height > 0 ? rect : null;
  } catch {
    return null;
  }
}

function playerState(player) {
  try {
    return call(player, 'getPlayerState');
  } catch {
    return null;
  }
}

export function isPlaying(player) {
  return playerState(player) === PLAYING_STATE;
}

export function isStopped(player) {
  return STOPPED_STATES.includes(playerState(player));
}

export function videoKeywords(player) {
  try {
    const keywords = call(player, 'getPlayerResponse').videoDetails.keywords;
    return Array.isArray(keywords) ? keywords.filter(keyword => typeof keyword === 'string') : [];
  } catch {
    return [];
  }
}

export function setVideoKeywords(player, keywords) {
  try {
    call(player, 'updateVideoData', { keywords });
    return true;
  } catch {
    return false;
  }
}

export function availableQualities(player) {
  try {
    const data = call(player, 'getAvailableQualityData');
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function setPlaybackQuality(player, quality, ...format) {
  try {
    call(player, 'setPlaybackQualityRange', quality, quality, ...format);
    return true;
  } catch {
    return false;
  }
}

export function requestLayout() {
  window.dispatchEvent(new Event('resize'));
}

export const COMMENTS_OFF_BY_UPLOADER = 'uploader';
export const COMMENTS_OFF_LIVE_LOOK = 'live-look';

export function findNativeComments(watch, ignoreInside = null) {
  if (!watch) return null;
  const candidates = [...watch.querySelectorAll(COMMENTS_SELECTOR)];
  return candidates.find(node => !(ignoreInside && node.closest(ignoreInside)) && node.closest(PRIMARY_SELECTOR)) || null;
}

export function findNativeRelated(watch) {
  const secondaryInner = findSecondaryInner(watch);
  if (!secondaryInner) return null;
  return [...secondaryInner.children].find(child => child.matches(RELATED_SELECTORS.join(', '))) || null;
}

export function commentsHaveLoaded(node) {
  if (!node) return false;
  return Boolean(node.querySelector(COMMENTS_LOADED_SELECTOR));
}

export function commentsOffCandidate(node, watch) {
  if (!node) return null;
  if (node.querySelector('ytd-message-renderer, #message') && !node.querySelector('ytd-comments-header-renderer, ytd-comment-thread-renderer')) {
    return COMMENTS_OFF_BY_UPLOADER;
  }
  if (node.hasAttribute('hidden') && !node.firstElementChild && watch?.querySelector(`${SECONDARY_INNER_SELECTOR} ${CHAT_FRAME_SELECTOR}`)) {
    return COMMENTS_OFF_LIVE_LOOK;
  }
  return null;
}
