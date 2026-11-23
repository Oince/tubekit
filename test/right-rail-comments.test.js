import { expect, test, vi } from 'vitest';
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

test('missing markers restore both native nodes on teardown', async () => {
  const { document, watch } = await setup();
  const comments = document.querySelector('#comments');
  const related = document.querySelector('#related');
  removeMarkers(document);
  await theater(watch);
  expect(document.querySelector('#below #comments')).toBe(comments);
  expect(document.querySelector('#secondary-inner > #related')).toBe(related);
  expect(document.querySelector('#tubekit-root')).toBe(null);
});

test('lost original parent falls back to the current primary content area', async () => {
  const { document, watch } = await setup();
  const comments = document.querySelector('#comments');
  const below = document.createElement('div');
  below.id = 'below';
  document.querySelector('#below').replaceWith(below);
  await theater(watch);
  expect(below.querySelector('#comments')).toBe(comments);
});

test('teardown preserves fresh native content without restoring duplicates', async () => {
  const { document, watch } = await setup();
  const freshComments = newComments(document);
  const freshRelated = document.createElement('div');
  freshRelated.id = 'related';
  document.querySelector('#below').append(freshComments);
  document.querySelector('#secondary-inner').append(freshRelated);
  await theater(watch);
  expect(document.querySelector('#comments')).toBe(freshComments);
  expect(document.querySelector('#related')).toBe(freshRelated);
  expect(document.querySelectorAll('#comments').length).toBe(1);
  expect(document.querySelectorAll('#related').length).toBe(1);
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

test('unavailable comments still switch to related on the current video', async () => {
  const { document } = await setup({ disabled: true });
  await advance(850);
  expect(selected(document)).toBe('related');
});

test('unavailable comments are detected structurally in any language', async () => {
  const { document } = await setup({ disabled: true, disabledText: 'コメントはオフになっています。' });
  await advance(850);
  expect(selected(document)).toBe('related');
});

test('comments with a header are not unavailable even when a message is present', async () => {
  const { document } = await setup();
  document.querySelector('#comments').insertAdjacentHTML('beforeend', '<ytd-message-renderer>Kommentare sind deaktiviert.</ytd-message-renderer>');
  await advance(1200);
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

test('thread-only comments without a header are not unavailable', async () => {
  const { document } = await setup();
  const comments = document.querySelector('#comments');
  comments.innerHTML = '<ytd-message-renderer>Kommentare sind deaktiviert.</ytd-message-renderer><ytd-comment-thread-renderer></ytd-comment-thread-renderer>';
  await advance(1300);
  expect(selected(document)).toBe('comments');
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
  const panel = document.createElement('ytd-engagement-panel-section-list-renderer');
  panel.setAttribute('visibility', 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED');
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

test('evaluation is deferred while the pane is scrolling', async () => {
  const { document } = await setup();
  expect(vi.getTimerCount()).toBe(0);
  document.querySelector('#tubekit-comments-pane').dispatchEvent(new Event('scroll'));
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
  const spyState = { value: 0, hidden: false };
  Object.defineProperty(pane, 'scrollTop', {
    configurable: true,
    get() { return spyState.hidden ? 0 : spyState.value; },
    set(v) { spyState.value = v; },
  });
  return spyState;
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
    const panel = document.createElement('ytd-engagement-panel-section-list-renderer');
    panel.setAttribute('visibility', 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED');
    document.querySelector('#secondary-inner').append(panel);
    await advance(200);
    expect(document.querySelector('#tubekit-root').dataset.suspended).toBe('true');
    panes[tab].hidden = true;
    panel.remove();
    await advance(200);
    panes[tab].hidden = false;
    await raf();
    await raf();
    expect(document.querySelector('#tubekit-root').dataset.suspended).toBe('false');
    expect(panes[tab].value, `${tab} scroll restored`).toBe(300);
  }
});

test('live streams with hidden comments beside the chat fall back to related', async () => {
  const { document } = await setup({ liveStream: true });
  await advance(3400);
  expect(selected(document)).toBe('comments');
  expect(document.querySelector('#tubekit-comments-pane .tubekit-status')).toBeTruthy();
  const chat = document.createElement('div');
  chat.id = 'chat-container';
  chat.innerHTML = '<ytd-live-chat-frame id="chat"></ytd-live-chat-frame>';
  document.querySelector('#secondary-inner').prepend(chat);
  await advance(1400);
  expect(document.querySelector('#tubekit-root').dataset.suspended).toBe('true');
  expect(selected(document)).toBe('related');
  expect(document.querySelector('#tubekit-comments-pane .tubekit-status')).toBe(null);
  chat.firstElementChild.setAttribute('collapsed', '');
  await advance(200);
  expect(document.querySelector('#tubekit-root').dataset.suspended).toBe('false');
  expect(selected(document)).toBe('related');
});

test('closing a live chat on a video with comments returns to the comments tab', async () => {
  const { document } = await setup();
  const chat = document.createElement('div');
  chat.id = 'chat-container';
  chat.innerHTML = '<ytd-live-chat-frame id="chat"></ytd-live-chat-frame>';
  document.querySelector('#secondary-inner').prepend(chat);
  await advance(200);
  expect(document.querySelector('#tubekit-root').dataset.suspended).toBe('true');
  chat.firstElementChild.setAttribute('collapsed', '');
  await advance(200);
  expect(document.querySelector('#tubekit-root').dataset.suspended).toBe('false');
  expect(selected(document)).toBe('comments');
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

test('fullscreen keeps the related tab and its scroll position', async () => {
  const { document } = await setup();
  const root = document.querySelector('#tubekit-root');
  const panes = await scrollBothTabs();
  document.querySelector('[role="tab"][data-tab="related"]').click();
  await frames();
  const fullscreen = fullscreenStub(panes);
  fullscreen.enter();
  await advance(200);
  fullscreen.exit();
  await advance(200);
  await frames();
  expect(document.querySelector('#tubekit-root'), 'not torn down').toBe(root);
  expect(selected(document)).toBe('related');
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

test('a YouTube panel open before fullscreen keeps the panel held after exit until it closes', async () => {
  const { document } = await setup();
  const root = document.querySelector('#tubekit-root');
  const panes = await scrollBothTabs();
  const panel = document.createElement('ytd-engagement-panel-section-list-renderer');
  panel.setAttribute('visibility', 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED');
  document.querySelector('#secondary-inner').append(panel);
  await advance(200);
  expect(root.dataset.suspended).toBe('true');
  panes.comments.hidden = true;
  const fullscreen = fullscreenStub(panes);
  fullscreen.enter();
  panel.setAttribute('hidden', '');
  panel.removeAttribute('hidden');
  await advance(300);
  expect(document.querySelector('#tubekit-root')).toBe(root);
  expect(root.dataset.suspended).toBe('true');
  fullscreen.exit();
  panes.comments.hidden = true;
  await advance(300);
  expect(document.querySelector('#tubekit-root')).toBe(root);
  expect(root.dataset.suspended, 'still held by the YouTube panel').toBe('true');
  panel.remove();
  await advance(200);
  panes.comments.hidden = false;
  await frames();
  expect(root.dataset.suspended).toBe('false');
  expect(selected(document)).toBe('comments');
  expect(panes.comments.value).toBe(300);
});

function expandedPanel(document) {
  const panel = document.createElement('ytd-engagement-panel-section-list-renderer');
  panel.setAttribute('visibility', 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED');
  return panel;
}

test('a YouTube panel closed during fullscreen keeps its hold until exit, then restores the tab before it', async () => {
  const { document } = await setup();
  const root = document.querySelector('#tubekit-root');
  const panes = await scrollBothTabs();
  document.querySelector('[role="tab"][data-tab="related"]').click();
  await frames();
  const panel = expandedPanel(document);
  document.querySelector('#secondary-inner').append(panel);
  await advance(200);
  expect(root.dataset.suspended).toBe('true');
  document.querySelector('[role="tab"][data-tab="comments"]').click();
  const fullscreen = fullscreenStub(panes);
  fullscreen.enter();
  panel.setAttribute('hidden', '');
  await advance(300);
  expect(selected(document), 'the YouTube panel hold is kept during fullscreen').toBe('comments');
  panel.remove();
  await advance(300);
  expect(selected(document), 'closing the YouTube panel is not handled during fullscreen').toBe('comments');
  expect(root.dataset.suspended).toBe('true');
  fullscreen.exit();
  await advance(200);
  await frames();
  expect(document.querySelector('#tubekit-root')).toBe(root);
  expect(root.dataset.suspended).toBe('false');
  expect(selected(document), 'restored to the tab before the YouTube panel').toBe('related');
  expect(panes.related.value).toBe(700);
});

test('a YouTube panel opened during fullscreen holds the panel after exit until it closes', async () => {
  const { document } = await setup();
  const root = document.querySelector('#tubekit-root');
  const panes = await scrollBothTabs();
  const fullscreen = fullscreenStub(panes);
  fullscreen.enter();
  await advance(200);
  const panel = expandedPanel(document);
  document.querySelector('#secondary-inner').append(panel);
  await advance(300);
  expect(root.dataset.suspended).toBe('true');
  fullscreen.exit();
  panes.comments.hidden = true;
  await advance(300);
  expect(document.querySelector('#tubekit-root')).toBe(root);
  expect(root.dataset.suspended, 'held by the YouTube panel after fullscreen').toBe('true');
  panel.remove();
  await advance(200);
  panes.comments.hidden = false;
  await frames();
  expect(root.dataset.suspended).toBe('false');
  expect(selected(document)).toBe('comments');
  expect(panes.comments.value).toBe(300);
});

test('comments found off during fullscreen stay on related after exit', async () => {
  const { document } = await setup();
  const panes = await scrollBothTabs();
  const fullscreen = fullscreenStub(panes);
  fullscreen.enter();
  await advance(100);
  document.querySelector('#comments').innerHTML = '<ytd-message-renderer>Comments are turned off</ytd-message-renderer>';
  await advance(1300);
  expect(selected(document)).toBe('related');
  fullscreen.exit();
  await advance(200);
  await frames();
  expect(document.querySelector('#tubekit-root').dataset.suspended).toBe('false');
  expect(selected(document)).toBe('related');
  expect(panes.related.value).toBe(700);
});

test('theater mode tears the panel down instead of holding it, although YouTube sets full-bleed-player there as in fullscreen', async () => {
  const { document, watch } = await setup();
  await theater(watch);
  expect(document.querySelector('#tubekit-root')).toBe(null);
});
