import { createCommentsRegion, createRelatedRegion } from './borrowed-region.js';
import { FAILED, LOADED, LOADING, OFF, createCommentsLoader } from './comments-loader.js';
import { SCRIPT_ID, SCROLLBAR_AREA_WIDTH, SCROLL_IDLE_MS, SELECTORS } from './constants.js';
import { ACTIVE_CLASS, HELD, HELD_CLASS, initialLifecycle, mountFailed, step } from './lifecycle.js';
import { addStyles } from './styles.js';
import { findNativeRelated, findWatch, isDesktopSite, isPlayerArea, isVideoPage, pageFollowsUrl, urlVideoId } from '../../core/youtube.js';

const state = {
  generation: 0,
  videoId: null,
  watch: null,
  root: null,
  commentsPane: null,
  relatedPane: null,
  commentsRegion: null,
  relatedRegion: null,
  commentsLoader: null,
  unavailableTimer: 0,
  activeTab: 'comments',
  scrollTop: { comments: 0, related: 0 },
  lifecycle: initialLifecycle,
  evaluationTimer: 0,
  lastPaneScrollAt: 0,
  statusShown: false,
  retryTimer: 0,
  specialObserver: null,
  appObserver: null,
  observerTarget: null,
};

const labels = () => {
  const korean = (document.documentElement.lang || navigator.language || '').toLowerCase().startsWith('ko');
  return korean
    ? {
        comments: '댓글',
        related: '관련 동영상',
        loading: '댓글을 불러오는 중…',
        loadFailed: '댓글을 불러오지 못했습니다.',
        retry: '다시 시도',
        unavailable: '이 영상에서는 댓글을 사용할 수 없어 관련 동영상을 표시합니다.',
      }
    : {
        comments: 'Comments',
        related: 'Related videos',
        loading: 'Loading comments…',
        loadFailed: 'Comments could not be loaded.',
        retry: 'Retry',
        unavailable: 'Comments are unavailable for this video. Showing related videos.',
      };
};

function isTheaterOrFullscreen(watch) {
  return Boolean(
    document.fullscreenElement ||
    watch?.hasAttribute('theater') ||
    watch?.hasAttribute('fullscreen') ||
    watch?.hasAttribute('full-bleed-player') ||
    watch?.hasAttribute('miniplayer') ||
    document.querySelector('ytd-miniplayer[active]')
  );
}

function isFullscreen(watch) {
  return Boolean(document.fullscreenElement || watch?.hasAttribute('fullscreen'));
}

function isTwoColumnLayout(watch) {
  if (!watch || !watch.hasAttribute('is-two-columns_')) return false;

  const primary = watch.querySelector(SELECTORS.primary);
  const secondary = watch.querySelector(SELECTORS.secondary);
  if (!primary || !secondary) return false;

  const primaryRect = primary.getBoundingClientRect();
  const secondaryRect = secondary.getBoundingClientRect();
  if (primaryRect.width < 1 || secondaryRect.width < 280) return false;

  return secondaryRect.left >= primaryRect.right - 16;
}

function isEligible(watch) {
  return isVideoPage() && pageFollowsUrl(watch) && isTwoColumnLayout(watch) && !isTheaterOrFullscreen(watch);
}

function isYoutubePanelOpen(watch) {
  const inner = watch?.querySelector(SELECTORS.secondaryInner);
  if (!inner) return false;

  const chat = inner.querySelector('#chat-container ytd-live-chat-frame:not([collapsed]), ytd-live-chat-frame:not([collapsed])');
  if (chat && chat.getClientRects().length > 0) return true;

  const expandedPanels = [...inner.querySelectorAll(
    'ytd-engagement-panel-section-list-renderer[visibility="ENGAGEMENT_PANEL_VISIBILITY_EXPANDED"]'
  )];
  return expandedPanels.some((panel) => {
    const targetId = panel.getAttribute('target-id') || '';
    return targetId !== 'engagement-panel-comments-section' && panel.getClientRects().length > 0;
  });
}

