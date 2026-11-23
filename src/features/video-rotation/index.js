import {
  currentVideoId,
  findPlayer,
  findWatch,
  isAdShowing,
  isDesktopSite,
  isEmbedShortsOrChatPage,
  isStopped,
  isVideoPage,
  playerContaining,
  playerFollowsVideo,
  playerOfMediaEvent,
  requestLayout,
  setVideoKeywords,
  videoAspectRatio,
  videoContentRect,
  videoKeywords,
} from '../../core/youtube.js';
import { PREFIX, addRotationStyles } from './styles.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const LABEL = '영상 회전';
const BUTTON_CLASS = `${PREFIX}-button`;
const ANGLES = [90, 180, 270];
const STRETCH = 'yt:stretch=';
const BOX_PROPERTIES = ['left', 'top', 'width', 'height'];
const TOOLTIP_GAP = 11;

const rotation = {
  angle: 0,
  videoId: null,
  originalRatio: NaN,
  originalKeywords: [],
  stretched: false,
  cleanupPending: false,
  ad: false,
  player: null,
  playerObserver: null,
  video: null,
  videoObserver: null,
  controls: null,
  controlsObserver: null,
  boxFrame: 0,
  relayoutFrame: 0,
  relayoutPending: false,
  tooltip: null,
};

function isQuarterTurn() {
  return rotation.angle % 180 === 90;
}

function playerShowsCurrentVideo(player) {
  return playerFollowsVideo(player, rotation.videoId);
}

function keywordsWithStretch(value) {
  const original = rotation.originalKeywords;
  const rest = original.filter(keyword => !keyword.startsWith(STRETCH));
  const own = original.find(keyword => keyword.startsWith(STRETCH));
  return [...rest, value === null ? own || STRETCH : `${STRETCH}${value}`].join(',');
}

function nearlyEqual(a, b) {
  return Math.abs(a - b) <= Math.max(a, b) * 1e-6;
}

function createIcon() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('height', '24');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '24');
  const stroke = {
    stroke: 'white',
    'stroke-width': '2',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  };
  const shapes = [
    ['rect', { x: '3.2', y: '7', width: '10.5', height: '13', rx: '1.5' }],
    ['path', { d: 'M13.2 2.5A7.5 7.5 0 0 1 20.7 10' }],
    ['path', { d: 'M18.4 7.9L20.7 10.2L23 7.9' }],
  ];
  for (const [tag, attributes] of shapes) {
    const shape = document.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries({ ...attributes, ...stroke })) shape.setAttribute(name, value);
    svg.appendChild(shape);
  }
  return svg;
}

function createButton() {
  const button = document.createElement('button');
  button.className = `ytp-button ${BUTTON_CLASS}`;
  button.setAttribute('aria-label', LABEL);
  button.setAttribute('data-tooltip-title', LABEL);
  button.setAttribute('data-title-no-tooltip', LABEL);
  button.appendChild(createIcon());
  button.addEventListener('click', rotateClockwise);
  button.addEventListener('click', hideTooltip);
  button.addEventListener('mouseenter', showTooltip);
  button.addEventListener('focus', showTooltip);
  button.addEventListener('mouseleave', hideTooltip);
  button.addEventListener('blur', hideTooltip);
  return button;
}

function createTooltip() {
  const tooltip = document.createElement('div');
  tooltip.className = `ytp-tooltip ytp-bottom ${PREFIX}-tooltip`;
  tooltip.setAttribute('aria-hidden', 'true');
  const wrapper = document.createElement('div');
  wrapper.className = 'ytp-tooltip-text-wrapper';
  wrapper.setAttribute('aria-hidden', 'true');
  const bottom = document.createElement('div');
  bottom.className = 'ytp-tooltip-bottom-text';
  const text = document.createElement('span');
  text.className = 'ytp-tooltip-text';
  text.textContent = LABEL;
  bottom.appendChild(text);
  wrapper.appendChild(bottom);
  tooltip.appendChild(wrapper);
  return tooltip;
}

function showTooltip(event) {
  const button = event.currentTarget;
  const player = playerContaining(button);
  if (!player || button.disabled) return;
  if (!rotation.tooltip) rotation.tooltip = createTooltip();
  const tooltip = rotation.tooltip;
  if (tooltip.parentElement !== player) player.appendChild(tooltip);
  const playerRect = player.getBoundingClientRect();
  const buttonRect = button.getBoundingClientRect();
  const chrome = player.querySelector('.ytp-chrome-bottom');
  const anchorTop = chrome ? chrome.getBoundingClientRect().top : buttonRect.top;
  const width = tooltip.offsetWidth;
  const centered = buttonRect.left - playerRect.left + buttonRect.width / 2 - width / 2;
  tooltip.style.left = `${Math.min(Math.max(centered, 12), playerRect.width - width - 12)}px`;
  tooltip.style.top = `${Math.round(anchorTop - playerRect.top - TOOLTIP_GAP - tooltip.offsetHeight)}px`;
  tooltip.removeAttribute('aria-hidden');
}

