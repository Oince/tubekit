import { SCRIPT_ID, SELECTORS } from './constants.js';
import { findNativeComments, findNativeRelated } from '../../core/youtube.js';

export function createBorrowedRegion({ pane, root, find, markerName, fallbackHome, yieldsToYouTubeMoves = false }) {
  let node = null;
  let marker = null;
  let home = null;

  const isOutsidePanel = (target) => Boolean(target?.isConnected) && !root.contains(target);

  function forgetMemory() {
    node = null;
    marker = null;
    home = null;
  }

  return {
    pane,

    get node() {
      return node;
    },

    contains(target) {
      return Boolean(node && target && node.contains(target));
    },

    take(watch, beforeMove) {
      const found = find(watch);
      if (!found) return null;
      if (node && node !== found && node.parentNode === pane) node.remove();
      if (!marker) {
        home = found.parentNode;
        marker = document.createComment(`${SCRIPT_ID}:${markerName}`);
        found.parentNode.insertBefore(marker, found);
      }
      beforeMove?.(found);
      pane.appendChild(found);
      node = found;
      return found;
    },

    replaced(watch) {
      const replacement = find(watch);
      return Boolean(replacement) || Boolean(node && node.parentNode !== pane);
    },

    forget() {
      if (node?.parentNode === pane) node.remove();
      marker?.remove();
      forgetMemory();
    },

    restore(watch, { videoId, before = null }) {
      const held = node;
      const homeMarker = marker;
      const homeParent = home;
      forgetMemory();

      if (!held || !watch?.isConnected || watch.getAttribute('video-id') !== videoId) {
        homeMarker?.remove();
        return;
      }
      if (find(watch)) {
        homeMarker?.remove();
        return;
      }
      if (held.parentNode !== pane) {
        if (yieldsToYouTubeMoves && isOutsidePanel(held) && watch.contains(held)) {
          homeMarker?.remove();
          return;
        }
        if (isOutsidePanel(before) && watch.contains(before)) {
          before.before(held);
          homeMarker?.remove();
          return;
        }
      }
      if (homeMarker?.isConnected && watch.contains(homeMarker)) {
        homeMarker.replaceWith(held);
        return;
      }
      fallbackHome(watch, homeParent)?.appendChild(held);
      homeMarker?.remove();
    },
  };
}

export function createCommentsRegion(pane, root) {
  return createBorrowedRegion({
    pane,
    root,
    find: (watch) => findNativeComments(watch, `#${SCRIPT_ID}-root`),
    markerName: 'comments-home',
    fallbackHome: (watch, home) => (
      home?.isConnected && watch.contains(home)
        ? home
        : watch.querySelector('#primary #below') || watch.querySelector(SELECTORS.primary)
    ),
  });
}

export function createRelatedRegion(pane, root) {
  return createBorrowedRegion({
    pane,
    root,
    find: findNativeRelated,
    markerName: 'related-home',
    fallbackHome: (watch) => watch.querySelector(SELECTORS.secondaryInner),
    yieldsToYouTubeMoves: true,
  });
}
