import { AD_PLAYER_SELECTORS, NOT_AD_SELECTOR, PLAYER_SELECTOR } from '../../core/youtube.js';

export const PREFIX = 'tubekit-video-rotation';

const STYLE_ID = `${PREFIX}-styles`;
const player = angle => `${PLAYER_SELECTOR}.${PREFIX}-${angle}${NOT_AD_SELECTOR}`;
const video = angle => `${player(angle)}:not(.ended-mode) video.html5-main-video`;
const storyboard = angle => `${player(angle)} .ytp-tooltip-bg[style*="/sb/"]`;

const css = `
  ${video(90)}, ${video(270)} {
    left: var(--${PREFIX}-left) !important;
    top: var(--${PREFIX}-top) !important;
    width: var(--${PREFIX}-width) !important;
    height: var(--${PREFIX}-height) !important;
    transform: none !important;
  }
  ${video(90)} { rotate: 90deg !important; }
  ${video(180)} { rotate: 180deg !important; }
  ${video(270)} { rotate: 270deg !important; }
  ${storyboard(90)} { transform: rotate(90deg) scale(var(--${PREFIX}-preview-scale, 1)) !important; }
  ${storyboard(180)} { transform: rotate(180deg) !important; }
  ${storyboard(270)} { transform: rotate(270deg) scale(var(--${PREFIX}-preview-scale, 1)) !important; }
  ${storyboard(90)}, ${storyboard(270)} {
    box-shadow: 0 0 0 calc(1px / var(--${PREFIX}-preview-scale, 1)) #fff !important;
  }
  ${player(90)} .ytp-tooltip:has(> .ytp-tooltip-bg[style*="/sb/"]),
  ${player(270)} .ytp-tooltip:has(> .ytp-tooltip-bg[style*="/sb/"]) {
    background-color: transparent !important;
  }
  ${AD_PLAYER_SELECTORS.map(selector => `${selector} .${PREFIX}-button`).join(',\n  ')} {
    display: none !important;
  }
  .${PREFIX}-button svg {
    transform: translateX(2px);
  }
`;

export function addRotationStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const parent = document.head || document.documentElement;
  if (!parent) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = css;
  parent.appendChild(style);
}