function hideTooltip() {
  rotation.tooltip?.setAttribute('aria-hidden', 'true');
}

function ensureButton(player) {
  const settings = player.querySelector('.ytp-right-controls-left .ytp-settings-button') ||
    player.querySelector('.ytp-right-controls .ytp-settings-button');
  if (!settings) {
    observeControls(player.querySelector('.ytp-chrome-bottom') || player);
    return;
  }
  const buttons = [...document.querySelectorAll(`.${BUTTON_CLASS}`)];
  const button = buttons.find(node => player.contains(node)) || createButton();
  for (const extra of buttons) if (extra !== button) extra.remove();
  if (button.nextElementSibling !== settings) settings.before(button);
  button.disabled = rotation.ad;
  observeControls(settings.closest('.ytp-right-controls') || settings.parentElement);
}

function observeControls(controls) {
  if (rotation.controls === controls) return;
  rotation.controlsObserver?.disconnect();
  rotation.controls = controls;
  rotation.controlsObserver = new MutationObserver(() => {
    const player = findPlayer();
    if (player && isVideoPage()) ensureButton(player);
  });
  rotation.controlsObserver.observe(controls, { childList: true, subtree: true });
}

function observePlayer(player) {
  if (rotation.player === player) return;
  rotation.playerObserver?.disconnect();
  rotation.player = player;
  rotation.playerObserver = new MutationObserver(() => {
    if (isAdShowing(player) !== rotation.ad) syncRotation();
    else endViewingWhenPlayerClosed();
  });
  rotation.playerObserver.observe(player, { attributes: true, attributeFilter: ['class'] });
}

function observeVideo(player) {
  const video = player.querySelector('video.html5-main-video') || player.querySelector('video');
  if (video === rotation.video) return;
  rotation.videoObserver?.disconnect();
  rotation.video = video;
  rotation.videoObserver = null;
  if (!video) return;
  rotation.videoObserver = new MutationObserver(scheduleBoxUpdate);
  rotation.videoObserver.observe(video, { attributes: true, attributeFilter: ['style'] });
}

function updateBox(player) {
  if (!isQuarterTurn()) return;
  const rect = videoContentRect(player);
  if (!rect) return;
  const box = {
    left: Math.round(rect.left) + (rect.width - rect.height) / 2,
    top: Math.round(rect.top) + (rect.height - rect.width) / 2,
    width: rect.height,
    height: rect.width,
  };
  for (const name of BOX_PROPERTIES) {
    const property = `--${PREFIX}-${name}`;
    const value = `${box[name]}px`;
    if (player.style.getPropertyValue(property) !== value) player.style.setProperty(property, value);
  }
}

function scheduleBoxUpdate() {
  if (rotation.boxFrame || !rotation.angle) return;
  rotation.boxFrame = requestAnimationFrame(() => {
    rotation.boxFrame = 0;
    const player = findPlayer();
    if (player) updateBox(player);
  });
}

function syncWatchRatio(player) {
  const watch = findWatch(player);
  const ratio = videoAspectRatio(player);
  if (!watch || !Number.isFinite(ratio) || !('videoHeightToWidthRatio_' in watch)) return;
  const heightToWidth = 1 / ratio;
  if (!nearlyEqual(Number(watch.videoHeightToWidthRatio_), heightToWidth)) watch.videoHeightToWidthRatio_ = heightToWidth;
}

function scheduleRelayout(followPlayer = true) {
  if (followPlayer) rotation.relayoutPending = true;
  cancelAnimationFrame(rotation.relayoutFrame);
  rotation.relayoutFrame = requestAnimationFrame(() => {
    rotation.relayoutFrame = 0;
    const player = findPlayer();
    if (!player) return;
    if (rotation.relayoutPending && !isAdShowing(player)) {
      syncWatchRatio(player);
      rotation.relayoutPending = false;
    }
    requestLayout();
    updateBox(player);
  });
}

