import { createCommentsRegion, createRelatedRegion } from './borrowed-region.js';
import { FAILED, LOADED, LOADING, OFF, createCommentsLoader } from './comments-loader.js';
import { SCRIPT_ID } from './constants.js';
import { ACTIVE_CLASS, HELD, HELD_CLASS, RELEASED, initialLifecycle, mountFailed, step } from './lifecycle.js';
import { addStyles } from './styles.js';
import { FILL_CLASS, YOUTUBE_TABS_ID, createYoutubePanels, handleTabKeys } from './youtube-panels.js';
import {
  SCREEN_ATTRIBUTES,
  WATCH_HIDDEN_ATTRIBUTE,
  YOUTUBE_PANEL_ATTRIBUTES,
  findApp,
  findNativeRelated,
  findYoutubePanels,
  findSecondaryInner,
  findWatch,
  isBrowserFullscreen,
  isDesktopSite,
  isFullscreen,
  isPlayerArea,
  isTwoColumnScreen,
  isTwoColumnScreenLeft,
  isWatchHidden,
  isVideoPage,
  pageFollowsUrl,
  pageVideoId,
  urlVideoId,
  watchPanelRequests,
} from '../../core/youtube.js';

const SAFARI_OVERLAY_SCROLLBAR_HOVER_WIDTH = 11;
const SAFARI_OVERLAY_SCROLLBAR_EDGE_INSET = 3;
const SCROLLBAR_AREA_WIDTH = SAFARI_OVERLAY_SCROLLBAR_HOVER_WIDTH + SAFARI_OVERLAY_SCROLLBAR_EDGE_INSET;
const SCROLL_IDLE_MS = 150;

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
  switchDeferred: false,
  activeTab: 'comments',
  scrollTop: { comments: 0, related: 0 },
  lifecycle: initialLifecycle,
  youtubePanelOpen: false,
  youtubePanelList: [],
  panelRequest: null,
  panelSelectionVideoId: null,
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
        chat: '채팅',
        panel: '패널',
      }
    : {
        comments: 'Comments',
        related: 'Related videos',
        loading: 'Loading comments…',
        loadFailed: 'Comments could not be loaded.',
        retry: 'Retry',
        unavailable: 'Comments are unavailable for this video. Showing related videos.',
        chat: 'Chat',
        panel: 'Panel',
      };
};

const youtubePanels = createYoutubePanels({ labels, onTitleChange: () => youtubePanels.refreshTitles() });

const isOwnNode = (node) => node.id === YOUTUBE_TABS_ID;

const isOwnInsertion = (record) => (
  record.type === 'childList' && [...record.addedNodes, ...record.removedNodes].every(isOwnNode)
);

function isRootBroken(watch) {
  return !state.root.isConnected ||
    state.root.parentNode !== findSecondaryInner(watch) ||
    !state.root.contains(state.commentsPane) || !state.root.contains(state.relatedPane);
}

function isWrongGeneration(watch) {
  const pageVideo = pageVideoId(watch);
  return state.watch !== watch || (pageVideo !== null && pageVideo !== state.videoId);
}

