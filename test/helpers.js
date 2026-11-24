import { afterEach, vi } from 'vitest';

export const FAKED_TIMERS = ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'];

const NativeMutationObserver = MutationObserver;
const cleanups = [];
const listenerRestorers = [];
const pageRestorers = [];
const observers = new Set();
let listenerRecords = [];
let listenersTracked = false;

class TrackedMutationObserver extends NativeMutationObserver {
  constructor(callback) {
    super(callback);
    this.origin = new Error('MutationObserver created here').stack;
  }

  observe(...args) {
    const result = super.observe(...args);
    observers.add(this);
    return result;
  }

  disconnect() {
    observers.delete(this);
    return super.disconnect();
  }
}

function captureOf(options) {
  return typeof options === 'boolean' ? options : Boolean(options && options.capture);
}

function wrapMethod(target, name, wrap) {
  const own = Object.hasOwn(target, name);
  const original = target[name];
  target[name] = wrap(original);
  return () => {
    target[name] = original;
    if (!own) delete target[name];
  };
}

function callerIsLibrary() {
  const caller = new Error().stack.split('\n')[3] || '';
  return caller.includes('/node_modules/');
}

function trackListeners() {
  listenersTracked = true;
  for (const target of [globalThis, document]) {
    listenerRestorers.push(wrapMethod(target, 'addEventListener', add => function (type, listener, options) {
      if (!callerIsLibrary()) listenerRecords.push({
        target,
        type,
        listener,
        capture: captureOf(options),
        signal: options && typeof options === 'object' ? options.signal : undefined,
        removed: false,
      });
      return add.call(this, type, listener, options);
    }));
    listenerRestorers.push(wrapMethod(target, 'removeEventListener', remove => function (type, listener, options) {
      const capture = captureOf(options);
      for (const record of listenerRecords) {
        if (record.target === target && record.type === type && record.listener === listener && record.capture === capture) record.removed = true;
      }
      return remove.call(this, type, listener, options);
    }));
  }
}

function isLeaked(record) {
  return !record.removed && !(record.signal && record.signal.aborted);
}

function leaks() {
  const found = [];
  for (const record of listenerRecords.filter(isLeaked)) {
    const where = record.target === document ? 'document' : 'window';
    found.push(`${where} '${record.type}' listener`);
  }
  for (const observer of observers) found.push(`MutationObserver still observing\n${observer.origin}`);
  return found;
}

function clearBrowserState() {
  jsdom.cookieJar.removeAllCookiesSync();
  localStorage.clear();
  sessionStorage.clear();
}

function setUrl(url) {
  jsdom.reconfigure({ url });
  history.replaceState(null, '', location.href);
}

function drain(list) {
  const errors = [];
  while (list.length) {
    try {
      list.pop()();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length) throw new AggregateError(errors, 'several cleanups failed');
}

function replaceDocument(html) {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  document.replaceChild(document.adoptNode(parsed.documentElement), document.documentElement);
}

export function onCleanup(fn) {
  cleanups.unshift(fn);
}

export function stopAll() {
  drain(cleanups);
}

function restorePage() {
  vi.restoreAllMocks();
  drain(pageRestorers);
}

export function stubProperty(target, name, descriptor) {
  const own = Object.getOwnPropertyDescriptor(target, name);
  Object.defineProperty(target, name, { configurable: true, ...descriptor });
  pageRestorers.push(() => {
    if (own) Object.defineProperty(target, name, own);
    else delete target[name];
  });
}

export function loadPage({
  url = 'https://www.youtube.com/watch?v=A',
  html = '<html><head></head><body></body></html>',
  body,
  innerWidth = 1024,
  innerHeight = 768,
  clientRects = false,
  frame = false,
  timers = FAKED_TIMERS,
} = {}) {
  stopAll();
  restorePage();
  vi.useRealTimers();
  vi.useFakeTimers({ toFake: timers });
  if (MutationObserver !== TrackedMutationObserver) vi.stubGlobal('MutationObserver', TrackedMutationObserver);
  if (!listenersTracked) trackListeners();
  setUrl(url);
  replaceDocument(body === undefined ? html : `<html><head></head><body>${body}</body></html>`);
  clearBrowserState();
  window.innerWidth = innerWidth;
  window.innerHeight = innerHeight;
  if (clientRects) {
    const list = typeof clientRects === 'function' ? clientRects : () => [{}];
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function () { return list(this); });
  }
  if (frame) vi.spyOn(globalThis, 'top', 'get').mockReturnValue({});
  return document;
}