function reportAspect(player) {
  if (isQuarterTurn()) {
    const target = 1 / rotation.originalRatio;
    if (rotation.stretched && nearlyEqual(videoAspectRatio(player), target)) return;
    if (!setVideoKeywords(player, keywordsWithStretch(`1:${rotation.originalRatio}`))) return;
    rotation.stretched = true;
    scheduleRelayout();
    return;
  }
  if (!rotation.stretched) return;
  if (!setVideoKeywords(player, keywordsWithStretch(null))) return;
  rotation.stretched = false;
  scheduleRelayout();
}

function applyRotation(player) {
  const active = rotation.angle !== 0 && !rotation.ad;
  if (!rotation.ad && playerShowsCurrentVideo(player)) reportAspect(player);
  if (active) updateBox(player);
  if (active && isQuarterTurn()) player.style.setProperty(`--${PREFIX}-preview-scale`, String(1 / rotation.originalRatio));
  for (const angle of ANGLES) player.classList.toggle(`${PREFIX}-${angle}`, active && rotation.angle === angle);
}

function resetForVideo(videoId) {
  const wasStretched = rotation.stretched;
  rotation.videoId = videoId;
  rotation.angle = 0;
  rotation.originalRatio = NaN;
  rotation.originalKeywords = [];
  rotation.stretched = false;
  if (wasStretched) rotation.cleanupPending = true;
}

function clearLeftoverStretch(player) {
  if (!rotation.cleanupPending) return;
  if (rotation.ad || !playerShowsCurrentVideo(player)) {
    scheduleRelayout(false);
    return;
  }
  rotation.originalKeywords = videoKeywords(player);
  if (setVideoKeywords(player, keywordsWithStretch(null))) {
    rotation.cleanupPending = false;
    scheduleRelayout();
  }
  rotation.originalKeywords = [];
}

function syncRotation() {
  if (!isDesktopSite()) return;
  const player = findPlayer();
  if (!player || (!isVideoPage() && rotation.player !== player)) return;
  addRotationStyles();
  observePlayer(player);
  observeVideo(player);
  const ad = isAdShowing(player);
  const adStarted = ad && !rotation.ad;
  const adEnded = !ad && rotation.ad;
  rotation.ad = ad;
  if (isVideoPage()) ensureButton(player);
  const button = player.querySelector(`.${BUTTON_CLASS}`);
  if (button) button.disabled = rotation.ad;
  if (rotation.ad) hideTooltip();
  const videoId = currentVideoId(player);
  if (videoId && videoId !== rotation.videoId) resetForVideo(videoId);
  if (adStarted && rotation.stretched) scheduleRelayout(false);
  if (adEnded && (rotation.relayoutPending || rotation.angle !== 0)) scheduleRelayout();
  clearLeftoverStretch(player);
  applyRotation(player);
}

function isPlayerShown(player) {
  const rect = player.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function endViewingWhenPlayerClosed() {
  const player = rotation.player;
  if (isVideoPage() || !player || isPlayerShown(player) || !isStopped(player)) return;
  if (rotation.angle === 0 && !rotation.stretched) return;
  resetForVideo(null);
  applyRotation(player);
}

function rotateClockwise() {
  const player = findPlayer();
  if (!player) return;
  syncRotation();
  if (rotation.ad || !rotation.videoId || rotation.cleanupPending || !playerShowsCurrentVideo(player)) return;
  if (!rotation.stretched && !Number.isFinite(rotation.originalRatio)) {
    rotation.originalRatio = videoAspectRatio(player);
    rotation.originalKeywords = videoKeywords(player);
  }
  if (!Number.isFinite(rotation.originalRatio)) return;
  rotation.angle = (rotation.angle + 90) % 360;
  applyRotation(player);
}

function onMediaEvent(event) {
  if (playerOfMediaEvent(event)) syncRotation();
}

function start() {
  if (!isDesktopSite() || isEmbedShortsOrChatPage()) return () => {};
  const controller = new AbortController();
  const capture = { capture: true, signal: controller.signal };
  for (const type of ['loadstart', 'loadedmetadata', 'playing']) document.addEventListener(type, onMediaEvent, capture);
  document.addEventListener('yt-navigate-start', endViewingWhenPlayerClosed, capture);
  document.addEventListener('yt-navigate-finish', syncRotation, capture);
  document.addEventListener('yt-player-updated', syncRotation, capture);
  document.addEventListener('yt-page-data-updated', syncRotation, capture);
  window.addEventListener('resize', scheduleBoxUpdate, { passive: true, signal: controller.signal });
  document.addEventListener('fullscreenchange', scheduleBoxUpdate, capture);
  syncRotation();
  return () => {
    controller.abort();
    rotation.controlsObserver?.disconnect();
    rotation.playerObserver?.disconnect();
    rotation.videoObserver?.disconnect();
  };
}

export default { id: 'video-rotation', start };
