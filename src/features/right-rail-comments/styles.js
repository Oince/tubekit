import { SCRIPT_ID } from './constants.js';
import { ACTIVE_CLASS, HELD_STYLES, SHOWN_SCOPE } from './lifecycle.js';
import { FILL_CLASS, PANEL_ATTRIBUTE, YOUTUBE_TABS_ID } from './youtube-panels.js';
import {
  COMMENTS_SELECTOR,
  NOT_TWO_COLUMN_SELECTORS,
  PANEL_CONTAINER_SELECTORS,
  RELATED_SELECTORS,
  SECONDARY_INNER_SELECTOR,
  SECONDARY_SELECTOR,
  TWO_COLUMN_SELECTOR,
} from '../../core/youtube.js';

const TWO_COLUMN_SCOPE = `${SHOWN_SCOPE} ${TWO_COLUMN_SELECTOR}`;
const FILL_SCOPE = `html.${ACTIVE_CLASS}.${FILL_CLASS} ${TWO_COLUMN_SELECTOR}`;
const ROOT_SELECTOR = `#${SCRIPT_ID}-root`;
const TABS_SELECTOR = `#${YOUTUBE_TABS_ID}`;
const INNER_IN_FILL = `${FILL_SCOPE} ${SECONDARY_INNER_SELECTOR}`;
const SHOWN_MARK = `[${PANEL_ATTRIBUTE}='shown']`;
const HIDDEN_MARK = `[${PANEL_ATTRIBUTE}='hidden']`;
const inBothScopes = (selector) => `${TWO_COLUMN_SCOPE} ${selector},\n    ${FILL_SCOPE} ${selector}`;

