import { describe, expect, test, vi } from 'vitest';
import { createCommentsRegion, createRelatedRegion } from '../src/features/right-rail-comments/borrowed-region.js';
import { createCommentsLoader } from '../src/features/right-rail-comments/comments-loader.js';
import { initialLifecycle, mountFailed, step } from '../src/features/right-rail-comments/lifecycle.js';
import { advance, loadPage, onCleanup, startFeature, stubProperty } from './helpers.js';

const HIDDEN_RECT = { width: 0, left: 0, right: 0 };
const layout = { hidden: false, primary: null, secondary: null };

function columnRects(primary, secondary) {
  layout.hidden = false;
  layout.primary = primary;
  layout.secondary = secondary;
  return {
    rect: element => layout.hidden ? HIDDEN_RECT : element.id === 'primary' ? layout.primary : layout.secondary,
    clientRects: () => layout.hidden ? [] : [{}],
  };
}

async function setup({
  disabled = false,
  disabledText = 'Comments are turned off',
  innerWidth = 1440,
  twoColumns = true,
  primary = { width: 900, left: 0, right: 900 },
  secondary = { width: 400, left: 920, right: 1320 },
  expectRoot = true,
  htmlAttrs = '',
  liveStream = false,
} = {}) {
  const content = disabled
    ? `<ytd-message-renderer>${disabledText}</ytd-message-renderer>`
    : liveStream ? '' : '<ytd-comments-header-renderer></ytd-comments-header-renderer>';
  loadPage({
    url: 'https://www.youtube.com/watch?v=A',
    html: `<html lang="en" ${htmlAttrs}><head></head><body><ytd-app>
    <ytd-watch-flexy video-id="A"${twoColumns ? ' is-two-columns_' : ''}><div id="primary"><ytd-player><div id="movie_player"></div></ytd-player><div id="below">
      <ytd-comments id="comments"${liveStream ? ' hidden disable-upgrade' : ''}>${content}</ytd-comments>
    </div></div><div id="secondary"><div id="secondary-inner">
      <div id="related">related</div>
    </div></div></ytd-watch-flexy></ytd-app></body></html>`,
    innerWidth,
    ...columnRects(primary, secondary),
  });
  await startFeature('right-rail-comments');
  await advance(200);
  if (expectRoot) expect(document.querySelector('#tubekit-root')).toBeTruthy();
  return { document, watch: document.querySelector('ytd-watch-flexy') };
}

async function mutationsSettle() {
  await Promise.resolve();
}

function collapseToOneColumn() {
  window.innerWidth = 800;
  document.querySelector('ytd-watch-flexy').removeAttribute('is-two-columns_');
}

function newComments(document) {
  const node = document.createElement('ytd-comments');
  node.id = 'comments';
  node.innerHTML = '<ytd-comments-header-renderer></ytd-comments-header-renderer>';
  return node;
}