function isRootBroken(watch) {
  return !state.root.isConnected ||
    state.root.parentNode !== watch?.querySelector(SELECTORS.secondaryInner) ||
    !state.root.contains(state.commentsPane) || !state.root.contains(state.relatedPane);
}

function isWrongGeneration(watch) {
  return state.watch !== watch || state.videoId !== urlVideoId() || !pageFollowsUrl(watch);
}

function observe() {
  const watch = findWatch();
  const mounted = Boolean(state.root);
  return {
    watch,
    observation: {
      navigating: false,
      videoId: urlVideoId(),
      twoColumn: isEligible(watch),
      fullscreen: isFullscreen(watch),
      youtubePanel: isYoutubePanelOpen(watch),
      wrongGeneration: mounted && isWrongGeneration(watch),
      brokenRoot: mounted && isRootBroken(watch),
      currentTab: mounted && state.videoId ? { videoId: state.videoId, tab: state.activeTab } : null,
    },
  };
}

function statusElement(kind) {
  const text = labels();
  const box = document.createElement('div');
  box.className = `${SCRIPT_ID}-status`;
  box.dataset.kind = kind;

  const message = document.createElement('div');
  message.textContent = kind === 'error' ? text.loadFailed : text.loading;
  box.appendChild(message);

  if (kind === 'error') {
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = `${SCRIPT_ID}-retry`;
    retry.textContent = text.retry;
    retry.addEventListener('click', retryComments);
    box.appendChild(retry);
  }
  return box;
}

function setCommentsStatus(kind) {
  if (!state.commentsPane) return;
  if (!kind && !state.statusShown) return;
  state.commentsPane.querySelectorAll(`:scope > .${SCRIPT_ID}-status`).forEach((node) => node.remove());
  state.statusShown = Boolean(kind);
  if (kind) state.commentsPane.prepend(statusElement(kind));
}

function buildRoot() {
  const text = labels();
  const root = document.createElement('section');
  root.id = `${SCRIPT_ID}-root`;
  root.setAttribute('aria-label', `${text.comments} / ${text.related}`);

  const tabs = document.createElement('div');
  tabs.id = `${SCRIPT_ID}-tabs`;
  tabs.setAttribute('role', 'tablist');

  for (const tabName of ['comments', 'related']) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `${SCRIPT_ID}-tab`;
    button.dataset.tab = tabName;
    button.id = `${SCRIPT_ID}-${tabName}-tab`;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', `${SCRIPT_ID}-${tabName}-pane`);
    button.textContent = text[tabName];
    button.addEventListener('click', () => switchTab(tabName));
    tabs.appendChild(button);
  }

  tabs.addEventListener('keydown', (event) => {
    const buttons = [...tabs.querySelectorAll('[role="tab"]')];
    const index = buttons.indexOf(document.activeElement);
    if (index < 0) return;
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % buttons.length;
    else if (event.key === 'ArrowLeft') next = (index + buttons.length - 1) % buttons.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = buttons.length - 1;
    else return;
    event.preventDefault();
    switchTab(buttons[next].dataset.tab);
    buttons[next].focus();
  });

  const body = document.createElement('div');
  body.id = `${SCRIPT_ID}-body`;

  const commentsPane = document.createElement('div');
  commentsPane.id = `${SCRIPT_ID}-comments-pane`;
  commentsPane.className = `${SCRIPT_ID}-pane`;
  commentsPane.dataset.tab = 'comments';
  commentsPane.setAttribute('role', 'tabpanel');
  commentsPane.setAttribute('aria-labelledby', `${SCRIPT_ID}-comments-tab`);
  commentsPane.addEventListener('scroll', recordPaneScroll, { passive: true });

  const relatedPane = document.createElement('div');
  relatedPane.id = `${SCRIPT_ID}-related-pane`;
  relatedPane.className = `${SCRIPT_ID}-pane`;
  relatedPane.dataset.tab = 'related';
  relatedPane.setAttribute('role', 'tabpanel');
  relatedPane.setAttribute('aria-labelledby', `${SCRIPT_ID}-related-tab`);
  relatedPane.addEventListener('scroll', recordPaneScroll, { passive: true });

  const toast = document.createElement('div');
  toast.id = `${SCRIPT_ID}-toast`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');

  body.append(commentsPane, relatedPane, toast);
  root.append(tabs, body);

  state.root = root;
  state.commentsPane = commentsPane;
  state.relatedPane = relatedPane;
  setCommentsStatus('loading');
  return root;
}

