import { availableQualities, currentVideoId, findPlayer, isAdShowing, isPlaying, playerFollowsVideo, playerOfMediaEvent, setPlaybackQuality } from '../../core/youtube.js';

const QUALITY_HEIGHT = {
  highres: 4320,
  hd2160: 2160,
  hd1440: 1440,
  hd1080: 1080,
  hd720: 720,
  large: 480,
  medium: 360,
  small: 240,
  tiny: 144,
};

const MAX_HEIGHT = 2160;

const applied = new WeakMap();

function pickBest(entries) {
  let best = null;
  for (const entry of entries) {
    if (!entry || !entry.isPlayable) continue;
    const height = QUALITY_HEIGHT[entry.quality];
    if (!height || height > MAX_HEIGHT) continue;
    const bestHeight = best ? QUALITY_HEIGHT[best.quality] : 0;
    if (height > bestHeight) best = entry;
    else if (height === bestHeight && !best.paygatedQualityDetails && entry.paygatedQualityDetails) best = entry;
  }
  return best;
}

function applyMaxQuality(player) {
  const best = pickBest(availableQualities(player));
  if (!best) return false;
  return setPlaybackQuality(player, best.quality, ...(best.paygatedQualityDetails ? [best.formatId] : []));
}

function handlePlaying(player) {
  if (isAdShowing(player)) return;
  const id = currentVideoId(player);
  if (!id || !playerFollowsVideo(player, id)) return;
  if (id === applied.get(player)) return;
  if (applyMaxQuality(player)) applied.set(player, id);
}

function start() {
  const controller = new AbortController();
  const stop = () => controller.abort();
  document.addEventListener('playing', event => {
    const player = playerOfMediaEvent(event);
    if (player) handlePlaying(player);
  }, { capture: true, signal: controller.signal });

  const existing = findPlayer();
  if (existing && isPlaying(existing)) handlePlaying(existing);
  return stop;
}

export default { id: 'max-quality', frames: true, start };