function observe(measurePanel) {
  const watch = findWatch();
  const mounted = Boolean(state.root);
  const twoColumn = isTwoColumnScreen(watch);
  const leaving = mounted && isTwoColumnScreenLeft(watch);
  const videoAddress = isVideoPage();
  const gone = mounted && !videoAddress && isWatchHidden(watch);
  const fullscreen = isFullscreen(watch);
  const wrongGeneration = mounted && isWrongGeneration(watch);
  const brokenRoot = mounted && isRootBroken(watch);
  const phase = state.lifecycle.phase;
  const mayReveal = twoColumn && (
    phase === RELEASED ||
    wrongGeneration ||
    brokenRoot ||
    (phase === HELD && !fullscreen && !state.youtubePanelOpen)
  );
  const measured = Boolean(measurePanel || mayReveal);
  if (measured) {
    state.youtubePanelList = findYoutubePanels(watch);
    state.youtubePanelOpen = state.youtubePanelList.length > 0;
  }
  return {
    watch,
    measured,
    observation: {
      videoId: videoAddress ? urlVideoId() : null,
      twoColumn,
      leaving,
      gone,
      pageFollowsUrl: pageFollowsUrl(watch),
      fullscreen,
      youtubePanel: state.youtubePanelOpen,
      wrongGeneration,
      brokenRoot,
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

  tabs.addEventListener('keydown', (event) => handleTabKeys(event, tabs, (button) => switchTab(button.dataset.tab)));

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
  state.unavailableTimer = window.setTimeout(switchToRelatedIfOff, 900);
}

function switchToRelatedIfOff() {
  state.switchDeferred = false;
  if (state.commentsLoader?.state !== OFF) return;
  if (state.videoId !== urlVideoId()) {
    state.switchDeferred = true;
    return;
  }
  switchTab('related');
}

function reactToComments(commentsState) {
  clearTimeout(state.unavailableTimer);
  state.switchDeferred = false;
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
  const inner = findSecondaryInner(state.watch);
  if (!inner) return;
  const generation = state.generation;
  let pending = false;
  state.specialObserver = new MutationObserver((records) => {
    if (pending || (state.root && records.every((record) => !record.target.isConnected || state.root.contains(record.target) || youtubePanels.contains(record.target) || isOwnInsertion(record)))) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      if (generation === state.generation) advanceLifecycle();
    });
  });
  state.specialObserver.observe(inner, {
    attributes: true,
    attributeFilter: YOUTUBE_PANEL_ATTRIBUTES,
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
  if (!findSecondaryInner(watch) || !findNativeRelated(watch)) return false;

  state.generation += 1;
  state.watch = watch;
  state.videoId = urlVideoId();
  if (state.panelSelectionVideoId !== null && state.panelSelectionVideoId !== state.videoId) forgetPanelSelection();
  else if (state.panelSelectionVideoId === null) youtubePanels.forget();
  state.panelSelectionVideoId = state.videoId;
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
  state.switchDeferred = false;
  clearTimeout(state.retryTimer);
  state.specialObserver?.disconnect();
  state.specialObserver = null;
  state.commentsLoader?.dispose();
  youtubePanels.release();

  const comments = state.commentsRegion;
  const related = state.relatedRegion;
  const relatedBeforeComments = related?.node && related.node.nextElementSibling === comments?.node
    ? comments.node : null;
  comments?.restore(state.watch, { videoId: pageVideoId(state.watch) });
  related?.restore(state.watch, { videoId: pageVideoId(state.watch), before: relatedBeforeComments });
  state.root?.remove();
  document.documentElement.classList.remove(ACTIVE_CLASS, HELD_CLASS, FILL_CLASS);

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

function syncYoutubePanels(watch, phase, observation, measured) {
  if (!state.root || !measured) return;
  const filling = phase === HELD && state.youtubePanelList.length > 0 && !observation.fullscreen;
  document.documentElement.classList.toggle(FILL_CLASS, filling);
  youtubePanels.sync(watch, state.youtubePanelList, { filling, fullscreen: observation.fullscreen, request: state.panelRequest });
  state.panelRequest = null;
}

function forgetPanelSelection() {
  youtubePanels.forget();
  state.panelRequest = null;
}

function forgetStalePanelSelection(videoId) {
  if (state.root || state.panelSelectionVideoId === null || state.panelSelectionVideoId === videoId) return;
  forgetPanelSelection();
  state.panelSelectionVideoId = null;
}

function advanceLifecycle(facts = {}, { measurePanel = true } = {}) {
  const { watch, observation, measured } = observe(measurePanel);
  const { state: next, effects } = step(state.lifecycle, { ...observation, ...facts });
  for (const effect of effects) {
    if (reflectors[effect.type](effect, watch) === false) {
      state.lifecycle = mountFailed(next);
      forgetStalePanelSelection(observation.videoId);
      return;
    }
  }
  state.lifecycle = next;
  forgetStalePanelSelection(observation.videoId);
  syncYoutubePanels(watch, next.phase, { ...observation, ...facts }, measured);
}

function evaluate() {
  addStyles();
  refreshLabels();
  advanceLifecycle();
  if (state.root) {
    if (state.switchDeferred) switchToRelatedIfOff();
    state.commentsLoader.refresh();
    syncReplacedRelated();
    syncScrollbarInsets();
  }
}

function isInsideAdoptedContent(node) {
  return Boolean(state.commentsRegion?.contains(node) || state.relatedRegion?.contains(node));
}

const isIrrelevantTarget = (node) => !node.isConnected || isInsideAdoptedContent(node) || youtubePanels.contains(node) || isPlayerArea(node);

const isIdleOffWatch = () => !state.root && !isVideoPage();

const isOtherHiddenChange = (record) => (
  record.type === 'attributes' && record.attributeName === WATCH_HIDDEN_ATTRIBUTE && record.target !== state.watch
);

const onlyIrrelevantChanges = (records) => records.every((record) => (
  isIrrelevantTarget(record.target) || isOtherHiddenChange(record) || isOwnInsertion(record)
));

function onAppMutations(records) {
  if (isIdleOffWatch() || onlyIrrelevantChanges(records)) return;
  advanceLifecycle({}, { measurePanel: false });
  scheduleEvaluation();
}

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
  const target = findApp() || document.documentElement;
  if (!target || target === state.observerTarget) return;
  state.appObserver?.disconnect();
  state.observerTarget = target;
  state.appObserver = new MutationObserver(onAppMutations);
  state.appObserver.observe(target, {
    attributes: true,
    attributeFilter: [...SCREEN_ATTRIBUTES, WATCH_HIDDEN_ATTRIBUTE],
    childList: true,
    subtree: true,
  });
}

function onFullscreenChange() {
  if (isBrowserFullscreen()) advanceLifecycle({ fullscreen: true });
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
    onAppMutations(records);
  });
  state.observerTarget = document.documentElement;
  state.appObserver.observe(document.documentElement, { childList: true, subtree: true });
  retargetObserver();

  const controller = new AbortController();
  const { signal } = controller;
  const capture = { capture: true, signal };
  document.addEventListener('yt-navigate-start', () => scheduleEvaluation(150), capture);
  document.addEventListener('yt-navigate-finish', () => scheduleEvaluation(0), capture);
  document.addEventListener('yt-page-data-updated', () => scheduleEvaluation(0), capture);
  window.addEventListener('fullscreenchange', onFullscreenChange, capture);
  window.addEventListener('popstate', onUrlChanged, capture);
  window.addEventListener('urlchange', onUrlChanged, capture);
  window.addEventListener('resize', () => scheduleEvaluation(180), { passive: true, signal });
  watchPanelRequests((request) => {
    state.panelRequest = request;
    scheduleEvaluation(0);
  }, signal);
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
    youtubePanels.release();
  };
}

export default {
  id: 'right-rail-comments',
  start: boot,
};