function refreshLabels() {
  if (!state.root) return;
  const text = labels();
  const commentsTab = state.root.querySelector(`[data-tab='comments'].${SCRIPT_ID}-tab`);
  const relatedTab = state.root.querySelector(`[data-tab='related'].${SCRIPT_ID}-tab`);
  if (commentsTab && commentsTab.textContent !== text.comments) commentsTab.textContent = text.comments;
  if (relatedTab && relatedTab.textContent !== text.related) relatedTab.textContent = text.related;
  const label = `${text.comments} / ${text.related}`;
  if (state.root.getAttribute('aria-label') !== label) state.root.setAttribute('aria-label', label);
}

function isHidden() {
  return state.lifecycle.phase === HELD;
}

function isPaneShown(pane) {
  return Boolean(pane) && !isHidden() && pane.getClientRects().length > 0;
}

function saveActiveScrollTop() {
  const pane = state.activeTab === 'comments' ? state.commentsPane : state.relatedPane;
  if (isPaneShown(pane)) state.scrollTop[state.activeTab] = pane.scrollTop;
}

function recordPaneScroll(event) {
  const pane = event.currentTarget;
  const tab = pane.dataset.tab;
  if (!isPaneShown(pane) || pane.scrollTop === state.scrollTop[tab]) return;
  state.lastPaneScrollAt = performance.now();
  state.scrollTop[tab] = pane.scrollTop;
}

function syncScrollbarInsets() {
  const pane = state.activeTab === 'comments' ? state.commentsPane : state.relatedPane;
  if (!state.root || !pane || pane.offsetWidth === 0) return;
  const scrollbar = Math.max(0, pane.offsetWidth - pane.clientWidth);
  setRootVariable('pane-gutter', `${Math.max(0, SCROLLBAR_AREA_WIDTH - scrollbar)}px`);
  setRootVariable('content-inset', `${Math.max(scrollbar, SCROLLBAR_AREA_WIDTH)}px`);
}

function setRootVariable(name, value) {
  const property = `--${SCRIPT_ID}-${name}`;
  if (state.root.style.getPropertyValue(property) === value) return;
  state.root.style.setProperty(property, value);
}

function switchTab(tabName, options = {}) {
  if (!state.root || !['comments', 'related'].includes(tabName)) return;

  if (!options.keepSaved) saveActiveScrollTop();

  state.activeTab = tabName;
  state.root.querySelectorAll(`.${SCRIPT_ID}-tab`).forEach((button) => {
    const selected = button.dataset.tab === tabName;
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
  });
  state.root.querySelectorAll(`.${SCRIPT_ID}-pane`).forEach((pane) => {
    pane.dataset.active = String(pane.dataset.tab === tabName);
  });

  const activePane = tabName === 'comments' ? state.commentsPane : state.relatedPane;
  const generation = state.generation;
  const target = options.reset ? 0 : state.scrollTop[tabName];
  requestAnimationFrame(() => {
    if (generation !== state.generation || !activePane?.isConnected || state.activeTab !== tabName) return;
    activePane.scrollTop = target;
    activePane.dispatchEvent(new Event('scroll'));
    syncScrollbarInsets();
  });
}

function showToast(message) {
  const toast = state.root?.querySelector(`#${SCRIPT_ID}-toast`);
  if (!toast) return;
  clearTimeout(state.retryTimer);
  toast.textContent = message;
  toast.dataset.visible = 'true';
  state.retryTimer = window.setTimeout(() => {
    toast.dataset.visible = 'false';
  }, 4_500);
}

function showCommentsUnavailable() {
  setCommentsStatus(null);
  showToast(labels().unavailable);
  state.unavailableTimer = window.setTimeout(() => {
    if (state.commentsLoader?.state === OFF && state.videoId === urlVideoId()) switchTab('related');
  }, 900);
}

