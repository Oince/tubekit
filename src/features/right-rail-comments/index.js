import { COMMENTS_CHECK_MS, COMMENTS_WAIT_MS, LIVE_COMMENTS_GRACE_MS, SCRIPT_ID, SCROLLBAR_AREA_WIDTH, SCROLL_IDLE_MS, SELECTORS } from './constants.js';
import { addStyles } from './styles.js';

const state = {
  generation: 0,
  videoId: null,
  watch: null,
  root: null,
  commentsPane: null,
  relatedPane: null,
  commentsNode: null,
  relatedNode: null,
  commentsMarker: null,
  relatedMarker: null,
  commentsHome: null,
  unavailableTimer: 0,
  commentsReady: false,
  activeTab: 'comments',
  scrollTop: { comments: 0, related: 0 },
  suspendedBy: null,
  fullscreenHeld: false,
  tabBeforeSpecialPanel: 'comments',
  lastTab: null,
  mountTimeout: 0,
  commentsTimeout: 0,
  commentsCheckTimer: 0,
  evaluationTimer: 0,
  lastPaneScrollAt: 0,
  statusShown: false,
  retryTimer: 0,
  specialObserver: null,
  commentsObserver: null,
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

function readVideoId() {
  try {
    return new URL(location.href).searchParams.get('v');
  } catch {
    return null;
  }
}

function currentWatch() {
  const watches = [...document.querySelectorAll(SELECTORS.watch)];
  return watches.find((watch) => !watch.hidden && watch.getClientRects().length > 0) || watches.at(-1) || null;
}

function isWatchPage() {
  return location.pathname === '/watch' && Boolean(readVideoId());
}

function watchMatchesUrl(watch) {
  const urlVideoId = readVideoId();
  const domVideoId = watch?.getAttribute('video-id');
  return Boolean(urlVideoId && domVideoId && urlVideoId === domVideoId);
}

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
  return isWatchPage() && watchMatchesUrl(watch) && isTwoColumnLayout(watch) && !isTheaterOrFullscreen(watch);
}

function marker(name) {
  return document.createComment(`${SCRIPT_ID}:${name}`);
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
  return state.root?.dataset.suspended === 'true';
}

function isPaneShown(pane) {
  return Boolean(pane) && !isHidden() && pane.getClientRects().length > 0;
}

function saveActiveScrollTop() {
  const pane = state.activeTab === 'comments' ? state.commentsPane : state.relatedPane;
  if (isPaneShown(pane)) state.scrollTop[state.activeTab] = pane.scrollTop;
}

function recordPaneScroll(event) {
  state.lastPaneScrollAt = performance.now();
  const pane = event.currentTarget;
  if (isPaneShown(pane)) state.scrollTop[pane.dataset.tab] = pane.scrollTop;
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

function commentsUnavailable(node) {
  if (!node?.querySelector('ytd-message-renderer, #message')) return false;
  return !node.querySelector('ytd-comments-header-renderer, ytd-comment-thread-renderer');
}

function showCommentsUnavailable(generation, node) {
  state.commentsReady = true;
  clearTimeout(state.commentsTimeout);
  setCommentsStatus(null);
  showToast(labels().unavailable);
  clearTimeout(state.unavailableTimer);
  state.unavailableTimer = window.setTimeout(() => {
    if (generation === state.generation && node === state.commentsNode && state.videoId === readVideoId()) {
      switchTab('related');
    }
  }, 900);
}

function liveCommentsOff() {
  const node = state.commentsNode;
  if (!node?.hasAttribute('hidden') || node.firstElementChild) return false;
  return Boolean(state.watch?.querySelector(`${SELECTORS.secondaryInner} ytd-live-chat-frame`));
}

function observeComments() {
  state.commentsObserver?.disconnect();
  if (!state.commentsNode) return;

  const generation = state.generation;
  const node = state.commentsNode;
  let unavailable = false;
  const check = () => {
    if (generation !== state.generation || node !== state.commentsNode || state.videoId !== readVideoId()) return;
    if (commentsUnavailable(state.commentsNode)) {
      if (!unavailable) {
        unavailable = true;
        showCommentsUnavailable(generation, node);
      } else {
        state.commentsReady = true;
        clearTimeout(state.commentsTimeout);
        setCommentsStatus(null);
      }
      return;
    }

    unavailable = false;
    clearTimeout(state.unavailableTimer);
    if (commentsHaveLoaded(state.commentsNode)) {
      state.commentsReady = true;
      clearTimeout(state.commentsTimeout);
      setCommentsStatus(null);
    }
  };

  clearTimeout(state.commentsCheckTimer);
  state.commentsCheckTimer = 0;
  state.commentsObserver = new MutationObserver(() => {
    if (state.commentsCheckTimer) return;
    state.commentsCheckTimer = window.setTimeout(() => {
      state.commentsCheckTimer = 0;
      check();
    }, COMMENTS_CHECK_MS);
  });
  state.commentsObserver.observe(state.commentsNode, { childList: true, subtree: true });
  check();
}

function commentsHaveLoaded(node) {
  if (!node) return false;
  return Boolean(node.querySelector(
    'ytd-comments-header-renderer, ytd-comment-thread-renderer, ytd-message-renderer, #header #count'
  ));
}

function findNativeComments(watch) {
  if (!watch) return null;
  const candidates = [...watch.querySelectorAll(SELECTORS.comments)];
  return candidates.find((node) => !node.closest(`#${SCRIPT_ID}-root`) && node.closest(SELECTORS.primary)) || null;
}

function attachComments(generation) {
  if (generation !== state.generation || !state.root?.isConnected) return true;
  if (state.commentsNode) return state.commentsReady;
  const comments = findNativeComments(state.watch);
  if (!comments) return false;

  state.commentsHome = comments.parentNode;
  state.commentsMarker = marker('comments-home');
  comments.parentNode.insertBefore(state.commentsMarker, comments);
  state.commentsPane.appendChild(comments);
  state.commentsNode = comments;
  observeComments();

  requestAnimationFrame(() => {
    if (generation !== state.generation) return;
    state.commentsPane?.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('scroll'));
  });
  return state.commentsReady;
}

