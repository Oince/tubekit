import {
  COMMENTS_OFF_BY_UPLOADER,
  COMMENTS_OFF_LIVE_LOOK,
  commentsHaveLoaded,
  commentsOffCandidate,
  urlVideoId,
} from '../../core/youtube.js';

const COMMENTS_WAIT_MS = 20_000;
const LIVE_COMMENTS_GRACE_MS = 3_000;
const COMMENTS_CHECK_MS = 250;

export const LOADING = 'loading';
export const LOADED = 'loaded';
export const OFF = 'off';
export const FAILED = 'failed';

export function createCommentsLoader({ region, watch, videoId, onChange }) {
  let state = LOADING;
  let disposed = false;
  let observer = null;
  let findTimer = 0;
  let checkTimer = 0;
  let uploaderOff = false;
  let paused = false;
  let replacedAway = false;
  const frames = new Set();

  const isDecided = () => state === LOADED || state === OFF;

  function emit(next) {
    state = next;
    onChange(next);
  }

  function settle(next) {
    window.clearTimeout(findTimer);
    if (state !== next) emit(next);
  }

  function nextFrame(callback) {
    const frame = requestAnimationFrame(() => {
      frames.delete(frame);
      if (!disposed) callback();
    });
    frames.add(frame);
  }

  function check() {
    const node = region.node;
    if (disposed || !node) return;
    if (videoId !== urlVideoId()) {
      paused = true;
      return;
    }
    paused = false;
    if (commentsOffCandidate(node, watch) === COMMENTS_OFF_BY_UPLOADER) {
      if (!uploaderOff) {
        uploaderOff = true;
        window.clearTimeout(findTimer);
        emit(OFF);
      } else {
        settle(OFF);
      }
      return;
    }
    uploaderOff = false;
    if (commentsHaveLoaded(node) || state === OFF) settle(LOADED);
  }

  function observe() {
    observer?.disconnect();
    window.clearTimeout(checkTimer);
    checkTimer = 0;
    uploaderOff = false;
    const node = region.node;
    if (!node) return;

    observer = new MutationObserver(() => {
      if (checkTimer) return;
      checkTimer = window.setTimeout(() => {
        checkTimer = 0;
        check();
      }, COMMENTS_CHECK_MS);
    });
    observer.observe(node, { childList: true, subtree: true });
    check();
  }

  function stopWatching() {
    observer?.disconnect();
    window.clearTimeout(checkTimer);
    checkTimer = 0;
    window.clearTimeout(findTimer);
  }

  function reload() {
    paused = false;
    replacedAway = false;
    stopWatching();
    region.forget();
    emit(LOADING);
    wait();
  }

  function adoptWhileAway() {
    paused = true;
    replacedAway = true;
    stopWatching();
    region.forget();
    if (region.take(watch)) observe();
    else wait();
  }

  function adopt() {
    if (disposed || !region.pane.isConnected) return true;
    if (region.node) return isDecided();
    if (!region.take(watch)) return false;
    observe();
    nextFrame(() => {
      region.pane.dispatchEvent(new Event('scroll'));
      window.dispatchEvent(new Event('scroll'));
    });
    return isDecided();
  }

  function wait(startedAt = performance.now()) {
    window.clearTimeout(findTimer);
    if (adopt() || isDecided()) return;
    if (disposed || !region.pane.isConnected) return;
    if (videoId !== urlVideoId()) {
      findTimer = window.setTimeout(() => wait(), COMMENTS_CHECK_MS);
      return;
    }
    if (paused) {
      check();
      if (isDecided()) return;
    }

    const elapsed = performance.now() - startedAt;
    if (elapsed >= LIVE_COMMENTS_GRACE_MS && commentsOffCandidate(region.node, watch) === COMMENTS_OFF_LIVE_LOOK) {
      settle(OFF);
      return;
    }
    if (elapsed >= COMMENTS_WAIT_MS) {
      emit(FAILED);
      return;
    }
    findTimer = window.setTimeout(() => wait(startedAt), COMMENTS_CHECK_MS);
  }

  return {
    get state() {
      return state;
    },

    start() {
      wait();
    },

    retry() {
      if (disposed || state !== FAILED) return;
      emit(LOADING);
      if (region.node) {
        const pane = region.pane;
        pane.scrollTop = Math.max(0, pane.scrollHeight - pane.clientHeight - 1);
        pane.dispatchEvent(new Event('scroll'));
        nextFrame(() => {
          pane.scrollTop = 0;
        });
      }
      window.dispatchEvent(new Event('scroll'));
      wait();
    },

    refresh() {
      if (disposed) return;
      const away = videoId !== urlVideoId();
      if (region.replaced(watch)) {
        if (away) adoptWhileAway();
        else reload();
        return;
      }
      if (away || !paused) return;
      if (!region.node) {
        reload();
      } else if (replacedAway) {
        paused = false;
        replacedAway = false;
        stopWatching();
        emit(LOADING);
        observe();
        wait();
      } else {
        paused = false;
        check();
      }
    },

    dispose() {
      disposed = true;
      observer?.disconnect();
      observer = null;
      window.clearTimeout(findTimer);
      window.clearTimeout(checkTimer);
      checkTimer = 0;
      frames.forEach((frame) => cancelAnimationFrame(frame));
      frames.clear();
    },
  };
}
