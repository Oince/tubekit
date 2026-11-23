const PLAYER_SELECTOR = '#movie_player';
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
  try {
    if (typeof player.getAvailableQualityData !== 'function' || typeof player.setPlaybackQualityRange !== 'function') return false;
    const best = pickBest(player.getAvailableQualityData() || []);
    if (!best) return false;
    if (best.paygatedQualityDetails) player.setPlaybackQualityRange(best.quality, best.quality, best.formatId);
    else player.setPlaybackQualityRange(best.quality, best.quality);
    return true;
  } catch {
    return false;
  }
}

function handlePlaying(player) {
  if (player.classList.contains('ad-showing')) return;
  let id;
  try {
    id = player.getVideoData().video_id;
  } catch {
    return;
  }
  if (!id || id === applied.get(player)) return;
  if (applyMaxQuality(player)) applied.set(player, id);
}

function playerOf(event) {
  const target = event.target;
  if (!target || target.tagName !== 'VIDEO' || typeof target.closest !== 'function') return null;
  return target.closest(PLAYER_SELECTOR);
}

function start() {
  const controller = new AbortController();
  const stop = () => controller.abort();
  document.addEventListener('playing', event => {
    const player = playerOf(event);
    if (player) handlePlaying(player);
  }, { capture: true, signal: controller.signal });

  const existing = document.querySelector(PLAYER_SELECTOR);
  if (!existing) return stop;
  try {
    if (existing.getPlayerState() === 1) handlePlaying(existing);
  } catch {
  }
  return stop;
}

export default { id: 'max-quality', frames: true, start };