function syncReplacedComments() {
  const replacement = findNativeComments(state.watch);
  const current = state.commentsNode;
  if (!replacement && (!current || current.parentNode === state.commentsPane)) return;

  state.commentsObserver?.disconnect();
  clearTimeout(state.commentsCheckTimer);
  state.commentsCheckTimer = 0;
  clearTimeout(state.commentsTimeout);
  clearTimeout(state.unavailableTimer);
  if (replacement !== current && current?.parentNode === state.commentsPane) current.remove();
  state.commentsMarker?.remove();
  state.commentsMarker = null;
  state.commentsHome = null;
  state.commentsNode = null;
  state.commentsReady = false;
  setCommentsStatus('loading');
  waitForComments(state.generation);
}

function waitForComments(generation, startedAt = performance.now()) {
  clearTimeout(state.commentsTimeout);
  if (attachComments(generation) || state.commentsReady) return;
  if (generation !== state.generation || !state.root?.isConnected) return;

  if (performance.now() - startedAt >= LIVE_COMMENTS_GRACE_MS && liveCommentsOff()) {
    showCommentsUnavailable(generation, state.commentsNode);
    return;
  }

  if (performance.now() - startedAt >= COMMENTS_WAIT_MS) {
    setCommentsStatus('error');
    return;
  }

  state.commentsTimeout = window.setTimeout(() => waitForComments(generation, startedAt), 300);
}

function retryComments() {
  if (!state.root) return;
  setCommentsStatus('loading');
  switchTab('comments');

  if (state.commentsNode) {
    state.commentsPane.scrollTop = Math.max(0, state.commentsPane.scrollHeight - state.commentsPane.clientHeight - 1);
    state.commentsPane.dispatchEvent(new Event('scroll'));
    const generation = state.generation;
    requestAnimationFrame(() => {
      if (generation === state.generation && state.commentsPane) state.commentsPane.scrollTop = 0;
    });
  }
  window.dispatchEvent(new Event('scroll'));
  waitForComments(state.generation);
}

function detectSpecialPanel() {
  const inner = state.watch?.querySelector(SELECTORS.secondaryInner);
  if (!inner) return null;

  const chat = inner.querySelector('#chat-container ytd-live-chat-frame:not([collapsed]), ytd-live-chat-frame:not([collapsed])');
  if (chat && chat.getClientRects().length > 0) return 'chat';

  const expandedPanels = [...inner.querySelectorAll(
    'ytd-engagement-panel-section-list-renderer[visibility="ENGAGEMENT_PANEL_VISIBILITY_EXPANDED"]'
  )];
  const systemPanel = expandedPanels.find((panel) => {
    const targetId = panel.getAttribute('target-id') || '';
    return targetId !== 'engagement-panel-comments-section' && panel.getClientRects().length > 0;
  });
  return systemPanel ? 'engagement' : null;
}

function applySuspended() {
  const held = Boolean(state.suspendedBy || state.fullscreenHeld);
  document.documentElement.classList.toggle(`${SCRIPT_ID}-suspended`, held);
  if (state.root && state.root.dataset.suspended !== String(held)) state.root.dataset.suspended = String(held);
}

