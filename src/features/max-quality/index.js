// 가장 높은 화질로 자동 전환한다. 프리미엄(paygated) 포맷이 있으면 그쪽을 우선한다.
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

// 플레이어별로 마지막에 최고 화질을 적용한 영상 id. 같은 영상의 미디어 재로드(화질 변경 등)에는 다시 적용하지 않는다.
const applied = new WeakMap();

function pickBest(entries) {
  let best = null;
  for (const entry of entries) {
    if (!entry || !entry.isPlayable) continue;
    const height = QUALITY_HEIGHT[entry.quality];
    if (!height) continue;
    const bestHeight = best ? QUALITY_HEIGHT[best.quality] : 0;
    if (height > bestHeight) best = entry;
    else if (height === bestHeight && !best.paygatedQualityDetails && entry.paygatedQualityDetails) best = entry;
  }
  return best;
}

// 적용을 시도했으면 true, 쓸 만한 화질 데이터가 없거나 API가 없으면 false.
function applyMaxQuality(player) {
  try {
    if (typeof player.getAvailableQualityData !== 'function' || typeof player.setPlaybackQualityRange !== 'function') return false;
    const best = pickBest(player.getAvailableQualityData() || []);
    if (!best) return false;
    if (best.paygatedQualityDetails) player.setPlaybackQualityRange(best.quality, best.quality, best.formatId);
    else player.setPlaybackQualityRange(best.quality, best.quality);
    return true;
  } catch {
    // 플레이어가 준비되지 않았거나 API가 바뀐 경우는 조용히 넘어간다.
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
  document.addEventListener('playing', event => {
    const player = playerOf(event);
    if (player) handlePlaying(player);
  }, true);

  const existing = document.querySelector(PLAYER_SELECTOR);
  if (!existing) return;
  try {
    if (existing.getPlayerState() === 1) handlePlaying(existing);
  } catch {
    // 아직 API가 없으면 다음 playing 이벤트에서 적용한다.
  }
}

export default { id: 'max-quality', frames: true, start };