function expandedPanel(document) {
  const panel = document.createElement('ytd-engagement-panel-section-list-renderer');
  panel.setAttribute('visibility', 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED');
  return panel;
}

function removeMarkers(document) {
  const walker = document.createTreeWalker(document, 128);
  const markers = [];
  while (walker.nextNode()) {
    if (walker.currentNode.data.startsWith('tubekit:')) markers.push(walker.currentNode);
  }
  markers.forEach(node => node.remove());
}

function selected(document) {
  return document.querySelector('[role="tab"][aria-selected="true"]').dataset.tab;
}

const THEATER_ATTRIBUTES = ['theater', 'full-bleed-player'];

async function theater(watch) {
  for (const name of THEATER_ATTRIBUTES) watch.setAttribute(name, '');
  await advance(200);
}

async function leaveTheater(watch) {
  for (const name of THEATER_ATTRIBUTES) watch.removeAttribute(name);
  await advance(200);
}

test('mobile: right rail comments panel does not run on m.youtube.com', async () => {
  loadPage({ url: 'https://m.youtube.com/watch?v=A', body: '<ytd-app><div id="x"></div></ytd-app>' });
  await startFeature('right-rail-comments');
  expect(document.querySelector('#tubekit-styles')).toBe(null);
  expect(document.querySelector('#tubekit-root')).toBe(null);
});

test('iPad Pro 11-inch Sidecar landscape creates the panel at 1194px', async () => {
  const { document } = await setup({
    innerWidth: 1194,
    primary: { width: 780, left: 16, right: 796 },
    secondary: { width: 398, left: 796, right: 1194 },
  });
  expect(document.querySelector('#tubekit-root')).toBeTruthy();
});

test('overlay scrollbar two-column layout below 1015px still creates the panel', async () => {
  const { document } = await setup({
    innerWidth: 1014,
    primary: { width: 656, left: 16, right: 672 },
    secondary: { width: 336, left: 672, right: 1008 },
  });
  expect(document.querySelector('#tubekit-root')).toBeTruthy();
});

test('one-column layout does not create the panel', async () => {
  const { document } = await setup({ innerWidth: 999, twoColumns: false, expectRoot: false });
  expect(document.querySelector('#tubekit-root')).toBe(null);
});

test('two-column attribute without side-by-side columns does not create the panel', async () => {
  const { document } = await setup({
    secondary: { width: 400, left: 0, right: 400 },
    expectRoot: false,
  });
  expect(document.querySelector('#tubekit-root')).toBe(null);
});

test('CSS hides the panel while YouTube is not in the two-column layout', async () => {
  const { document } = await setup();
  const css = document.querySelector('#tubekit-styles').textContent;
  expect(css).toMatch(/ytd-watch-flexy:not\(\[is-two-columns_\]\) #tubekit-root\s*\{[^}]*display: none !important;/);
  expect(css).not.toMatch(/max-width: 1014px/);
});

test('idle DOM settles instead of repeatedly evaluating', async () => {
  await setup();
  expect(vi.getTimerCount()).toBe(0);
  await advance(400);
  expect(vi.getTimerCount()).toBe(0);
});

test('detached panel is recreated and retains native content', async () => {
  const { document } = await setup();
  const comments = document.querySelector('#comments');
  const related = document.querySelector('#related');
  const root = document.querySelector('#tubekit-root');
  root.remove();
  await advance(200);
  expect(document.querySelector('#tubekit-root')).not.toBe(root);
  expect(document.querySelector('#tubekit-comments-pane #comments')).toBe(comments);
  expect(document.querySelector('#tubekit-related-pane #related')).toBe(related);
});

test('secondary container replacement recovers with the new related content', async () => {
  const { document } = await setup();
  const comments = document.querySelector('#comments');
  const inner = document.createElement('div');
  inner.id = 'secondary-inner';
  inner.innerHTML = '<div id="related">new related</div>';
  document.querySelector('#secondary-inner').replaceWith(inner);
  await advance(200);
  expect(inner.querySelector('#tubekit-root')).toBeTruthy();
  expect(document.querySelector('#tubekit-comments-pane #comments')).toBe(comments);
  expect(document.querySelector('#related').textContent).toBe('new related');
  expect(document.querySelectorAll('#related').length).toBe(1);
});

test('replacement comments are adopted and observed', async () => {
  const { document } = await setup();
  document.querySelector('#comments').remove();
  const replacement = newComments(document);
  replacement.replaceChildren();
  document.querySelector('#below').append(replacement);
  await advance(200);
  expect(document.querySelector('#tubekit-comments-pane #comments')).toBe(replacement);
  expect(document.querySelector('.tubekit-status')).toBeTruthy();
  replacement.append(document.createElement('ytd-comments-header-renderer'));
  await advance(350);
  expect(document.querySelector('.tubekit-status')).toBe(null);
});

test('native reparenting of the existing comments is repaired', async () => {
  const { document } = await setup();
  const comments = document.querySelector('#comments');
  document.querySelector('#below').append(comments);
  await advance(200);
  expect(document.querySelector('#tubekit-comments-pane #comments')).toBe(comments);
  expect(document.querySelectorAll('#comments').length).toBe(1);
});

test('old video content is not restored into a reused watch renderer', async () => {
  const { document, watch } = await setup();
  const oldComments = document.querySelector('#comments');
  history.pushState({}, '', '/watch?v=B');
  watch.setAttribute('video-id', 'B');
  await advance(200);
  expect(oldComments.isConnected).toBe(false);
  expect(document.querySelector('#primary #comments')).toBe(null);
});

test('unavailable timer from the previous video cannot switch the new tab', async () => {
  const { document, watch } = await setup({ disabled: true });
  document.dispatchEvent(new Event('yt-navigate-start'));
  history.pushState({}, '', '/watch?v=B');
  watch.setAttribute('video-id', 'B');
  document.querySelector('#comments').replaceWith(newComments(document));
  document.dispatchEvent(new Event('yt-navigate-finish'));
  await advance(1000);
  expect(selected(document)).toBe('comments');
});

test('comments turned off show a notice, clear the loading box, and switch to related after 0.9 seconds', async () => {
  const { document } = await setup({ disabled: true });
  const toast = document.querySelector('#tubekit-toast');
  expect(toast.dataset.visible).toBe('true');
  expect(toast.textContent).toBe('Comments are unavailable for this video. Showing related videos.');
  expect(document.querySelector('.tubekit-status')).toBe(null);
  await advance(600);
  expect(selected(document)).toBe('comments');
  await advance(150);
  expect(selected(document)).toBe('related');
  await advance(4000);
  expect(toast.dataset.visible).toBe('false');
});

test('an off message that goes away within 0.9 seconds cancels the switch to related', async () => {
  const { document } = await setup({ disabled: true });
  document.querySelector('#comments').innerHTML = '';
  await advance(300);
  await advance(1000);
  expect(selected(document)).toBe('comments');
  expect(document.querySelector('.tubekit-status')).toBe(null);
});

test('comments that fail to load show an error with a retry button that switches back and loads them again', async () => {
  const { document } = await setup({ liveStream: true });
  await advance(20_500);
  const status = document.querySelector('#tubekit-comments-pane .tubekit-status');
  expect(status.dataset.kind).toBe('error');
  expect(status.textContent).toBe('Comments could not be loaded.Retry');
  document.querySelector('#tubekit-related-tab').click();
  status.querySelector('button').click();
  expect(selected(document)).toBe('comments');
  expect(document.querySelector('#tubekit-comments-pane .tubekit-status').dataset.kind).toBe('loading');
  document.querySelector('#comments').insertAdjacentHTML('beforeend', '<ytd-comments-header-renderer></ytd-comments-header-renderer>');
  await advance(600);
  expect(document.querySelector('.tubekit-status')).toBe(null);
  expect(selected(document)).toBe('comments');
});

test('DOM changes off the watch page skip evaluation, and returning to /watch restores the panel', async () => {
  const { document } = await setup();
  document.dispatchEvent(new Event('yt-navigate-start'));
  history.pushState({}, '', '/');
  await advance(400);
  expect(document.querySelector('#tubekit-root')).toBe(null);
  expect(vi.getTimerCount()).toBe(0);
  document.querySelector('ytd-app').appendChild(document.createElement('div'));
  await mutationsSettle();
  expect(vi.getTimerCount()).toBe(0);
  await advance(400);
  history.pushState({}, '', '/watch?v=A');
  document.dispatchEvent(new Event('yt-navigate-finish'));
  await advance(500);
  expect(document.querySelector('#tubekit-root')).toBeTruthy();
});

test('booting off the watch page ignores DOM changes, then builds the panel on /watch', async () => {
  loadPage({
    url: 'https://www.youtube.com/',
    html: '<html lang="en"><head></head><body></body></html>',
    innerWidth: 1440,
    ...columnRects({ width: 900, left: 0, right: 900 }, { width: 400, left: 920, right: 1320 }),
  });
  await startFeature('right-rail-comments');
  await advance(400);
  expect(vi.getTimerCount()).toBe(0);
  document.body.appendChild(document.createElement('div'));
  await mutationsSettle();
  expect(vi.getTimerCount()).toBe(0);
  await advance(400);
  const app = document.createElement('ytd-app');
  document.body.appendChild(app);
  await advance(400);
  expect(vi.getTimerCount()).toBe(0);
  app.appendChild(document.createElement('div'));
  await mutationsSettle();
  expect(vi.getTimerCount()).toBe(0);
  await advance(400);
  history.pushState({}, '', '/watch?v=A');
  app.innerHTML = `<ytd-watch-flexy video-id="A" is-two-columns_><div id="primary"><ytd-player><div id="movie_player"></div></ytd-player><div id="below">
    <ytd-comments id="comments"><ytd-comments-header-renderer></ytd-comments-header-renderer></ytd-comments></div></div>
    <div id="secondary"><div id="secondary-inner"><div id="related">related</div></div></div></ytd-watch-flexy>`;
  document.dispatchEvent(new Event('yt-navigate-finish'));
  await advance(500);
  expect(document.querySelector('#tubekit-root')).toBeTruthy();
});

test('keyboard arrows wrap and Home/End activate and focus the target tab', async () => {
  const { document } = await setup();
  document.querySelector('#tubekit-comments-tab').focus();
  for (const [key, expected] of [['ArrowRight', 'related'], ['ArrowRight', 'comments'],
    ['ArrowLeft', 'related'], ['Home', 'comments'], ['End', 'related']]) {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    document.activeElement.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(selected(document)).toBe(expected);
    expect(document.activeElement.dataset.tab).toBe(expected);
    expect(document.querySelectorAll('[role="tab"][tabindex="0"]').length).toBe(1);
  }
});

test('special panels release rail clipping and closing them restores the panel', async () => {
  const { document } = await setup();
  const secondary = document.querySelector('#secondary');
  expect(getComputedStyle(secondary).overflowY).toBe('clip');
  const panel = expandedPanel(document);
  document.querySelector('#secondary-inner').append(panel);
  await advance(200);
  expect(document.querySelector('#tubekit-root').dataset.suspended).toBe('true');
  expect(getComputedStyle(secondary).overflowY).not.toBe('clip');
  panel.remove();
  await advance(200);
  expect(document.querySelector('#tubekit-root').dataset.suspended).toBe('false');
  expect(getComputedStyle(secondary).overflowY).toBe('clip');
});

test('panel root keeps a 14px scrollbar area regardless of the right column padding', async () => {
  const { document } = await setup();
  const root = document.querySelector('#tubekit-root');
  let offset = 320;
  const proto = HTMLElement.prototype;
  stubProperty(proto, 'offsetWidth', { get() { return this.classList.contains('tubekit-pane') ? offset : 0; } });
  stubProperty(proto, 'clientWidth', { get() { return this.classList.contains('tubekit-pane') ? 320 : 0; } });
  for (const padding of ['16px', '0px']) {
    document.querySelector('#secondary').style.paddingRight = padding;
    for (const [scrollbar, gutter, inset] of [[0, 14, 14], [12, 2, 14], [15, 0, 15], [17, 0, 17]]) {
      offset = 320 + scrollbar;
      window.dispatchEvent(new Event('resize'));
      await advance(300);
      expect(root.style.getPropertyValue('--tubekit-rail-overhang')).toBe('');
      expect(root.style.getPropertyValue('--tubekit-pane-gutter')).toBe(`${gutter}px`);
      expect(root.style.getPropertyValue('--tubekit-content-inset')).toBe(`${inset}px`);
    }
  }
});

test('panel root recomputes the scrollbar area when switching tabs', async () => {
  const { document } = await setup();
  const root = document.querySelector('#tubekit-root');
  const proto = HTMLElement.prototype;
  stubProperty(proto, 'offsetWidth', { get() { return this.classList.contains('tubekit-pane') ? (this.id.includes('related') ? 320 : 332) : 0; } });
  stubProperty(proto, 'clientWidth', { get() { return this.classList.contains('tubekit-pane') ? 320 : 0; } });
  window.dispatchEvent(new Event('resize'));
  await advance(300);
  expect(root.style.getPropertyValue('--tubekit-pane-gutter')).toBe('2px');
  document.querySelector('#tubekit-related-tab').click();
  await advance(100);
  expect(root.style.getPropertyValue('--tubekit-pane-gutter')).toBe('14px');
  expect(root.style.getPropertyValue('--tubekit-content-inset')).toBe('14px');
});

test('selected tab survives leaving and re-entering the layout on the same video', async () => {
  const { document, watch } = await setup();
  document.querySelector('#tubekit-related-tab').click();
  await theater(watch);
  expect(document.querySelector('#tubekit-root')).toBe(null);
  await leaveTheater(watch);
  expect(document.querySelector('#tubekit-root')).toBeTruthy();
  expect(selected(document)).toBe('related');
});

test('related moved by YouTube into the one-column layout stays before the restored comments', async () => {
  const { document } = await setup();
  const comments = document.querySelector('#comments');
  const related = document.querySelector('#related');
  comments.before(related);
  collapseToOneColumn();
  await advance(300);
  expect(document.querySelector('#tubekit-root')).toBe(null);
  expect(document.querySelector('#below').children[0]).toBe(related);
  expect(related.nextElementSibling).toBe(comments);
  expect(document.querySelector('#secondary-inner #related')).toBe(null);
  expect(document.querySelectorAll('#related').length).toBe(1);
  expect(document.querySelectorAll('#comments').length).toBe(1);

  window.innerWidth = 1440;
  document.querySelector('#secondary-inner').append(related);
  document.querySelector('ytd-watch-flexy').setAttribute('is-two-columns_', '');
  await advance(300);
  expect(document.querySelector('#tubekit-root')).toBeTruthy();
  expect(document.querySelector('#tubekit-comments-pane #comments')).toBe(comments);
  expect(document.querySelector('#tubekit-related-pane #related')).toBe(related);
});

test('related moved outside the panel by YouTube is not pulled back into the hidden secondary column', async () => {
  const { document } = await setup();
  const related = document.querySelector('#related');
  document.querySelector('#below').append(related);
  collapseToOneColumn();
  await advance(300);
  expect(document.querySelector('#tubekit-root')).toBe(null);
  expect(document.querySelector('#below > #related')).toBe(related);
  expect(document.querySelector('#secondary-inner #related')).toBe(null);
});

test('navigating to another video resets the selected tab to comments', async () => {
  const { document, watch } = await setup();
  document.querySelector('#tubekit-related-tab').click();
  document.dispatchEvent(new Event('yt-navigate-start'));
  history.pushState({}, '', '/watch?v=B');
  watch.setAttribute('video-id', 'B');
  document.querySelector('#below').append(newComments(document));
  document.dispatchEvent(new Event('yt-navigate-finish'));
  await advance(300);
  expect(document.querySelector('#tubekit-root')).toBeTruthy();
  expect(selected(document)).toBe('comments');
});

const SYS = n => `var(--yt-sys-color-baseline--${n}, `;
function expectedTokens(d) {
  return new Map([
    ['bg', `${SYS('base-background')}var(--yt-spec-base-background, ${d.bg}))`],
    ['text', `${SYS('text-primary')}var(--yt-spec-text-primary, ${d.text}))`],
    ['text-secondary', `${SYS('text-secondary')}var(--yt-spec-text-secondary, ${d.secondary}))`],
    ['outline', `${SYS('outline')}var(--yt-spec-10-percent-layer, ${d.outline}))`],
    ['hover', `${SYS('additive-background')}var(--yt-spec-10-percent-layer, ${d.hover}))`],
    ['selected', `${SYS('button-chip-background-hover')}var(--yt-spec-badge-chip-background, ${d.selected}))`],
    ['toast-bg', `${SYS('inverted-background')}${d.toastBg})`],
    ['toast-text', `${SYS('text-primary-inverse')}var(--yt-spec-text-primary-inverse, ${d.toastText}))`],
  ]);
}
const LIGHT = { bg: '#fff', text: '#0f0f0f', secondary: '#606060', outline: 'rgba(0, 0, 0, .1)', hover: 'rgba(0, 0, 0, .05)', selected: 'rgba(0, 0, 0, .1)', toastBg: '#0f0f0f', toastText: '#fff' };
const DARK = { bg: '#0f0f0f', text: '#f1f1f1', secondary: '#aaa', outline: 'rgba(255, 255, 255, .2)', hover: 'rgba(255, 255, 255, .1)', selected: 'rgba(255, 255, 255, .2)', toastBg: '#f1f1f1', toastText: '#0f0f0f' };

function parseTokens(block) {
  const map = new Map();
  for (const m of block.matchAll(/--tubekit-([\w-]+):\s*([^;]+);/g)) map.set(m[1], m[2].trim());
  return map;
}

function checkStyles(css) {
  const lightRule = css.match(/#tubekit-root \{[^}]*\}/);
  const darkRule = css.match(/html\[dark\] #tubekit-root \{[^}]*\}/);
  expect(lightRule && darkRule, 'light and dark rules exist').toBeTruthy();
  expect(darkRule[0]).toMatch(/color-scheme: dark;/);
  const light = parseTokens(lightRule[0]);
  const dark = parseTokens(darkRule[0]);
  expect([...light.keys()].sort()).toStrictEqual([...dark.keys()].sort());
  expect(light).toStrictEqual(expectedTokens(LIGHT));
  expect(dark).toStrictEqual(expectedTokens(DARK));
  expect(lightRule[0]).toMatch(/color: var\(--tubekit-text\);/);
  expect(lightRule[0]).toMatch(/background: var\(--tubekit-bg\);/);
  expect(css.match(/#tubekit-tabs \{[^}]*\}/)[0]).toMatch(/background: var\(--tubekit-bg\);/);
  expect(css.match(/#tubekit-toast \{[^}]*\}/)[0]).toMatch(/background: var\(--tubekit-toast-bg\);/);
  const rest = css.replace(lightRule[0], '').replace(darkRule[0], '');
  expect(rest).not.toMatch(/--yt-spec-|--yt-sys-/);
}

test('dark mode: panel tokens have exact light/dark fallbacks and elements use them', async () => {
  const { document } = await setup({ htmlAttrs: 'dark' });
  checkStyles(document.getElementById('tubekit-styles').textContent);
});

test('mutations inside adopted comments do not trigger evaluation', async () => {
  const { document } = await setup();
  expect(vi.getTimerCount()).toBe(0);
  const comments = document.querySelector('#comments');
  for (let i = 0; i < 5; i++) {
    comments.appendChild(document.createElement('ytd-comment-thread-renderer'));
    await mutationsSettle();
    expect(vi.getTimerCount(), 'only the throttled comments check is pending').toBe(1);
    await advance(30);
  }
  await advance(300);
  expect(vi.getTimerCount()).toBe(0);
});

test('a scroll event that does not move the pane does not defer evaluation', async () => {
  const { document } = await setup();
  expect(vi.getTimerCount()).toBe(0);
  document.querySelector('#tubekit-comments-pane').dispatchEvent(new Event('scroll'));
  document.querySelector('#below').appendChild(document.createElement('div'));
  await mutationsSettle();
  expect(vi.getTimerCount()).toBe(1);
  await advance(100);
  expect(vi.getTimerCount(), 'evaluation ran without waiting').toBe(0);
});

test('evaluation is deferred while the pane is scrolling', async () => {
  const { document } = await setup();
  expect(vi.getTimerCount()).toBe(0);
  const pane = document.querySelector('#tubekit-comments-pane');
  Object.defineProperty(pane, 'scrollTop', { configurable: true, value: 120 });
  pane.dispatchEvent(new Event('scroll'));
  document.querySelector('#below').appendChild(document.createElement('div'));
  await mutationsSettle();
  expect(vi.getTimerCount()).toBe(1);
  await advance(100);
  expect(vi.getTimerCount(), 'evaluation is still waiting').toBe(1);
  await advance(200);
  expect(vi.getTimerCount(), 'evaluation ran').toBe(0);
});

test('removing comments from the pane is still detected', async () => {
  const { document } = await setup();
  expect(document.querySelector('.tubekit-status')).toBe(null);
  document.querySelector('#comments').remove();
  await advance(300);
  expect(document.querySelector('.tubekit-status')).toBeTruthy();
});

test('mutations on nodes removed within the same batch do not trigger evaluation', async () => {
  const { document } = await setup();
  expect(vi.getTimerCount()).toBe(0);
  const comments = document.querySelector('#comments');
  const div = document.createElement('div');
  comments.appendChild(div);
  div.appendChild(document.createElement('span'));
  div.remove();
  await mutationsSettle();
  expect(vi.getTimerCount(), 'only the throttled comments check is pending').toBe(1);
  await advance(300);
  expect(vi.getTimerCount()).toBe(0);
});

test('comment mutation bursts are checked at most once per throttle window', async () => {
  const { document } = await setup();
  const comments = document.querySelector('#comments');
  let calls = 0;
  const original = comments.querySelector;
  comments.querySelector = function (...args) {
    calls++;
    return original.apply(this, args);
  };
  for (let i = 0; i < 10; i++) comments.appendChild(document.createElement('ytd-comment-thread-renderer'));
  for (let i = 0; i < 3; i++) {
    await advance(16);
    comments.appendChild(document.createElement('ytd-comment-thread-renderer'));
  }
  expect(calls).toBe(0);
  await advance(400);
  expect(calls > 0 && calls <= 4, `querySelector calls: ${calls}`).toBeTruthy();
});

test('mutations inside the player do not trigger evaluation', async () => {
  const { document } = await setup();
  expect(vi.getTimerCount()).toBe(0);
  const player = document.querySelector('#movie_player');
  for (let i = 0; i < 5; i++) {
    player.appendChild(document.createElement('div'));
    await mutationsSettle();
    expect(vi.getTimerCount()).toBe(0);
    await advance(30);
  }
  await advance(300);
  expect(vi.getTimerCount()).toBe(0);
});

test('mutations outside the player still trigger evaluation', async () => {
  const { document } = await setup();
  expect(vi.getTimerCount()).toBe(0);
  document.querySelector('#below').appendChild(document.createElement('div'));
  await mutationsSettle();
  expect(vi.getTimerCount(), 'evaluation is scheduled').toBe(1);
  await advance(300);
  expect(vi.getTimerCount(), 'evaluation ran').toBe(0);
});

test('scroll events record the shown pane position and tab switching restores each position', async () => {
  const { document } = await setup();
  const spy = pane => {
    const spyState = { reads: 0, value: 0 };
    Object.defineProperty(pane, 'scrollTop', {
      configurable: true,
      get() { spyState.reads++; return spyState.value; },
      set(v) { spyState.value = v; },
    });
    return spyState;
  };
  const commentsPane = document.querySelector('#tubekit-comments-pane');
  const relatedPane = document.querySelector('#tubekit-related-pane');
  const comments = spy(commentsPane);
  const related = spy(relatedPane);
  const raf = () => advance(16);

  comments.value = 300;
  commentsPane.dispatchEvent(new Event('scroll'));
  expect(comments.reads > 0, 'the shown pane position is recorded on scroll').toBeTruthy();

  const tab = name => document.querySelector(`[role="tab"][data-tab="${name}"]`);
  tab('related').click();
  await raf();
  await raf();
  related.value = 700;
  tab('comments').click();
  await raf();
  await raf();
  expect(comments.value).toBe(300);
  tab('related').click();
  await raf();
  await raf();
  expect(related.value).toBe(700);
});

test('long comment and related lists skip off-screen rendering', async () => {
  const { document } = await setup();
  const css = document.getElementById('tubekit-styles').textContent;
  expect(css).toMatch(/ytd-comment-thread-renderer[^{]*\{[^}]*content-visibility: auto;/);
  expect(css).toMatch(/yt-lockup-view-model[^{]*\{[^}]*content-visibility: auto;/);
});

test('emoji picker is not clipped inside the comments pane', async () => {
  const { document } = await setup();
  const css = document.getElementById('tubekit-styles').textContent;
  expect(css).toMatch(/ytd-comment-thread-renderer:has\(ytd-commentbox\[is-emoji-picker-displayed\]\)[^{]*\{[^}]*content-visibility: visible;/);
  expect(css).toMatch(/ytd-commentbox #emojis[^{]*\{[^}]*width: auto !important;[^}]*max-width: 100% !important;/);
  expect(css).toMatch(/yt-emoji-picker-renderer #search-panel[^{]*\{[^}]*width: 100% !important;/);
});

test('panes do not contain fixed-position menus such as the comment sort dropdown', async () => {
  const { document } = await setup();
  const css = document.getElementById('tubekit-styles').textContent;
  const pane = css.match(/\.tubekit-pane \{([^}]*)\}/)[1];
  expect(pane).not.toMatch(/\bcontain:/);
});

test('secondary column offsets its top with margin, not padding, so a short left column still keeps it level with the player', async () => {
  const { document } = await setup();
  const css = document.getElementById('tubekit-styles').textContent;
  const rule = css.match(/ytd-watch-flexy #secondary \{([^}]*)\}/)[1];
  expect(rule).toMatch(/margin-top: 12px !important;/);
  expect(rule).toMatch(/padding-top: 0 !important;/);
});

function spyScrollTop(pane) {
  let value = 0;
  let hidden = false;
  Object.defineProperty(pane, 'scrollTop', {
    configurable: true,
    get() { return hidden ? 0 : value; },
    set(v) { if (!hidden) value = v; },
  });
  return {
    get value() { return value; },
    set value(v) { value = v; },
    get hidden() { return hidden; },
    set hidden(v) {
      hidden = v;
      if (hidden) value = 0;
    },
  };
}

test('re-selecting the same tab keeps the scroll position', async () => {
  const { document } = await setup();
  const comments = spyScrollTop(document.querySelector('#tubekit-comments-pane'));
  const raf = () => advance(16);
  comments.value = 300;
  document.querySelector('[role="tab"][data-tab="comments"]').click();
  await raf();
  await raf();
  expect(comments.value).toBe(300);
});

test('a scroll event fired while a pane reappears does not change the position it is restored to', async () => {
  const { document } = await setup();
  const raf = () => advance(16);
  const commentsPane = document.querySelector('#tubekit-comments-pane');
  const comments = spyScrollTop(commentsPane);
  comments.value = 300;
  commentsPane.dispatchEvent(new Event('scroll'));
  document.querySelector('[role="tab"][data-tab="related"]').click();
  await raf();
  await raf();
  comments.value = 0;
  document.querySelector('[role="tab"][data-tab="comments"]').click();
  commentsPane.dispatchEvent(new Event('scroll'));
  await raf();
  await raf();
  expect(comments.value).toBe(300);
});

test('scroll position survives opening and closing a special panel on both tabs', async () => {
  const { document } = await setup();
  const raf = () => advance(16);
  const panes = {
    comments: spyScrollTop(document.querySelector('#tubekit-comments-pane')),
    related: spyScrollTop(document.querySelector('#tubekit-related-pane')),
  };
  for (const tab of ['comments', 'related']) {
    document.querySelector(`[role="tab"][data-tab="${tab}"]`).click();
    await raf();
    await raf();
    panes[tab].value = 300;
    const panel = expandedPanel(document);
    document.querySelector('#secondary-inner').append(panel);
    await raf();
    expect(document.querySelector('#tubekit-root').dataset.suspended).toBe('true');
    panes[tab].hidden = true;
    await advance(200);
    panel.remove();
    await raf();
    expect(document.querySelector('#tubekit-root').dataset.suspended).toBe('false');
    panes[tab].hidden = false;
    await raf();
    await raf();
    expect(panes[tab].value, `${tab} scroll restored`).toBe(300);
  }
});

test('live streams with hidden comments beside the chat fall back to related and hold with the chat', async () => {
  const { document } = await setup({ liveStream: true });
  expect(document.querySelector('#tubekit-comments-pane .tubekit-status')).toBeTruthy();
  const chat = document.createElement('div');
  chat.id = 'chat-container';
  chat.innerHTML = '<ytd-live-chat-frame id="chat"></ytd-live-chat-frame>';
  document.querySelector('#secondary-inner').prepend(chat);
  await advance(4400);
  expect(document.querySelector('#tubekit-root').dataset.suspended).toBe('true');
  expect(selected(document)).toBe('related');
  expect(document.querySelector('#tubekit-comments-pane .tubekit-status')).toBe(null);
  chat.firstElementChild.setAttribute('collapsed', '');
  await advance(200);
  expect(document.querySelector('#tubekit-root').dataset.suspended).toBe('false');
  expect(selected(document)).toBe('related');
});

test('comments found off while a YouTube panel holds the panel come back on the related tab when the panel closes', async () => {
  const { document } = await setup({ disabled: true });
  const root = document.querySelector('#tubekit-root');
  const panel = expandedPanel(document);
  document.querySelector('#secondary-inner').append(panel);
  await advance(100);
  expect(root.dataset.suspended).toBe('true');
  expect(selected(document)).toBe('comments');
  await advance(800);
  expect(selected(document), 'switched while held').toBe('related');
  panel.remove();
  await advance(200);
  expect(root.dataset.suspended).toBe('false');
  expect(selected(document)).toBe('related');
});

function fullscreenStub(panes = {}) {
  const watch = document.querySelector('ytd-watch-flexy');
  let element = null;
  stubProperty(document, 'fullscreenElement', { get: () => element });
  const hideRightColumn = () => {
    for (const name of ['fullscreen', 'full-bleed-player']) watch.setAttribute(name, '');
    layout.hidden = true;
    Object.values(panes).forEach(pane => { pane.hidden = true; });
  };
  const controller = new AbortController();
  onCleanup(() => controller.abort());
  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement) hideRightColumn();
  }, { capture: true, signal: controller.signal });
  return {
    enter({ hiddenBeforeEvent = false } = {}) {
      if (hiddenBeforeEvent) hideRightColumn();
      element = document.documentElement;
      document.documentElement.dispatchEvent(new Event('fullscreenchange', { bubbles: true }));
    },
    exit({ width = 1440, twoColumns = width >= 1000 } = {}) {
      element = null;
      window.innerWidth = width;
      if (!twoColumns) watch.removeAttribute('is-two-columns_');
      document.documentElement.dispatchEvent(new Event('fullscreenchange', { bubbles: true }));
      for (const name of ['fullscreen', 'full-bleed-player']) watch.removeAttribute(name);
      layout.hidden = false;
      if (twoColumns) Object.values(panes).forEach(pane => { pane.hidden = false; });
    },
  };
}

async function scrollBothTabs(positions = { comments: 300, related: 700 }) {
  const raf = () => advance(16);
  const panes = {
    comments: spyScrollTop(document.querySelector('#tubekit-comments-pane')),
    related: spyScrollTop(document.querySelector('#tubekit-related-pane')),
  };
  for (const tab of ['related', 'comments']) {
    document.querySelector(`[role="tab"][data-tab="${tab}"]`).click();
    await raf();
    await raf();
    panes[tab].value = positions[tab];
    document.querySelector(`#tubekit-${tab}-pane`).dispatchEvent(new Event('scroll'));
  }
  return panes;
}

const frames = async () => {
  for (let i = 0; i < 2; i++) await advance(16);
};

test('switching tabs while a YouTube panel holds the panel keeps both saved scroll positions', async () => {
  const { document } = await setup();
  const root = document.querySelector('#tubekit-root');
  const panes = await scrollBothTabs();
  const panel = expandedPanel(document);
  document.querySelector('#secondary-inner').append(panel);
  await advance(16);
  expect(root.dataset.suspended).toBe('true');
  Object.values(panes).forEach(pane => { pane.hidden = true; });
  document.querySelector('#comments').innerHTML = '<ytd-message-renderer>Comments are turned off</ytd-message-renderer>';
  await advance(1300);
  expect(selected(document), 'switched while held').toBe('related');
  panel.remove();
  await advance(16);
  expect(root.dataset.suspended).toBe('false');
  Object.values(panes).forEach(pane => { pane.hidden = false; });
  await frames();
  expect(selected(document)).toBe('related');
  expect(panes.related.value).toBe(700);
  document.querySelector('[role="tab"][data-tab="comments"]').click();
  await frames();
  expect(panes.comments.value).toBe(300);
});

test('fullscreen holds the panel and restores the tab and both scroll positions on exit', async () => {
  const { document } = await setup();
  const root = document.querySelector('#tubekit-root');
  const panes = await scrollBothTabs();
  const fullscreen = fullscreenStub(panes);
  fullscreen.enter();
  await advance(200);
  expect(document.querySelector('#tubekit-root')).toBe(root);
  expect(root.dataset.suspended).toBe('true');
  expect(document.documentElement.classList.contains('tubekit-suspended')).toBeTruthy();
  fullscreen.exit();
  await advance(200);
  await frames();
  expect(document.querySelector('#tubekit-root'), 'not torn down').toBe(root);
  expect(root.dataset.suspended).toBe('false');
  expect(document.documentElement.classList.contains('tubekit-suspended')).toBe(false);
  expect(selected(document)).toBe('comments');
  expect(panes.comments.value).toBe(300);
  document.querySelector('[role="tab"][data-tab="related"]').click();
  await frames();
  expect(panes.related.value).toBe(700);
});

test('fullscreen noticed only after YouTube hid the right column still restores the active tab position', async () => {
  const { document } = await setup();
  const root = document.querySelector('#tubekit-root');
  const panes = await scrollBothTabs();
  const fullscreen = fullscreenStub(panes);
  fullscreen.enter({ hiddenBeforeEvent: true });
  await advance(200);
  expect(root.dataset.suspended).toBe('true');
  fullscreen.exit();
  await advance(200);
  await frames();
  expect(document.querySelector('#tubekit-root')).toBe(root);
  expect(selected(document)).toBe('comments');
  expect(panes.comments.value).toBe(300);
  document.querySelector('[role="tab"][data-tab="related"]').click();
  await frames();
  expect(panes.related.value).toBe(700);
});

test('fullscreen saves a position not yet reported by a scroll event before YouTube hides the right column in the same fullscreenchange', async () => {
  const { document } = await setup();
  const panes = await scrollBothTabs();
  panes.comments.value = 450;
  const fullscreen = fullscreenStub(panes);
  fullscreen.enter();
  await advance(200);
  fullscreen.exit();
  await advance(200);
  await frames();
  expect(selected(document)).toBe('comments');
  expect(panes.comments.value).toBe(450);
});

test('changing the video during fullscreen tears the panel down and mounts fresh after exit', async () => {
  const { document, watch } = await setup();
  const root = document.querySelector('#tubekit-root');
  const fullscreen = fullscreenStub();
  fullscreen.enter();
  await advance(200);
  document.dispatchEvent(new Event('yt-navigate-start'));
  history.pushState({}, '', '/watch?v=B');
  watch.setAttribute('video-id', 'B');
  document.dispatchEvent(new Event('yt-navigate-finish'));
  await advance(300);
  expect(document.querySelector('#tubekit-root')).toBe(null);
  fullscreen.exit();
  await advance(300);
  const fresh = document.querySelector('#tubekit-root');
  expect(fresh).toBeTruthy();
  expect(fresh).not.toBe(root);
  expect(fresh.dataset.suspended).not.toBe('true');
  expect(selected(document)).toBe('comments');
});

test('fullscreen ending outside the two-column layout tears the panel down', async () => {
  const { document } = await setup();
  const comments = document.querySelector('#comments');
  const fullscreen = fullscreenStub();
  fullscreen.enter();
  await advance(200);
  fullscreen.exit({ width: 800 });
  await advance(300);
  expect(document.querySelector('#tubekit-root')).toBe(null);
  expect(document.querySelector('#below #comments')).toBe(comments);
  expect(document.documentElement.classList.contains('tubekit-suspended')).toBe(false);
});

test('theater mode tears the panel down instead of holding it, although YouTube sets full-bleed-player there as in fullscreen', async () => {
  const { document, watch } = await setup();
  await theater(watch);
  expect(document.querySelector('#tubekit-root')).toBe(null);
});

describe('lifecycle rules', () => {
  const onA = { videoId: 'A', tab: 'related' };
  const released = (rememberedTab = null) => ({ phase: 'released', rememberedTab });
  const shown = (rememberedTab = null) => ({ phase: 'shown', rememberedTab });
  const held = (rememberedTab = null) => ({ phase: 'held', rememberedTab });
  const idle = {
    navigating: false,
    videoId: 'A',
    twoColumn: false,
    fullscreen: false,
    youtubePanel: false,
    wrongGeneration: false,
    brokenRoot: false,
    currentTab: null,
  };
  const offScreen = facts => ({ ...idle, ...facts });
  const onScreen = facts => ({ ...idle, twoColumn: true, currentTab: onA, ...facts });
  const inFullscreen = facts => ({ ...idle, fullscreen: true, currentTab: onA, ...facts });
  const names = effects => effects.map(effect => (effect.type === 'mount' ? `mount:${effect.tab}` : effect.type));

  test.each([
    ['the panel starts released', initialLifecycle, offScreen(), released(), []],
    ['two-column layout shows the panel on the comments tab', released(), onScreen({ currentTab: null }), shown(), ['mount:comments']],
    ['no panel outside the two-column layout', released(), offScreen(), released(), []],
    ['fullscreen alone never shows the panel', released(), inFullscreen({ currentTab: null }), released(), []],
    ['a YouTube panel open when the layout appears shows the panel held', released(), onScreen({ currentTab: null, youtubePanel: true }), held(), ['mount:comments', 'saveScroll', 'hide']],
    ['shown panel stays put while nothing changes', shown(), onScreen(), shown(), []],

    ['leaving the two-column layout releases and remembers the tab', shown(), offScreen({ currentTab: onA }), released(onA), ['teardown']],
    ['the same video back in the two-column layout resumes the remembered tab', released(onA), onScreen({ currentTab: null }), shown(onA), ['mount:related']],
    ['another video does not resume the remembered tab', released(onA), onScreen({ videoId: 'B', currentTab: null }), shown(), ['mount:comments']],
    ['seeing another video forgets the remembered tab', released(onA), offScreen({ videoId: 'B' }), released(), []],
    ['leaving the watch page forgets the remembered tab', released(onA), offScreen({ videoId: null }), released(), []],
    ['navigation start releases and forgets the tab', shown(), onScreen({ navigating: true }), released(), ['teardown']],
    ['navigation start forgets the tab of an already released panel', released(onA), offScreen({ navigating: true }), released(), []],
    ['navigation start never shows the panel', released(), onScreen({ navigating: true, currentTab: null }), released(), []],
    ['fullscreen holds instead of releasing', shown(), inFullscreen(), held(), ['saveScroll', 'hide']],

    ['a YouTube panel holds a shown panel', shown(), onScreen({ youtubePanel: true }), held(), ['saveScroll', 'hide']],
    ['the hold lasts while the YouTube panel stays open', held(), onScreen({ youtubePanel: true }), held(), []],
    ['the hold lasts while either cause remains', held(), inFullscreen({ youtubePanel: true }), held(), []],
    ['the hold lasts through fullscreen even when the YouTube panel is not detected there', held(), inFullscreen(), held(), []],
    ['fullscreen ending with a YouTube panel still open keeps the hold without restoring a tab', held(), onScreen({ youtubePanel: true }), held(), []],
    ['all causes gone shows the panel again on the active tab', held(), onScreen(), shown(), ['unhide', 'restoreTab']],
    ['fullscreen ending outside the two-column layout releases', held(), offScreen({ currentTab: onA }), released(onA), ['teardown']],
    ['leaving the two-column layout while a YouTube panel holds releases', held(), offScreen({ youtubePanel: true, currentTab: onA }), released(onA), ['teardown']],
    ['the video changing during fullscreen releases without showing', held(), inFullscreen({ wrongGeneration: true, videoId: 'B' }), released(), ['teardown']],
    ['the video changing while a YouTube panel holds releases and shows the new video fresh', held(), onScreen({ wrongGeneration: true, videoId: 'B' }), shown(), ['teardown', 'mount:comments']],
    ['the video changing on a shown panel releases at once', shown(), offScreen({ wrongGeneration: true, videoId: 'B', currentTab: onA }), released(), ['teardown']],

    ['a root YouTube detached is released and shown again on the same tab', shown(), onScreen({ brokenRoot: true }), shown(onA), ['teardown', 'mount:related']],
    ['a held root YouTube detached is rebuilt still held', held(), onScreen({ brokenRoot: true, youtubePanel: true }), held(onA), ['teardown', 'mount:related', 'saveScroll', 'hide']],
    ['a root YouTube detached during fullscreen is released', held(), inFullscreen({ brokenRoot: true }), released(onA), ['teardown']],
  ])('%s', (_name, before, observation, after, effects) => {
    const result = step(before, observation);
    expect(result.state).toStrictEqual(after);
    expect(names(result.effects)).toStrictEqual(effects);
  });

  test.each([
    ['shown', onScreen({ currentTab: null }), ['mount:related']],
    ['held', onScreen({ currentTab: null, youtubePanel: true }), ['mount:related', 'saveScroll', 'hide']],
  ])('a mount YouTube was not ready for, about to be %s, stays released and keeps the remembered tab for the next try', (phase, observation, effects) => {
    const { state: next, effects: planned } = step(released(onA), observation);
    expect(next.phase).toBe(phase);
    expect(names(planned)).toStrictEqual(effects);
    expect(mountFailed(next)).toStrictEqual(released(onA));
  });

  const run = (start, observations) => {
    let state = start;
    return observations.map(observation => {
      const result = step(state, observation);
      state = result.state;
      return [state.phase, names(result.effects)];
    });
  };

  const hold = ['held', ['saveScroll', 'hide']];
  const stay = ['held', []];
  const show = ['shown', ['unhide', 'restoreTab']];

  test.each([
    ['panel opened before fullscreen, closed after it', [
      [onScreen({ youtubePanel: true }), hold], [inFullscreen(), stay], [onScreen({ youtubePanel: true }), stay], [onScreen(), show],
    ]],
    ['panel opened before fullscreen, closed during it', [
      [onScreen({ youtubePanel: true }), hold], [inFullscreen(), stay], [onScreen(), show],
    ]],
    ['panel opened during fullscreen, closed after it', [
      [inFullscreen(), hold], [inFullscreen({ youtubePanel: true }), stay], [onScreen({ youtubePanel: true }), stay], [onScreen(), show],
    ]],
    ['panel opened and closed during fullscreen', [
      [inFullscreen(), hold], [inFullscreen({ youtubePanel: true }), stay], [inFullscreen(), stay], [onScreen(), show],
    ]],
    ['panel opened after fullscreen', [
      [inFullscreen(), hold], [onScreen({ youtubePanel: true }), stay], [onScreen(), show],
    ]],
  ])('fullscreen and a YouTube panel: %s', (_name, steps) => {
    expect(run(shown(), steps.map(([observation]) => observation))).toStrictEqual(steps.map(([, expected]) => expected));
  });

  test('a tab remembered on one video is not resumed after another video was seen in between', () => {
    expect(run(released(onA), [offScreen({ videoId: 'B' }), onScreen({ currentTab: null })])).toStrictEqual([
      ['released', []],
      ['shown', ['mount:comments']],
    ]);
  });

});

const HEADER = '<ytd-comments-header-renderer></ytd-comments-header-renderer>';
const MESSAGE = '<ytd-message-renderer>Comments are turned off</ytd-message-renderer>';
const CHAT = '<ytd-live-chat-frame></ytd-live-chat-frame>';

function borrowPage(videoId = 'A') {
  loadPage({
    url: `https://www.youtube.com/watch?v=${videoId}`,
    body: `<ytd-watch-flexy video-id="${videoId}"><div id="primary"><div id="below"></div></div>
      <div id="secondary"><div id="secondary-inner"><div id="related">related</div></div></div></ytd-watch-flexy>
      <section id="tubekit-root"><div id="tubekit-comments-pane"></div><div id="tubekit-related-pane"></div></section>`,
  });
  return {
    watch: document.querySelector('ytd-watch-flexy'),
    root: document.querySelector('#tubekit-root'),
    commentsPane: document.querySelector('#tubekit-comments-pane'),
    relatedPane: document.querySelector('#tubekit-related-pane'),
    below: document.querySelector('#below'),
    inner: document.querySelector('#secondary-inner'),
  };
}

function nativeComments(html = '', attributes = '') {
  const node = document.createElement('ytd-comments');
  node.id = 'comments';
  for (const name of attributes.split(' ').filter(Boolean)) node.setAttribute(name, '');
  node.innerHTML = html;
  return node;
}

function comments() {
  return document.querySelector('ytd-comments#comments');
}

function startLoader({ videoId = 'A', content = null, attributes = '', start = true } = {}) {
  const page = borrowPage(videoId);
  if (content !== null) page.below.append(nativeComments(content, attributes));
  const region = createCommentsRegion(page.commentsPane, page.root);
  const states = [];
  const loader = createCommentsLoader({ region, watch: page.watch, videoId, onChange: state => states.push(state) });
  onCleanup(() => loader.dispose());
  if (start) loader.start();
  return { ...page, region, loader, states };
}

describe('comments loader', () => {
  test('comments that appear late go from loading to loaded', async () => {
    const { loader, below, states, region } = startLoader();
    expect(loader.state).toBe('loading');
    await advance(1000);
    below.append(nativeComments());
    await advance(300);
    expect(region.node).toBe(comments());
    expect(loader.state).toBe('loading');
    comments().insertAdjacentHTML('beforeend', HEADER);
    await advance(300);
    expect(loader.state).toBe('loaded');
    expect(states).toStrictEqual(['loaded']);
    expect(vi.getTimerCount()).toBe(0);
  });

  test('comments present at the start are loaded at once', () => {
    const { loader, states } = startLoader({ content: HEADER });
    expect(loader.state).toBe('loaded');
    expect(states).toStrictEqual(['loaded']);
  });

  test('comments that never appear fail after 20 seconds', async () => {
    const { loader, states } = startLoader();
    await advance(19_700);
    expect(loader.state).toBe('loading');
    await advance(600);
    expect(loader.state).toBe('failed');
    expect(states).toStrictEqual(['failed']);
    await advance(30_000);
    expect(states).toStrictEqual(['failed']);
    expect(vi.getTimerCount()).toBe(0);
  });

  test('comments that appear after the failure are loaded', async () => {
    const { loader, states } = startLoader({ content: '' });
    await advance(21_000);
    expect(loader.state).toBe('failed');
    comments().insertAdjacentHTML('beforeend', HEADER);
    await advance(300);
    expect(states).toStrictEqual(['failed', 'loaded']);
  });

  test('comments the uploader turns off after the failure are turned off', async () => {
    const { loader, states } = startLoader({ content: '' });
    await advance(21_000);
    comments().insertAdjacentHTML('beforeend', MESSAGE);
    await advance(300);
    expect(states).toStrictEqual(['failed', 'off']);
    expect(loader.state).toBe('off');
  });

  test('comments the uploader turned off are decided at once', () => {
    const { loader, states } = startLoader({ content: MESSAGE });
    expect(loader.state).toBe('off');
    expect(states).toStrictEqual(['off']);
  });

  test('a message beside a header or a thread does not turn comments off', () => {
    for (const content of [`${MESSAGE}${HEADER}`, `${MESSAGE}<ytd-comment-thread-renderer></ytd-comment-thread-renderer>`]) {
      const { loader, states } = startLoader({ content });
      expect(loader.state, content).toBe('loaded');
      expect(states, content).toStrictEqual(['loaded']);
    }
  });

  test('comments whose off message goes away are no longer off', async () => {
    const { loader, states } = startLoader({ content: MESSAGE });
    comments().innerHTML = '';
    await advance(300);
    expect(states).toStrictEqual(['off', 'loaded']);
    expect(loader.state).toBe('loaded');
  });

  test('comments that turn into a message after loading are turned off', async () => {
    const { loader, states } = startLoader({ content: HEADER });
    comments().innerHTML = MESSAGE;
    await advance(300);
    expect(states).toStrictEqual(['loaded', 'off']);
    expect(loader.state).toBe('off');
  });

  test('a live broadcast look is decided only after 3 seconds', async () => {
    const { loader, inner, states } = startLoader({ content: '', attributes: 'hidden' });
    inner.prepend(Object.assign(document.createElement('div'), { innerHTML: CHAT }).firstChild);
    await advance(2800);
    expect(loader.state).toBe('loading');
    await advance(600);
    expect(loader.state).toBe('off');
    expect(states).toStrictEqual(['off']);
    expect(vi.getTimerCount()).toBe(0);
  });

  test('hidden empty comments without a live chat keep loading until they fail', async () => {
    const { loader, states } = startLoader({ content: '', attributes: 'hidden' });
    await advance(10_000);
    expect(loader.state).toBe('loading');
    await advance(10_500);
    expect(states).toStrictEqual(['failed']);
  });

  test('retrying starts loading again with a fresh 20 seconds', async () => {
    const { loader, states, below } = startLoader();
    loader.retry();
    expect(states).toStrictEqual([]);
    await advance(21_000);
    expect(loader.state).toBe('failed');
    loader.retry();
    expect(loader.state).toBe('loading');
    await advance(19_700);
    expect(loader.state).toBe('loading');
    below.append(nativeComments(HEADER));
    await advance(300);
    expect(states).toStrictEqual(['failed', 'loading', 'loaded']);
  });

  test('retrying fails again after another 20 seconds', async () => {
    const { loader, states } = startLoader();
    await advance(21_000);
    loader.retry();
    await advance(20_500);
    expect(states).toStrictEqual(['failed', 'loading', 'failed']);
  });

  test('adopting comments and retrying nudge YouTube to load by scrolling', async () => {
    const { commentsPane, below, loader } = startLoader();
    const controller = new AbortController();
    onCleanup(() => controller.abort());
    const scrolls = { pane: 0, window: 0 };
    commentsPane.addEventListener('scroll', () => { scrolls.pane += 1; }, { signal: controller.signal });
    window.addEventListener('scroll', () => { scrolls.window += 1; }, { signal: controller.signal });
    below.append(nativeComments('', 'hidden'));
    await advance(320);
    expect(scrolls).toStrictEqual({ pane: 1, window: 1 });
    await advance(21_000);
    expect(loader.state).toBe('failed');
    scrolls.pane = 0;
    scrolls.window = 0;
    loader.retry();
    expect(scrolls).toStrictEqual({ pane: 1, window: 1 });
  });

  test('after being disposed nothing changes the state and no timer or observer is left', async () => {
    const { loader, below, states } = startLoader();
    await advance(500);
    loader.dispose();
    below.append(nativeComments(HEADER));
    await advance(30_000);
    expect(loader.state).toBe('loading');
    expect(states).toStrictEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  test('disposing with a check pending ignores the late change', async () => {
    const { loader, states } = startLoader({ content: '' });
    comments().insertAdjacentHTML('beforeend', HEADER);
    await Promise.resolve();
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    loader.dispose();
    expect(vi.getTimerCount()).toBe(0);
    await advance(1000);
    expect(states).toStrictEqual([]);
    loader.retry();
    loader.refresh();
    expect(states).toStrictEqual([]);
  });

  test('the loader ignores comments that outlive the video it was made for', async () => {
    const { loader, states } = startLoader({ content: '' });
    history.pushState({}, '', '/watch?v=B');
    comments().insertAdjacentHTML('beforeend', HEADER);
    await advance(600);
    expect(loader.state).toBe('loading');
    expect(states).toStrictEqual([]);
  });

  test('replaced comments load again from the start', async () => {
    const { loader, below, states, region } = startLoader({ content: HEADER });
    loader.refresh();
    expect(states).toStrictEqual(['loaded']);
    const old = comments();
    old.remove();
    const replacement = nativeComments();
    below.append(replacement);
    loader.refresh();
    expect(states).toStrictEqual(['loaded', 'loading']);
    expect(region.node).toBe(replacement);
    expect(old.isConnected).toBe(false);
    replacement.insertAdjacentHTML('beforeend', HEADER);
    await advance(300);
    expect(states).toStrictEqual(['loaded', 'loading', 'loaded']);
  });

  test('comments removed from the pane load again when new ones show up', async () => {
    const { loader, below, states } = startLoader({ content: HEADER });
    comments().remove();
    loader.refresh();
    expect(states).toStrictEqual(['loaded', 'loading']);
    await advance(1000);
    below.append(nativeComments(HEADER));
    await advance(300);
    expect(states).toStrictEqual(['loaded', 'loading', 'loaded']);
  });

  test('native comments moved out of the pane by YouTube are taken back', () => {
    const { loader, below, states, commentsPane } = startLoader({ content: HEADER });
    const node = comments();
    below.append(node);
    loader.refresh();
    expect(states).toStrictEqual(['loaded', 'loading', 'loaded']);
    expect(commentsPane.contains(node)).toBe(true);
  });
});

describe('borrowed regions', () => {
  const restoreArguments = videoId => ({ videoId });

  test('a borrowed node goes back to where it was taken from', () => {
    const { watch, root, commentsPane, below } = borrowPage();
    below.append(nativeComments(), document.createElement('footer'));
    const node = comments();
    const region = createCommentsRegion(commentsPane, root);
    expect(region.take(watch)).toBe(node);
    expect(commentsPane.contains(node)).toBe(true);
    expect(region.contains(node.firstChild ?? node)).toBe(true);
    region.restore(watch, restoreArguments('A'));
    expect(node.nextElementSibling.tagName).toBe('FOOTER');
    expect(node.parentNode).toBe(below);
    expect(region.node).toBe(null);
  });

  test('the original place is remembered only the first time, until forgotten', () => {
    const { watch, root, relatedPane, inner } = borrowPage();
    const region = createRelatedRegion(relatedPane, root);
    const first = document.querySelector('#related');
    region.take(watch);
    const second = document.createElement('div');
    second.id = 'related';
    inner.append(document.createElement('hr'), second);
    expect(region.replaced(watch)).toBe(true);
    expect(region.take(watch)).toBe(second);
    expect(first.isConnected).toBe(false);
    region.restore(watch, restoreArguments('A'));
    expect(inner.firstElementChild).toBe(second);
    expect(inner.querySelectorAll('#related').length).toBe(1);
  });

  test('forgetting drops the node and the remembered place', () => {
    const { watch, root, commentsPane, below } = borrowPage();
    below.append(nativeComments());
    const region = createCommentsRegion(commentsPane, root);
    const node = region.take(watch);
    region.forget();
    expect(node.isConnected).toBe(false);
    expect(region.node).toBe(null);
    expect(document.createTreeWalker(document, 128).nextNode()).toBe(null);
  });

  test('replaced is true for new native content or a node lost from the pane, false otherwise', () => {
    const { watch, root, commentsPane, below } = borrowPage();
    const region = createCommentsRegion(commentsPane, root);
    expect(region.replaced(watch)).toBe(false);
    below.append(nativeComments());
    expect(region.replaced(watch)).toBe(true);
    region.take(watch);
    expect(region.replaced(watch)).toBe(false);
    comments().remove();
    expect(region.replaced(watch)).toBe(true);
  });

  test('a node whose marker is gone goes into the remembered parent, or the primary content area, or the secondary column', () => {
    const { watch, root, commentsPane, relatedPane, below, inner } = borrowPage();
    below.append(nativeComments());
    const commentsRegion = createCommentsRegion(commentsPane, root);
    const relatedRegion = createRelatedRegion(relatedPane, root);
    const node = commentsRegion.take(watch);
    const related = relatedRegion.take(watch);
    removeMarkers(document);
    commentsRegion.restore(watch, restoreArguments('A'));
    relatedRegion.restore(watch, restoreArguments('A'));
    expect(node.parentNode).toBe(below);
    expect(related.parentNode).toBe(inner);

    commentsRegion.take(watch);
    removeMarkers(document);
    const fresh = document.createElement('div');
    fresh.id = 'below';
    below.replaceWith(fresh);
    commentsRegion.restore(watch, restoreArguments('A'));
    expect(node.parentNode).toBe(fresh);
  });

  test('fresh native content is kept instead of restoring a duplicate', () => {
    const { watch, root, commentsPane, relatedPane, below, inner } = borrowPage();
    below.append(nativeComments());
    const commentsRegion = createCommentsRegion(commentsPane, root);
    const relatedRegion = createRelatedRegion(relatedPane, root);
    const old = commentsRegion.take(watch);
    const oldRelated = relatedRegion.take(watch);
    const fresh = nativeComments();
    below.append(fresh);
    const freshRelated = document.createElement('div');
    freshRelated.id = 'related';
    inner.append(freshRelated);
    commentsRegion.restore(watch, restoreArguments('A'));
    relatedRegion.restore(watch, restoreArguments('A'));
    expect(comments()).toBe(fresh);
    expect(document.querySelector('#secondary-inner > #related')).toBe(freshRelated);
    expect(old.parentNode).toBe(commentsPane);
    expect(oldRelated.parentNode).toBe(relatedPane);
    expect(document.createTreeWalker(document, 128).nextNode()).toBe(null);
  });

  test('a node from another video is not restored', () => {
    const { watch, root, commentsPane, below } = borrowPage();
    below.append(nativeComments());
    const region = createCommentsRegion(commentsPane, root);
    const node = region.take(watch);
    watch.setAttribute('video-id', 'B');
    region.restore(watch, restoreArguments('A'));
    expect(node.parentNode).toBe(commentsPane);
    expect(document.createTreeWalker(document, 128).nextNode()).toBe(null);
  });

  test('related moved elsewhere by YouTube stays there, but moved comments are pulled back', () => {
    const { watch, root, commentsPane, relatedPane, below } = borrowPage();
    below.append(nativeComments());
    const relatedRegion = createRelatedRegion(relatedPane, root);
    const commentsRegion = createCommentsRegion(commentsPane, root);
    const related = relatedRegion.take(watch);
    const node = commentsRegion.take(watch);
    const spot = document.createElement('div');
    spot.id = 'spot';
    below.append(spot);
    spot.append(related);
    document.querySelector('#secondary').append(node);
    commentsRegion.restore(watch, restoreArguments('A'));
    relatedRegion.restore(watch, restoreArguments('A'));
    expect(related.parentNode).toBe(spot);
    expect(node.parentNode).toBe(below);
    expect(document.createTreeWalker(document, 128).nextNode()).toBe(null);
  });

  test('a node can be told to go right before another node outside the panel', () => {
    const { watch, root, commentsPane, relatedPane, below, inner } = borrowPage();
    below.append(nativeComments());
    const relatedRegion = createRelatedRegion(relatedPane, root);
    const commentsRegion = createCommentsRegion(commentsPane, root);
    const related = relatedRegion.take(watch);
    const node = commentsRegion.take(watch);
    commentsPane.prepend(related);
    commentsRegion.restore(watch, restoreArguments('A'));
    relatedRegion.restore(watch, { videoId: 'A', before: node });
    expect(below.firstElementChild).toBe(related);
    expect(related.nextElementSibling).toBe(node);
    expect(inner.querySelector('#related')).toBe(null);
  });
});
