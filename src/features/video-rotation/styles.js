export const PREFIX = 'tubekit-video-rotation';

const STYLE_ID = `${PREFIX}-styles`;
const PLAYING = ':not(.ad-showing):not(.ad-interrupting)';
const player = angle => `#movie_player.${PREFIX}-${angle}${PLAYING}`;
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
  #movie_player.ad-showing .${PREFIX}-button,
  #movie_player.ad-interrupting .${PREFIX}-button {
    display: none !important;
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