function syncSpecialPanel() {
  if (!state.root || state.fullscreenHeld) return;
  const special = detectSpecialPanel();

  if (special && !state.suspendedBy) {
    state.tabBeforeSpecialPanel = state.activeTab;
    saveActiveScrollTop();
    state.suspendedBy = special;
    applySuspended();
    return;
  }

  if (!special && state.suspendedBy) {
    const previous = state.suspendedBy;
    state.suspendedBy = null;
    applySuspended();
    const chatTab = state.activeTab === 'related' ? 'related' : 'comments';
    switchTab(previous === 'chat' ? chatTab : state.tabBeforeSpecialPanel, { keepSaved: true });
    return;
  }

  if (special && special !== state.suspendedBy) state.suspendedBy = special;
  applySuspended();
}

function holdForFullscreen() {
  if (!state.root || state.fullscreenHeld) return;
  saveActiveScrollTop();
  state.fullscreenHeld = true;
  applySuspended();
}

function releaseFullscreenHold() {
  const heldBySpecialPanel = Boolean(state.suspendedBy);
  state.fullscreenHeld = false;
  syncSpecialPanel();
  if (!heldBySpecialPanel && !state.suspendedBy) switchTab(state.activeTab, { keepSaved: true });
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
      if (generation === state.generation) syncSpecialPanel();
    });
  });
  state.specialObserver.observe(inner, {
    attributes: true,
    attributeFilter: ['visibility', 'hidden', 'collapsed'],
    childList: true,
    subtree: true,
  });
  syncSpecialPanel();
}

function findNativeRelated(watch) {
  const secondaryInner = watch?.querySelector(SELECTORS.secondaryInner);
  if (!secondaryInner) return null;
  return [...secondaryInner.children].find((child) => (
    child.id === 'related' || child.matches('ytd-watch-next-secondary-results-renderer#related')
  )) || null;
}

function syncReplacedRelated() {
  if (!state.root?.isConnected || !state.relatedPane) return;
  const replacement = findNativeRelated(state.watch);
  if (!replacement) return;

  const savedScrollTop = state.activeTab === 'related' && isPaneShown(state.relatedPane)
    ? state.relatedPane.scrollTop
    : state.scrollTop.related;

  if (state.relatedNode !== replacement && state.relatedNode?.parentElement === state.relatedPane) {
    state.relatedNode.remove();
  }

  state.relatedPane.appendChild(replacement);
  state.relatedNode = replacement;
  state.scrollTop.related = savedScrollTop;

  const generation = state.generation;
  requestAnimationFrame(() => {
    if (generation === state.generation && state.activeTab === 'related' && state.relatedPane) {
      state.relatedPane.scrollTop = savedScrollTop;
    }
  });
}

function mount(watch) {
  if (state.root?.isConnected) return;

  const secondaryInner = watch.querySelector(SELECTORS.secondaryInner);
  const related = findNativeRelated(watch);
  if (!secondaryInner || !related) return;

  state.generation += 1;
  const generation = state.generation;
  state.watch = watch;
  state.videoId = readVideoId();
  const initialTab = state.lastTab?.videoId === state.videoId ? state.lastTab.tab : 'comments';
  state.lastTab = null;
  state.activeTab = initialTab;
  state.scrollTop = { comments: 0, related: 0 };
  state.commentsReady = false;
  state.suspendedBy = null;
  state.fullscreenHeld = false;
  state.tabBeforeSpecialPanel = 'comments';

  const root = buildRoot();
  state.relatedMarker = marker('related-home');
  related.parentNode.insertBefore(state.relatedMarker, related);
  related.parentNode.insertBefore(root, related);
  state.relatedPane.appendChild(related);
  state.relatedNode = related;

  document.documentElement.classList.add(`${SCRIPT_ID}-active`);
  switchTab(initialTab, { reset: true });
  observeSpecialPanels();
  waitForComments(generation);
}

function restoreNode(node, homeMarker, kind, beforeNode = null) {
  const watch = state.watch;
  if (!node || !watch?.isConnected || watch.getAttribute('video-id') !== state.videoId) {
    homeMarker?.remove();
    return;
  }
  const native = kind === 'comments' ? findNativeComments(watch) : findNativeRelated(watch);
  if (native) {
    homeMarker?.remove();
    return;
  }
  if (kind === 'related' && node.parentNode !== state.relatedPane) {
    if (node.isConnected && watch.contains(node) && !state.root?.contains(node)) {
      homeMarker?.remove();
      return;
    }
    if (beforeNode?.isConnected && watch.contains(beforeNode) && !state.root?.contains(beforeNode)) {
      beforeNode.before(node);
      homeMarker?.remove();
      return;
    }
  }
  if (homeMarker?.isConnected && watch.contains(homeMarker)) {
    homeMarker.replaceWith(node);
    return;
  }
  const fallback = kind === 'comments'
    ? (state.commentsHome?.isConnected && watch.contains(state.commentsHome)
        ? state.commentsHome : watch.querySelector('#primary #below') || watch.querySelector(SELECTORS.primary))
    : watch.querySelector(SELECTORS.secondaryInner);
  fallback?.appendChild(node);
  homeMarker?.remove();
}

