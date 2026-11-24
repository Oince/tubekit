import { SCRIPT_ID } from './constants.js';

export const ACTIVE_CLASS = `${SCRIPT_ID}-active`;
export const HELD_CLASS = `${SCRIPT_ID}-suspended`;
export const SHOWN_SCOPE = `html.${ACTIVE_CLASS}:not(.${HELD_CLASS})`;
export const HELD_STYLES = `#${SCRIPT_ID}-root[data-suspended='true'] {
      display: none !important;
    }`;

export const RELEASED = 'released';
export const SHOWN = 'shown';
export const HELD = 'held';

export const initialLifecycle = Object.freeze({ phase: RELEASED, rememberedTab: null });

const effect = (type, fields = {}) => ({ type, ...fields });

function keepsPanel(observation) {
  if (observation.wrongGeneration || observation.brokenRoot || observation.gone) return false;
  return observation.fullscreen || observation.twoColumn || observation.leaving;
}

export function step(state, observation) {
  const effects = [];

  let { phase, rememberedTab } = state;

  if (phase !== RELEASED && !keepsPanel(observation)) {
    effects.push(effect('teardown'));
    phase = RELEASED;
    rememberedTab = observation.currentTab ?? null;
  }

  if (rememberedTab && rememberedTab.videoId !== observation.videoId) rememberedTab = null;

  if (phase === RELEASED) {
    if (!observation.twoColumn || !observation.pageFollowsUrl) return { state: { phase, rememberedTab }, effects };
    effects.push(effect('mount', { tab: rememberedTab?.tab ?? 'comments' }));
    phase = SHOWN;
  }

  const held = Boolean(observation.fullscreen || observation.youtubePanel);
  if (phase === SHOWN && held) {
    effects.push(effect('saveScroll'), effect('hide'));
    phase = HELD;
  } else if (phase === HELD && !held) {
    effects.push(effect('unhide'), effect('restoreTab'));
    phase = SHOWN;
  }

  return { state: { phase, rememberedTab }, effects };
}

export function mountFailed(state) {
  return { ...state, phase: RELEASED };
}