export function addStyles() {
  if (document.getElementById(`${SCRIPT_ID}-styles`)) return;

  const style = document.createElement('style');
  style.id = `${SCRIPT_ID}-styles`;
  style.textContent = `
    ${inBothScopes(SECONDARY_SELECTOR)} {
      position: sticky !important;
      top: calc(var(--ytd-masthead-height, 56px) + 12px) !important;
      align-self: flex-start !important;
      height: calc(100dvh - var(--ytd-masthead-height, 56px) - 24px) !important;
      max-height: calc(100dvh - var(--ytd-masthead-height, 56px) - 24px) !important;
      min-height: 280px !important;
      margin-top: 12px !important;
      padding-top: 0 !important;
      overflow-x: clip !important;
      overflow-y: clip !important;
    }

    ${inBothScopes(SECONDARY_INNER_SELECTOR)} {
      display: flex !important;
      flex-direction: column !important;
      height: 100% !important;
      max-height: 100% !important;
      min-height: 0 !important;
      overflow-x: clip !important;
      overflow-y: clip !important;
    }

    ${RELATED_SELECTORS.map(selector => `${TWO_COLUMN_SCOPE} ${SECONDARY_INNER_SELECTOR} > ${selector}`).join(',\n    ')} {
      display: none !important;
    }

    #${SCRIPT_ID}-root,
    ${TABS_SELECTOR} {
      --${SCRIPT_ID}-bg: var(--yt-sys-color-baseline--base-background, var(--yt-spec-base-background, #fff));
      --${SCRIPT_ID}-text: var(--yt-sys-color-baseline--text-primary, var(--yt-spec-text-primary, #0f0f0f));
      --${SCRIPT_ID}-text-secondary: var(--yt-sys-color-baseline--text-secondary, var(--yt-spec-text-secondary, #606060));
      --${SCRIPT_ID}-outline: var(--yt-sys-color-baseline--outline, var(--yt-spec-10-percent-layer, rgba(0, 0, 0, .1)));
      --${SCRIPT_ID}-hover: var(--yt-sys-color-baseline--additive-background, var(--yt-spec-10-percent-layer, rgba(0, 0, 0, .05)));
      --${SCRIPT_ID}-selected: var(--yt-sys-color-baseline--button-chip-background-hover, var(--yt-spec-badge-chip-background, rgba(0, 0, 0, .1)));
    }

    #${SCRIPT_ID}-root {
      box-sizing: border-box;
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      min-height: 180px;
      overflow: hidden;
      color: var(--${SCRIPT_ID}-text);
      background: var(--${SCRIPT_ID}-bg);
    }

    html[dark] #${SCRIPT_ID}-root,
    html[dark] ${TABS_SELECTOR} {
      color-scheme: dark;
      --${SCRIPT_ID}-bg: var(--yt-sys-color-baseline--base-background, var(--yt-spec-base-background, #0f0f0f));
      --${SCRIPT_ID}-text: var(--yt-sys-color-baseline--text-primary, var(--yt-spec-text-primary, #f1f1f1));
      --${SCRIPT_ID}-text-secondary: var(--yt-sys-color-baseline--text-secondary, var(--yt-spec-text-secondary, #aaa));
      --${SCRIPT_ID}-outline: var(--yt-sys-color-baseline--outline, var(--yt-spec-10-percent-layer, rgba(255, 255, 255, .2)));
      --${SCRIPT_ID}-hover: var(--yt-sys-color-baseline--additive-background, var(--yt-spec-10-percent-layer, rgba(255, 255, 255, .1)));
      --${SCRIPT_ID}-selected: var(--yt-sys-color-baseline--button-chip-background-hover, var(--yt-spec-badge-chip-background, rgba(255, 255, 255, .2)));
    }

    ${HELD_STYLES}

    #${SCRIPT_ID}-tabs {
      position: relative;
      z-index: 2;
      display: grid;
      grid-template-columns: 1fr 1fr;
      flex: 0 0 auto;
      gap: 4px;
      padding: 0 0 8px;
      margin-right: var(--${SCRIPT_ID}-content-inset, 0px);
      background: var(--${SCRIPT_ID}-bg);
      border-bottom: 1px solid var(--${SCRIPT_ID}-outline);
    }

    .${SCRIPT_ID}-tab {
      box-sizing: border-box;
      min-width: 0;
      height: 38px;
      padding: 0 12px;
      overflow: hidden;
      color: var(--${SCRIPT_ID}-text-secondary);
      font: 500 14px/38px Roboto, Arial, sans-serif;
      text-align: center;
      text-overflow: ellipsis;
      white-space: nowrap;
      cursor: pointer;
      background: transparent;
      border: 0;
      border-radius: 8px;
    }

    .${SCRIPT_ID}-tab:hover {
      background: var(--${SCRIPT_ID}-hover);
    }

    .${SCRIPT_ID}-tab[aria-selected='true'] {
      color: var(--${SCRIPT_ID}-text);
      background: var(--${SCRIPT_ID}-selected);
      font-weight: 600;
    }

    ${TABS_SELECTOR} {
      position: relative;
      z-index: 2;
      display: none;
      flex: 0 0 auto;
      gap: 4px;
      padding: 0 0 8px;
      margin: 0;
      background: var(--${SCRIPT_ID}-bg);
      border-bottom: 1px solid var(--${SCRIPT_ID}-outline);
    }

    ${FILL_SCOPE} ${TABS_SELECTOR} {
      display: flex;
    }

    ${TABS_SELECTOR} .${SCRIPT_ID}-tab {
      flex: 1 1 0;
    }

    ${PANEL_CONTAINER_SELECTORS.map(container => `${INNER_IN_FILL} > ${container}`).join(',\n    ')} {
      display: flex !important;
      flex: 0 0 0 !important;
      flex-direction: column !important;
      min-height: 0 !important;
      height: 0 !important;
      margin: 0 !important;
      overflow: visible !important;
    }

    ${PANEL_CONTAINER_SELECTORS.map(container => `${INNER_IN_FILL} > ${container}:has(${SHOWN_MARK})`).join(',\n    ')} {
      flex: 1 1 0 !important;
      height: auto !important;
    }

    ${INNER_IN_FILL} ${SHOWN_MARK} {
      flex: 1 1 0 !important;
      height: auto !important;
      min-height: 0 !important;
      max-height: none !important;
      margin: 0 !important;
    }

    ${INNER_IN_FILL} ${HIDDEN_MARK} {
      position: absolute !important;
      width: 100% !important;
      height: 0 !important;
      min-height: 0 !important;
      max-height: 0 !important;
      margin: 0 !important;
      overflow: hidden !important;
      pointer-events: none !important;
      visibility: hidden !important;
    }

    #${SCRIPT_ID}-body {
      position: relative;
      flex: 1 1 auto;
      min-height: 0;
      overflow: hidden;
    }

    .${SCRIPT_ID}-pane {
      position: absolute;
      inset: 0;
      box-sizing: border-box;
      display: none;
      overflow-x: hidden;
      overflow-y: auto;
      padding-right: var(--${SCRIPT_ID}-pane-gutter, 0px);
      overscroll-behavior: contain;
      scrollbar-gutter: stable;
    }

    .${SCRIPT_ID}-pane[data-active='true'] {
      display: block;
    }

    #${SCRIPT_ID}-comments-pane ytd-comment-thread-renderer,
    #${SCRIPT_ID}-related-pane ytd-compact-video-renderer,
    #${SCRIPT_ID}-related-pane yt-lockup-view-model {
      content-visibility: auto;
      contain-intrinsic-size: auto 150px;
    }

    #${SCRIPT_ID}-comments-pane ytd-comment-thread-renderer:has(ytd-commentbox[is-emoji-picker-displayed]) {
      content-visibility: visible;
    }

    #${SCRIPT_ID}-comments-pane ytd-commentbox #emojis {
      box-sizing: border-box !important;
      width: auto !important;
      max-width: 100% !important;
      right: 0 !important;
    }

    #${SCRIPT_ID}-comments-pane ytd-commentbox yt-emoji-picker-renderer,
    #${SCRIPT_ID}-comments-pane ytd-commentbox yt-emoji-picker-renderer #categories-wrapper,
    #${SCRIPT_ID}-comments-pane ytd-commentbox yt-emoji-picker-renderer #category-buttons,
    #${SCRIPT_ID}-comments-pane ytd-commentbox yt-emoji-picker-renderer #search-panel {
      box-sizing: border-box !important;
      width: 100% !important;
      max-width: 100% !important;
    }

    #${SCRIPT_ID}-comments-pane > ${COMMENTS_SELECTOR} {
      box-sizing: border-box !important;
      width: 100% !important;
      max-width: none !important;
      margin: 0 !important;
      padding: 8px 0 24px !important;
    }

    ${RELATED_SELECTORS.map(selector => `#${SCRIPT_ID}-related-pane > ${selector}`).join(',\n    ')} {
      box-sizing: border-box !important;
      display: block !important;
      width: 100% !important;
      max-width: none !important;
      margin: 0 !important;
      padding: 8px 0 24px !important;
    }

    ${NOT_TWO_COLUMN_SELECTORS.map(selector => `${selector} ${ROOT_SELECTOR}`).join(',\n    ')} {
      display: none !important;
    }
  `;
  (document.head || document.documentElement).appendChild(style);
}