function reactToComments(commentsState) {
  clearTimeout(state.unavailableTimer);
  if (commentsState === LOADING) setCommentsStatus('loading');
  else if (commentsState === FAILED) setCommentsStatus('error');
  else if (commentsState === LOADED) setCommentsStatus(null);
  else if (commentsState === OFF) showCommentsUnavailable();
}

function retryComments() {
  if (!state.root) return;
  switchTab('comments');
  state.commentsLoader.retry();
}

function observeSpecialPanels() {
  state.specialObserver?.disconnect();
  const inner = state.watch?.querySelector(SELECTORS.secondaryInner);
  if (!inner) return;
  const generation = state.generation;
  let pending = false;
  state.specialObserver = new MutationObserver((records) => {
    if (pending || (state.root && records.every((record) => !record.target.isConnected || state.root.contains(record.target)))) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      if (generation === state.generation) advanceLifecycle();
    });
  });
  state.specialObserver.observe(inner, {
    attributes: true,
    attributeFilter: ['visibility', 'hidden', 'collapsed'],
    childList: true,
    subtree: true,
  });
}

function syncReplacedRelated() {
  if (!state.root?.isConnected || !state.relatedPane) return;
  const region = state.relatedRegion;
  if (!region.replaced(state.watch)) return;

  const savedScrollTop = state.activeTab === 'related' && isPaneShown(state.relatedPane)
    ? state.relatedPane.scrollTop
    : state.scrollTop.related;

  if (!region.take(state.watch)) return;
  state.scrollTop.related = savedScrollTop;

  const generation = state.generation;
  requestAnimationFrame(() => {
    if (generation === state.generation && state.activeTab === 'related' && state.relatedPane) {
      state.relatedPane.scrollTop = savedScrollTop;
    }
  });
}

function applyHeld(held) {
  document.documentElement.classList.toggle(HELD_CLASS, held);
  state.root.dataset.suspended = String(held);
}

function mount(watch, initialTab) {
  const secondaryInner = watch?.querySelector(SELECTORS.secondaryInner);
  if (!secondaryInner || !findNativeRelated(watch)) return false;

  state.generation += 1;
  state.watch = watch;
  state.videoId = urlVideoId();
  state.activeTab = initialTab;
  state.scrollTop = { comments: 0, related: 0 };

  const root = buildRoot();
  state.relatedRegion = createRelatedRegion(state.relatedPane, root);
  state.commentsRegion = createCommentsRegion(state.commentsPane, root);
  state.commentsLoader = createCommentsLoader({
    region: state.commentsRegion,
    watch,
    videoId: state.videoId,
    onChange: reactToComments,
  });
  state.relatedRegion.take(watch, (related) => related.before(root));

  document.documentElement.classList.add(ACTIVE_CLASS);
  applyHeld(false);
  switchTab(initialTab, { reset: true });
  observeSpecialPanels();
  state.commentsLoader.start();
  return true;
}

function teardown() {
  clearTimeout(state.unavailableTimer);
  clearTimeout(state.retryTimer);
  state.specialObserver?.disconnect();
  state.specialObserver = null;
  state.commentsLoader?.dispose();

  const comments = state.commentsRegion;
  const related = state.relatedRegion;
  const relatedBeforeComments = related?.node && related.node.nextElementSibling === comments?.node
    ? comments.node : null;
  comments?.restore(state.watch, { videoId: state.videoId });
  related?.restore(state.watch, { videoId: state.videoId, before: relatedBeforeComments });
  state.root?.remove();
  document.documentElement.classList.remove(ACTIVE_CLASS, HELD_CLASS);

  state.generation += 1;
  state.root = null;
  state.commentsPane = null;
  state.relatedPane = null;
  state.commentsRegion = null;
  state.relatedRegion = null;
  state.commentsLoader = null;
  state.videoId = null;
  state.watch = null;
}

const reflectors = {
  teardown,
  mount: (effect, watch) => mount(watch, effect.tab),
  saveScroll: () => saveActiveScrollTop(),
  hide: () => applyHeld(true),
  unhide: () => applyHeld(false),
  restoreTab: () => switchTab(state.activeTab, { keepSaved: true }),
};