function runStart(start) {
  if (!listenersTracked) trackListeners();
  const stop = start();
  if (typeof stop !== 'function') throw new Error('start() must return a cleanup function');
  cleanups.push(stop);
  return stop;
}

export async function startFeature(id) {
  vi.resetModules();
  const feature = (await import(`../src/features/${id}/index.js`)).default;
  const stop = runStart(() => feature.start());
  return { feature, stop };
}

export async function startMain() {
  vi.resetModules();
  const features = (await import('../src/features/index.js')).default;
  const started = [];
  for (const feature of features) {
    const start = feature.start;
    feature.start = () => {
      started.push(feature.id);
      return runStart(start);
    };
  }
  await import('../src/main.js');
  return { features, started };
}

export function advance(ms = 0) {
  return vi.advanceTimersByTimeAsync(ms);
}

export function fire(type, target = document.querySelector('video')) {
  const event = new Event(type);
  target.dispatchEvent(event);
  return event;
}

const STRETCH_PATTERN = /(?:^|,)yt:stretch=([0-9.]*):?([0-9.]*)(?:,|$)/;

export function fakePlayer(element = document.querySelector('#movie_player'), {
  videoId = 'A',
  responseId,
  aspect = 16 / 9,
  keywords = ['blender', 'short'],
  quality = [],
  playerState = 1,
  contentRect = { left: 0, top: 0, width: 441, height: 784 },
  watch = element.closest('ytd-watch-flexy') || document.querySelector('ytd-watch-flexy'),
} = {}) {
  const player = {
    element,
    videoId,
    responseId,
    mediaAspect: aspect,
    aspect,
    keywords,
    quality,
    playerState,
    contentRect,
    qualityCalls: [],
    updates: [],
    resizes: 0,
  };
  if (watch) watch.videoHeightToWidthRatio_ = 1 / aspect;
  element.getVideoData = () => ({ video_id: player.videoId });
  element.getPlayerState = () => player.playerState;
  element.getAvailableQualityData = () => player.quality;
  element.setPlaybackQualityRange = (...args) => { player.qualityCalls.push(args); };
  element.getVideoAspectRatio = () => player.aspect;
  element.getPlayerResponse = () => ({ videoDetails: { videoId: player.responseId, keywords: player.keywords } });
  element.getVideoContentRect = () => player.contentRect;
  element.updateVideoData = data => {
    player.updates.push(data.keywords);
    const match = STRETCH_PATTERN.exec(data.keywords || '');
    const ratio = match && match[1] && match[2] ? Number(match[1]) / Number(match[2]) : NaN;
    player.aspect = Number.isFinite(ratio) ? ratio : player.mediaAspect;
  };
  const controller = new AbortController();
  window.addEventListener('resize', () => { player.resizes += 1; }, { signal: controller.signal });
  cleanups.unshift(() => controller.abort());
  return player;
}

afterEach(() => {
  try {
    stopAll();
    vi.clearAllTimers();
    const found = leaks();
    if (found.length) throw new Error(`cleanup left these behind:\n${found.join('\n')}`);
  } finally {
    vi.clearAllTimers();
    for (const observer of observers) NativeMutationObserver.prototype.disconnect.call(observer);
    observers.clear();
    const leaked = listenerRecords.filter(isLeaked);
    listenerRecords = [];
    while (listenerRestorers.length) listenerRestorers.pop()();
    listenersTracked = false;
    for (const record of leaked) record.target.removeEventListener(record.type, record.listener, record.capture);
    vi.useRealTimers();
    vi.unstubAllGlobals();
    replaceDocument('<html><head></head><body></body></html>');
    setUrl('https://www.youtube.com/');
    clearBrowserState();
    restorePage();
  }
});
