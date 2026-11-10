import { MIN_VIEWPORT_WIDTH, SCRIPT_ID } from './constants.js';

export function addStyles() {
  if (document.getElementById(`${SCRIPT_ID}-styles`)) return;

  const style = document.createElement('style');
  style.id = `${SCRIPT_ID}-styles`;
  style.textContent = `
    html.${SCRIPT_ID}-active:not(.${SCRIPT_ID}-suspended) ytd-watch-flexy #secondary {
      position: sticky !important;
      top: calc(var(--ytd-masthead-height, 56px) + 12px) !important;
      align-self: flex-start !important;
      height: calc(100vh - var(--ytd-masthead-height, 56px) - 24px) !important;
      max-height: calc(100vh - var(--ytd-masthead-height, 56px) - 24px) !important;
      min-height: 280px !important;
      overflow: hidden !important;
    }

    html.${SCRIPT_ID}-active:not(.${SCRIPT_ID}-suspended) ytd-watch-flexy #secondary-inner {
      display: flex !important;
      flex-direction: column !important;
      height: 100% !important;
      max-height: 100% !important;
      min-height: 0 !important;
      overflow: hidden !important;
    }

    html.${SCRIPT_ID}-active:not(.${SCRIPT_ID}-suspended) ytd-watch-flexy #secondary-inner > #related,
    html.${SCRIPT_ID}-active:not(.${SCRIPT_ID}-suspended) ytd-watch-flexy #secondary-inner > ytd-watch-next-secondary-results-renderer#related {
      display: none !important;
    }

    #${SCRIPT_ID}-root {
      --${SCRIPT_ID}-bg: var(--yt-sys-color-baseline--base-background, var(--yt-spec-base-background, #fff));
      --${SCRIPT_ID}-text: var(--yt-sys-color-baseline--text-primary, var(--yt-spec-text-primary, #0f0f0f));
      --${SCRIPT_ID}-text-secondary: var(--yt-sys-color-baseline--text-secondary, var(--yt-spec-text-secondary, #606060));
      --${SCRIPT_ID}-outline: var(--yt-sys-color-baseline--outline, var(--yt-spec-10-percent-layer, rgba(0, 0, 0, .1)));
      --${SCRIPT_ID}-hover: var(--yt-sys-color-baseline--additive-background, var(--yt-spec-10-percent-layer, rgba(0, 0, 0, .05)));
      --${SCRIPT_ID}-selected: var(--yt-sys-color-baseline--button-chip-background-hover, var(--yt-spec-badge-chip-background, rgba(0, 0, 0, .1)));
      --${SCRIPT_ID}-toast-bg: var(--yt-sys-color-baseline--inverted-background, #0f0f0f);
      --${SCRIPT_ID}-toast-text: var(--yt-sys-color-baseline--text-primary-inverse, var(--yt-spec-text-primary-inverse, #fff));
      box-sizing: border-box;
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      min-height: 180px;
      overflow: hidden;
      color: var(--${SCRIPT_ID}-text);
      background: var(--${SCRIPT_ID}-bg);
      border: 1px solid var(--${SCRIPT_ID}-outline);
      border-radius: 12px;
    }

    html[dark] #${SCRIPT_ID}-root {
      color-scheme: dark;
      --${SCRIPT_ID}-bg: var(--yt-sys-color-baseline--base-background, var(--yt-spec-base-background, #0f0f0f));
      --${SCRIPT_ID}-text: var(--yt-sys-color-baseline--text-primary, var(--yt-spec-text-primary, #f1f1f1));
      --${SCRIPT_ID}-text-secondary: var(--yt-sys-color-baseline--text-secondary, var(--yt-spec-text-secondary, #aaa));
      --${SCRIPT_ID}-outline: var(--yt-sys-color-baseline--outline, var(--yt-spec-10-percent-layer, rgba(255, 255, 255, .2)));
      --${SCRIPT_ID}-hover: var(--yt-sys-color-baseline--additive-background, var(--yt-spec-10-percent-layer, rgba(255, 255, 255, .1)));
      --${SCRIPT_ID}-selected: var(--yt-sys-color-baseline--button-chip-background-hover, var(--yt-spec-badge-chip-background, rgba(255, 255, 255, .2)));
      --${SCRIPT_ID}-toast-bg: var(--yt-sys-color-baseline--inverted-background, #f1f1f1);
      --${SCRIPT_ID}-toast-text: var(--yt-sys-color-baseline--text-primary-inverse, var(--yt-spec-text-primary-inverse, #0f0f0f));
    }

    #${SCRIPT_ID}-root[data-suspended='true'] {
      display: none !important;
    }

    #${SCRIPT_ID}-tabs {
      position: relative;
      z-index: 2;
      display: grid;
      grid-template-columns: 1fr 1fr;
      flex: 0 0 auto;
      gap: 4px;
      padding: 8px;
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
      overscroll-behavior: contain;
      scrollbar-gutter: stable;
      contain: content;
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

    #${SCRIPT_ID}-comments-pane > ytd-comments#comments {
      box-sizing: border-box !important;
      width: 100% !important;
      max-width: none !important;
      margin: 0 !important;
      padding: 8px 12px 24px !important;
    }

    #${SCRIPT_ID}-related-pane > #related,
    #${SCRIPT_ID}-related-pane > ytd-watch-next-secondary-results-renderer#related {
      box-sizing: border-box !important;
      display: block !important;
      width: 100% !important;
      max-width: none !important;
      margin: 0 !important;
      padding: 8px 12px 24px !important;
    }

    .${SCRIPT_ID}-status {
      box-sizing: border-box;
      display: grid;
      min-height: 140px;
      place-content: center;
      gap: 12px;
      padding: 24px;
      color: var(--${SCRIPT_ID}-text-secondary);
      font: 400 14px/20px Roboto, Arial, sans-serif;
      text-align: center;
    }

    .${SCRIPT_ID}-retry {
      justify-self: center;
      height: 36px;
      padding: 0 16px;
      color: var(--${SCRIPT_ID}-text);
      font: 500 14px/36px Roboto, Arial, sans-serif;
      cursor: pointer;
      background: var(--${SCRIPT_ID}-selected);
      border: 0;
      border-radius: 18px;
    }

    #${SCRIPT_ID}-toast {
      position: absolute;
      z-index: 5;
      right: 12px;
      bottom: 12px;
      left: 12px;
      box-sizing: border-box;
      padding: 12px 14px;
      color: var(--${SCRIPT_ID}-toast-text);
      font: 400 13px/18px Roboto, Arial, sans-serif;
      pointer-events: none;
      background: var(--${SCRIPT_ID}-toast-bg);
      border-radius: 8px;
      opacity: 0;
      transform: translateY(8px);
      transition: opacity .18s ease, transform .18s ease;
    }

    #${SCRIPT_ID}-toast[data-visible='true'] {
      opacity: 1;
      transform: translateY(0);
    }

    @media (max-width: ${MIN_VIEWPORT_WIDTH - 1}px) {
      #${SCRIPT_ID}-root {
        display: none !important;
      }
    }
  `;
  (document.head || document.documentElement).appendChild(style);
}