function advanceLifecycle(facts = {}) {
  const { watch, observation } = observe();
  const { state: next, effects } = step(state.lifecycle, { ...observation, ...facts });
  for (const effect of effects) {
    if (reflectors[effect.type](effect, watch) === false) {
      state.lifecycle = mountFailed(next);
      return;
    }
  }
  state.lifecycle = next;
}

function evaluate() {
  addStyles();
  refreshLabels();
  advanceLifecycle();
  if (state.root) {
    state.commentsLoader.refresh();
    syncReplacedRelated();
    syncScrollbarInsets();
  }
}

function isInsideAdoptedContent(node) {
  return Boolean(state.commentsRegion?.contains(node) || state.relatedRegion?.contains(node));
}

const isIrrelevantTarget = (node) => !node.isConnected || isInsideAdoptedContent(node) || isPlayerArea(node);

const isIdleOffWatch = () => !state.root && !isVideoPage();

const onlyIrrelevantChanges = (records) => records.every((record) => isIrrelevantTarget(record.target));

function scheduleEvaluation(delay = 80) {
  clearTimeout(state.evaluationTimer);
  const run = () => {
    const wait = SCROLL_IDLE_MS - (performance.now() - state.lastPaneScrollAt);
    if (state.lastPaneScrollAt > 0 && wait > 0) {
      state.evaluationTimer = window.setTimeout(run, wait);
      return;
    }
    evaluate();
  };
  state.evaluationTimer = window.setTimeout(run, delay);
}

function retargetObserver() {
  const target = document.querySelector('ytd-app') || document.documentElement;
  if (!target || target === state.observerTarget) return;
  state.appObserver?.disconnect();
  state.observerTarget = target;
  state.appObserver = new MutationObserver((records) => {
    if (isIdleOffWatch()) return;
    if (!onlyIrrelevantChanges(records)) scheduleEvaluation();
  });
  state.appObserver.observe(target, {
    attributes: true,
    attributeFilter: [
      'theater',
      'fullscreen',
      'full-bleed-player',
      'miniplayer',
      'is-two-columns_',
      'video-id',
    ],
    childList: true,
    subtree: true,
  });
}

function onNavigateStart() {
  advanceLifecycle({ navigating: true });
  scheduleEvaluation(150);
}

function onFullscreenChange() {
  if (document.fullscreenElement) advanceLifecycle({ fullscreen: true });
  scheduleEvaluation(0);
}

function onUrlChanged() {
  advanceLifecycle();
  scheduleEvaluation(0);
}

function boot() {
  if (!isDesktopSite()) return () => {};
  addStyles();
  state.appObserver = new MutationObserver((records) => {
    retargetObserver();
    if (isIdleOffWatch()) return;
    if (!onlyIrrelevantChanges(records)) scheduleEvaluation();
  });
  state.observerTarget = document.documentElement;
  state.appObserver.observe(document.documentElement, { childList: true, subtree: true });

  const controller = new AbortController();
  const { signal } = controller;
  const capture = { capture: true, signal };
  document.addEventListener('yt-navigate-start', onNavigateStart, capture);
  document.addEventListener('yt-navigate-finish', () => scheduleEvaluation(0), capture);
  document.addEventListener('yt-page-data-updated', () => scheduleEvaluation(0), capture);
  window.addEventListener('fullscreenchange', onFullscreenChange, capture);
  window.addEventListener('popstate', onUrlChanged, capture);
  window.addEventListener('urlchange', onUrlChanged, capture);
  window.addEventListener('resize', () => scheduleEvaluation(180), { passive: true, signal });
  document.addEventListener('DOMContentLoaded', () => {
    retargetObserver();
    scheduleEvaluation(0);
  }, { once: true, signal });

  scheduleEvaluation(0);
  return () => {
    controller.abort();
    state.appObserver?.disconnect();
    state.commentsLoader?.dispose();
    state.specialObserver?.disconnect();
  };
}

export default {
  id: 'right-rail-comments',
  start: boot,
};
