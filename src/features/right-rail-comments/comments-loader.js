import { COMMENTS_CHECK_MS, COMMENTS_WAIT_MS, LIVE_COMMENTS_GRACE_MS } from './constants.js';
import {
  COMMENTS_OFF_BY_UPLOADER,
  COMMENTS_OFF_LIVE_LOOK,
  commentsHaveLoaded,
  commentsOffCandidate,
  urlVideoId,
} from '../../core/youtube.js';

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
    if (disposed || !node || videoId !== urlVideoId()) return;
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
      if (disposed || !region.replaced(watch)) return;
      observer?.disconnect();
      window.clearTimeout(checkTimer);
      checkTimer = 0;
      window.clearTimeout(findTimer);
      region.forget();
      emit(LOADING);
      wait();
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