function teardown() {
  clearTimeout(state.mountTimeout);
  clearTimeout(state.unavailableTimer);
  clearTimeout(state.commentsTimeout);
  clearTimeout(state.commentsCheckTimer);
  state.commentsCheckTimer = 0;
  clearTimeout(state.retryTimer);
  state.specialObserver?.disconnect();
  state.commentsObserver?.disconnect();
  state.specialObserver = null;
  state.commentsObserver = null;

  if (state.root && state.videoId) state.lastTab = { videoId: state.videoId, tab: state.activeTab };
  saveActiveScrollTop();
  const relatedBeforeComments = state.relatedNode && state.relatedNode.nextElementSibling === state.commentsNode
    ? state.commentsNode : null;
  restoreNode(state.commentsNode, state.commentsMarker, 'comments');
  restoreNode(state.relatedNode, state.relatedMarker, 'related', relatedBeforeComments);
  state.root?.remove();
  document.documentElement.classList.remove(`${SCRIPT_ID}-active`, `${SCRIPT_ID}-suspended`);

  state.generation += 1;
  state.root = null;
  state.commentsPane = null;
  state.relatedPane = null;
  state.commentsNode = null;
  state.relatedNode = null;
  state.commentsMarker = null;
  state.commentsHome = null;
  state.relatedMarker = null;
  state.commentsReady = false;
  state.videoId = null;
  state.watch = null;
  state.suspendedBy = null;
  state.fullscreenHeld = false;
}

function evaluate() {
  addStyles();
  const watch = currentWatch();
  refreshLabels();

  const nextVideoId = readVideoId();
  const wrongGeneration = state.root && (
    state.watch !== watch ||
    state.videoId !== nextVideoId ||
    !watchMatchesUrl(watch)
  );
  const brokenRoot = state.root && (
    !state.root.isConnected ||
    state.root.parentNode !== watch?.querySelector(SELECTORS.secondaryInner) ||
    !state.root.contains(state.commentsPane) || !state.root.contains(state.relatedPane)
  );
  const eligible = isEligible(watch);
  const holdFullscreen = Boolean(state.root && !wrongGeneration && !brokenRoot && isFullscreen(watch));
  if (holdFullscreen) holdForFullscreen();
  else if (wrongGeneration || brokenRoot || (state.root && !eligible)) teardown();

  if (!state.root && eligible) mount(watch);
  if (state.root) {
    if (state.fullscreenHeld && !holdFullscreen) releaseFullscreenHold();
    syncReplacedComments();
    syncReplacedRelated();
    syncSpecialPanel();
    syncScrollbarInsets();
  }
}

function isInsideAdoptedContent(node) {
  return Boolean(state.commentsNode?.contains(node) || state.relatedNode?.contains(node));
}

const isIrrelevantTarget = (node) => !node.isConnected || isInsideAdoptedContent(node) || Boolean(node.closest?.('#movie_player, ytd-player'));

const isIdleOffWatch = () => !state.root && location.pathname !== '/watch';

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
  teardown();
  state.lastTab = null;
  scheduleEvaluation(150);
}

function onFullscreenChange() {
  if (document.fullscreenElement && state.root && state.videoId === readVideoId()) holdForFullscreen();
  scheduleEvaluation(0);
}

function onUrlChanged() {
  const nextVideoId = readVideoId();
  if (state.root && state.videoId !== nextVideoId) teardown();
  scheduleEvaluation(0);
}

function boot() {
  if (location.hostname !== 'www.youtube.com') return;
  addStyles();
  state.appObserver = new MutationObserver((records) => {
    retargetObserver();
    if (isIdleOffWatch()) return;
    if (!onlyIrrelevantChanges(records)) scheduleEvaluation();
  });
  state.observerTarget = document.documentElement;
  state.appObserver.observe(document.documentElement, { childList: true, subtree: true });

  document.addEventListener('yt-navigate-start', onNavigateStart, true);
  document.addEventListener('yt-navigate-finish', () => scheduleEvaluation(0), true);
  document.addEventListener('yt-page-data-updated', () => scheduleEvaluation(0), true);
  window.addEventListener('fullscreenchange', onFullscreenChange, true);
  window.addEventListener('popstate', onUrlChanged, true);
  window.addEventListener('urlchange', onUrlChanged, true);
  window.addEventListener('resize', () => scheduleEvaluation(180), { passive: true });
  document.addEventListener('DOMContentLoaded', () => {
    retargetObserver();
    scheduleEvaluation(0);
  }, { once: true });

  scheduleEvaluation(0);
}


export default {
  id: 'right-rail-comments',
  start: boot,
};
