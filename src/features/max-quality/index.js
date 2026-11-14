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

// 플레이어별로 재생에 실패한 화질의 가장 낮은 높이. 같은 영상 id에서만 유효하다.
const failures = new WeakMap();
// 복구 재시작 후 playing 때 돌아갈 위치 {id, time}. stopVideo 직후의 seekTo는 무시되므로 다음 playing에서 한다.
const resume = new WeakMap();

function pickBest(entries, limit = Infinity) {
  let best = null;
  for (const entry of entries) {
    if (!entry || !entry.isPlayable) continue;
    const height = QUALITY_HEIGHT[entry.quality];
    if (!height || height >= limit) continue;
    const bestHeight = best ? QUALITY_HEIGHT[best.quality] : 0;
    if (height > bestHeight) best = entry;
    else if (height === bestHeight && !best.paygatedQualityDetails && entry.paygatedQualityDetails) best = entry;
  }
  return best;
}

// 적용을 시도했으면 true, 쓸 만한 화질 데이터가 없거나 API가 없으면 false.
// limit이 있으면 그 높이 미만에서 고른다. current가 같은 화질이면 다시 맞추지 않는다.
function applyMaxQuality(player, limit = Infinity, current = null) {
  try {
    if (typeof player.getAvailableQualityData !== 'function' || typeof player.setPlaybackQualityRange !== 'function') return false;
    const best = pickBest(player.getAvailableQualityData() || [], limit);
    if (!best) return false;
    if (best.quality === current) return true;
    // 복구 경로(current 있음): 폴백 후 화질만 바꾸면 Chrome 플레이어가 오류 화면으로 멈추므로 정지 후 바꾸고 위치로 되돌려 재생한다.
    const recover = current !== null && ['getCurrentTime', 'stopVideo', 'playVideo'].every(name => typeof player[name] === 'function');
    const time = recover ? player.getCurrentTime() : 0;
    if (recover) player.stopVideo();
    if (best.paygatedQualityDetails) player.setPlaybackQualityRange(best.quality, best.quality, best.formatId);
    else player.setPlaybackQualityRange(best.quality, best.quality);
    if (recover) {
      if (time > 1) resume.set(player, { id: videoIdOf(player), time });
      player.playVideo();
    }
    return true;
  } catch {
    // 플레이어가 준비되지 않았거나 API가 바뀐 경우는 조용히 넘어간다.
    return false;
  }
}

function videoIdOf(player) {
  try {
    return player.getVideoData().video_id;
  } catch {
    return undefined;
  }
}

function qualityOf(player) {
  try {
    return player.getPlaybackQuality();
  } catch {
    return undefined;
  }
}

function failedLimit(player, id) {
  const record = failures.get(player);
  return record && record.id === id ? record.limit : Infinity;
}

function handlePlaying(player) {
  if (player.classList.contains('ad-showing')) return;
  const id = videoIdOf(player);
  if (!id) return;
  const pending = resume.get(player);
  if (pending) {
    resume.delete(player);
    try {
      if (pending.id === id && typeof player.seekTo === 'function' && Math.abs(player.getCurrentTime() - pending.time) > 1) player.seekTo(pending.time, true);
    } catch {
      // 위치 복원 실패는 조용히 넘어간다.
    }
  }
  if (id !== applied.get(player)) {
    if (applyMaxQuality(player, failedLimit(player, id))) applied.set(player, id);
    return;
  }
  // 재생에 실패한 화질이 있고 플레이어가 그보다 낮은 화질로 떨어졌으면 한 단계 아래로 다시 맞춘다.
  const limit = failedLimit(player, id);
  if (limit === Infinity) return;
  const current = qualityOf(player);
  const currentHeight = QUALITY_HEIGHT[current];
  if (!currentHeight || currentHeight >= limit) return;
  applyMaxQuality(player, limit, current);
}

// 정상적인 화질 변경에서는 error가 나지 않으므로 error를 재생 실패 신호로 쓴다.
function handleError(player) {
  if (player.classList.contains('ad-showing')) return;
  const id = videoIdOf(player);
  const height = QUALITY_HEIGHT[qualityOf(player)];
  if (!id || !height) return;
  const record = failures.get(player);
  const limit = record && record.id === id ? Math.min(record.limit, height) : height;
  failures.set(player, { id, limit });
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

  // error는 버블링하지 않으므로 캡처 단계에서 받는다.
  document.addEventListener('error', event => {
    const player = playerOf(event);
    if (player) handleError(player);
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
