import { describe, expect, test, vi } from 'vitest';
import { createCommentsRegion, createRelatedRegion } from '../src/features/right-rail-comments/borrowed-region.js';
import { createCommentsLoader } from '../src/features/right-rail-comments/comments-loader.js';
import { initialLifecycle, mountFailed, step } from '../src/features/right-rail-comments/lifecycle.js';
import { initialPanelSelection, nextPanelSelection } from '../src/features/right-rail-comments/panel-selection.js';
import { advance, loadPage, onCleanup, startFeature, stubProperty } from './helpers.js';

const layout = { hidden: false };

function shownRects() {
  layout.hidden = false;
  return { clientRects: () => layout.hidden ? [] : [{}] };
}

async function setup({
  disabled = false,
  disabledText = 'Comments are turned off',
  innerWidth = 1440,
  twoColumns = true,
  watchAttrs = '',
  beforeStart = () => {},
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
    <ytd-watch-flexy video-id="A"${twoColumns ? ' is-two-columns_' : ''}${watchAttrs}><div id="primary"><ytd-player><div id="movie_player"></div></ytd-player><div id="below">
      <ytd-comments id="comments"${liveStream ? ' hidden disable-upgrade' : ''}>${content}</ytd-comments>
    </div></div><div id="secondary"><div id="secondary-inner">
      <div id="related">related</div>
    </div></div></ytd-watch-flexy></ytd-app></body></html>`,
    innerWidth,
    ...shownRects(),
  });
  beforeStart();
  const { stop } = await startFeature('right-rail-comments');
  await advance(200);
  if (expectRoot) expect(document.querySelector('#tubekit-root')).toBeTruthy();
  return { document, stop, watch: document.querySelector('ytd-watch-flexy') };
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
  const { document } = await setup({ innerWidth: 1194 });
  expect(document.querySelector('#tubekit-root')).toBeTruthy();
});

test('overlay scrollbar two-column layout below 1015px still creates the panel', async () => {
  const { document } = await setup({ innerWidth: 1014 });
  expect(document.querySelector('#tubekit-root')).toBeTruthy();
});

test('one-column layout does not create the panel', async () => {
  const { document } = await setup({ innerWidth: 999, twoColumns: false, expectRoot: false });
  expect(document.querySelector('#tubekit-root')).toBe(null);
});

test.each([
  ['theater attribute', ' theater'],
  ['fullscreen attribute', ' fullscreen'],
  ['theater attribute together with full-bleed-player', ' theater full-bleed-player'],
])('a two-column watch with the %s does not create the panel', async (_name, watchAttrs) => {
  const { document } = await setup({ watchAttrs, expectRoot: false });
  expect(document.querySelector('#tubekit-root')).toBe(null);
});

test('the browser fullscreen alone, without any watch attribute, does not create the panel', async () => {
  await setup({
    beforeStart: () => stubProperty(document, 'fullscreenElement', { get: () => document.documentElement }),
    expectRoot: false,
  });
  expect(document.querySelector('#tubekit-root')).toBe(null);
});

test('YouTube markers that no longer decide the two-column screen are ignored', async () => {
  const { document } = await setup({ watchAttrs: ' miniplayer' });
  expect(document.querySelector('#tubekit-root')).toBeTruthy();
  document.body.insertAdjacentHTML('beforeend', '<ytd-miniplayer active></ytd-miniplayer>');
  document.querySelector('ytd-watch-flexy').setAttribute('full-bleed-player', '');
  await advance(300);
  expect(document.querySelector('#tubekit-root')).toBeTruthy();
});

test('a hidden watch page still counts as the two-column screen', async () => {
  const { document } = await setup({ watchAttrs: ' hidden' });
  expect(document.querySelector('#tubekit-root')).toBeTruthy();
});

test('CSS hides the panel and releases the right column overrides in every state outside the two-column screen', async () => {
  const { document, watch, stop } = await setup();
  stop();
  const secondary = document.querySelector('#secondary');
  const probe = document.createElement('div');
  probe.id = 'tubekit-root';
  document.querySelector('#below').append(probe);
  const states = [
    ['two columns', () => {}, true],
    ['one column', () => watch.removeAttribute('is-two-columns_'), false],
    ['two columns again', () => watch.setAttribute('is-two-columns_', ''), true],
    ['theater', () => watch.setAttribute('theater', ''), false],
    ['theater with fullscreen', () => watch.setAttribute('fullscreen', ''), false],
    ['fullscreen only', () => watch.removeAttribute('theater'), false],
    ['back to two columns', () => watch.removeAttribute('fullscreen'), true],
  ];
  for (const [name, apply, twoColumn] of states) {
    apply();
    expect(getComputedStyle(probe).display, `${name}: panel root`).toBe(twoColumn ? 'flex' : 'none');
    const clipped = getComputedStyle(secondary).overflowY === 'clip';
    expect(clipped, `${name}: right column overrides`).toBe(twoColumn);
    const sticky = getComputedStyle(secondary).position === 'sticky';
    expect(sticky, `${name}: sticky right column`).toBe(twoColumn);
  }
});

test('the app observer watches every attribute the two-column screen and the page video are read from', async () => {
  const filters = [];
  const original = MutationObserver.prototype.observe;
  loadPage({ html: '<html lang="en"><head></head><body><ytd-app></ytd-app></body></html>', ...shownRects() });
  vi.spyOn(MutationObserver.prototype, 'observe').mockImplementation(function (target, options) {
    if (options?.attributeFilter) filters.push(...options.attributeFilter);
    return original.call(this, target, options);
  });
  await startFeature('right-rail-comments');
  document.body.append(document.createElement('div'));
  await advance(200);
  for (const name of ['is-two-columns_', 'theater', 'fullscreen', 'video-id', 'hidden']) expect(filters, name).toContain(name);
});

test('the theater attribute takes the panel down and returns the related list at once, without advancing timers', async () => {
  const { document, watch } = await setup();
  const related = document.querySelector('#related');
  const comments = document.querySelector('#comments');
  watch.setAttribute('theater', '');
  await mutationsSettle();
  expect(document.querySelector('#tubekit-root')).toBe(null);
  expect(document.querySelector('#secondary-inner > #related')).toBe(related);
  expect(document.querySelector('#below > #comments')).toBe(comments);
  expect(document.documentElement.classList.contains('tubekit-active')).toBe(false);
});

test('removing the theater attribute stands the panel up at once, without advancing timers', async () => {
  const { document, watch } = await setup({ watchAttrs: ' theater', expectRoot: false });
  expect(document.querySelector('#tubekit-root')).toBe(null);
  watch.removeAttribute('theater');
  await mutationsSettle();
  expect(document.querySelector('#tubekit-root')).toBeTruthy();
  expect(document.querySelector('#tubekit-related-pane #related')).toBeTruthy();
  expect(document.querySelector('#tubekit-comments-pane #comments')).toBeTruthy();
});

test('the two-column attribute appearing stands the panel up at once, and its removal takes it down at once', async () => {
  const { document, watch } = await setup({ twoColumns: false, expectRoot: false });
  watch.setAttribute('is-two-columns_', '');
  await mutationsSettle();
  expect(document.querySelector('#tubekit-root')).toBeTruthy();
  watch.removeAttribute('is-two-columns_');
  await mutationsSettle();
  expect(document.querySelector('#tubekit-root')).toBe(null);
  expect(document.querySelector('#secondary-inner > #related')).toBeTruthy();
});

test('the fullscreen attribute holds the panel at once, and removing it shows the panel again at once', async () => {
  const { document, watch } = await setup();
  const root = document.querySelector('#tubekit-root');
  watch.setAttribute('fullscreen', '');
  await mutationsSettle();
  expect(root.dataset.suspended).toBe('true');
  watch.removeAttribute('fullscreen');
  await mutationsSettle();
  expect(document.querySelector('#tubekit-root')).toBe(root);
  expect(root.dataset.suspended).toBe('false');
});

test('the watch video-id reaching the new address video swaps the old panel for a fresh one at once', async () => {
  const { document, watch } = await setup();
  const root = document.querySelector('#tubekit-root');
  history.pushState({}, '', '/watch?v=B');
  watch.setAttribute('video-id', 'B');
  await mutationsSettle();
  const fresh = document.querySelector('#tubekit-root');
  expect(fresh).toBeTruthy();
  expect(fresh).not.toBe(root);
  expect(root.isConnected).toBe(false);
});

test('the immediate decision still waits for a related list, then stands the panel up on the next change', async () => {
  const { document, watch } = await setup({ watchAttrs: ' theater', expectRoot: false });
  const related = document.querySelector('#related');
  related.remove();
  watch.removeAttribute('theater');
  await mutationsSettle();
  expect(document.querySelector('#tubekit-root')).toBe(null);
  document.querySelector('#secondary-inner').append(related);
  await mutationsSettle();
  expect(document.querySelector('#tubekit-root')).toBeTruthy();
});

test('the immediate decision ignores changes inside the adopted comments but not other changes', async () => {
  const { document } = await setup();
  const root = document.querySelector('#tubekit-root');
  stubProperty(document, 'fullscreenElement', { get: () => document.documentElement });
  document.querySelector('#comments').appendChild(document.createElement('ytd-comment-thread-renderer'));
  await mutationsSettle();
  expect(root.dataset.suspended).toBe('false');
  document.querySelector('#below').appendChild(document.createElement('div'));
  await mutationsSettle();
  expect(root.dataset.suspended).toBe('true');
});

test('the immediate decision measures neither the YouTube panel nor the watch page, the maintenance pass measures the panel', async () => {
  const { document, watch } = await setup();
  const chat = document.createElement('ytd-live-chat-frame');
  const measured = vi.fn(() => [{}]);
  chat.getClientRects = measured;
  document.querySelector('#secondary-inner').append(chat);
  await advance(300);
  expect(document.querySelector('#tubekit-root').dataset.suspended).toBe('true');
  measured.mockClear();
  const watchMeasured = vi.fn(() => [{}]);
  watch.getClientRects = watchMeasured;
  document.querySelector('#below').appendChild(document.createElement('div'));
  await mutationsSettle();
  expect(measured).not.toHaveBeenCalled();
  expect(watchMeasured).not.toHaveBeenCalled();
  await advance(300);
  expect(measured).toHaveBeenCalled();
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

test('the comments element YouTube reuses for the next video passes to the new panel once the page shows that video', async () => {
  const { document, watch } = await setup();
  const reused = document.querySelector('#comments');
  history.pushState({}, '', '/watch?v=B');
  await advance(100);
  reused.replaceChildren();
  await advance(100);
  expect(document.querySelector('#tubekit-comments-pane #comments')).toBe(reused);
  watch.setAttribute('video-id', 'B');
  await mutationsSettle();
  const pane = document.querySelector('#tubekit-comments-pane');
  expect(pane.querySelector('#comments')).toBe(reused);
  expect(document.querySelector('#primary #comments')).toBe(null);
  expect(document.querySelectorAll('#comments').length).toBe(1);
  expect(pane.querySelector('.tubekit-status').dataset.kind).toBe('loading');
  reused.append(document.createElement('ytd-comments-header-renderer'));
  await advance(600);
  expect(document.querySelector('.tubekit-status')).toBe(null);
  await advance(30_000);
  expect(document.querySelector('.tubekit-status')).toBe(null);
  expect(pane.querySelector('#comments')).toBe(reused);
  expect(selected(document)).toBe('comments');
});


test('unavailable timer from the previous video cannot switch the new tab', async () => {
  const { document, watch } = await setup({ disabled: true });
  document.dispatchEvent(new Event('yt-navigate-start'));
  history.pushState({}, '', '/watch?v=B');
  watch.setAttribute('video-id', 'B');
  document.querySelector('#below').append(newComments(document));
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
  const { document, watch } = await setup();
  document.dispatchEvent(new Event('yt-navigate-start'));
  history.pushState({}, '', '/');
  watch.setAttribute('hidden', '');
  await advance(400);
  expect(document.querySelector('#tubekit-root')).toBe(null);
  expect(vi.getTimerCount()).toBe(0);
  document.querySelector('ytd-app').appendChild(document.createElement('div'));
  await mutationsSettle();
  expect(vi.getTimerCount()).toBe(0);
  await advance(400);
  history.pushState({}, '', '/watch?v=A');
  watch.removeAttribute('hidden');
  document.dispatchEvent(new Event('yt-navigate-finish'));
  await advance(500);
  expect(document.querySelector('#tubekit-root')).toBeTruthy();
});

test('booting off the watch page ignores DOM changes, then builds the panel on /watch', async () => {
  loadPage({
    url: 'https://www.youtube.com/',
    html: '<html lang="en"><head></head><body></body></html>',
    innerWidth: 1440,
    ...shownRects(),
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

test('a YouTube panel keeps the right column box of the comments panel, and closing it shows the comments panel again', async () => {
  const { document } = await setup();
  const secondary = document.querySelector('#secondary');
  expect(getComputedStyle(secondary).overflowY).toBe('clip');
  const panel = expandedPanel(document);
  document.querySelector('#secondary-inner').append(panel);
  await advance(200);
  expect(document.querySelector('#tubekit-root').dataset.suspended).toBe('true');
  expect(document.documentElement.classList.contains('tubekit-youtube-panels')).toBe(true);
  expect(getComputedStyle(secondary).overflowY).toBe('clip');
  expect(getComputedStyle(secondary).position).toBe('sticky');
  expect(panel.getAttribute('data-tubekit-panel')).toBe('shown');
  panel.remove();
  await advance(200);
  expect(document.querySelector('#tubekit-root').dataset.suspended).toBe('false');
  expect(document.documentElement.classList.contains('tubekit-youtube-panels')).toBe(false);
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
  const lightRule = css.match(/#tubekit-root,\s*#tubekit-youtube-tabs \{[^}]*\}/);
  const darkRule = css.match(/html\[dark\] #tubekit-root,\s*html\[dark\] #tubekit-youtube-tabs \{[^}]*\}/);
  const rootRule = css.match(/#tubekit-root \{[^}]*\}/);
  expect(lightRule && darkRule, 'light and dark rules exist').toBeTruthy();
  expect(darkRule[0]).toMatch(/color-scheme: dark;/);
  const light = parseTokens(lightRule[0]);
  const dark = parseTokens(darkRule[0]);
  expect([...light.keys()].sort()).toStrictEqual([...dark.keys()].sort());
  expect(light).toStrictEqual(expectedTokens(LIGHT));
  expect(dark).toStrictEqual(expectedTokens(DARK));
  expect(rootRule[0]).toMatch(/color: var\(--tubekit-text\);/);
  expect(rootRule[0]).toMatch(/background: var\(--tubekit-bg\);/);
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
  const style = getComputedStyle(document.querySelector('#secondary'));
  expect(style.marginTop).toBe('12px');
  expect(style.paddingTop).toBe('0px');
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

test('fullscreen ending while a YouTube panel is open keeps the panel held and the saved scroll positions, even when the attribute leaves first', async () => {
  const { document, watch } = await setup();
  const root = document.querySelector('#tubekit-root');
  const panes = await scrollBothTabs();
  const panel = expandedPanel(document);
  document.querySelector('#secondary-inner').append(panel);
  await advance(16);
  expect(root.dataset.suspended).toBe('true');
  Object.values(panes).forEach(pane => { pane.hidden = true; });
  let element = null;
  stubProperty(document, 'fullscreenElement', { get: () => element });
  const fullscreenChange = () => document.documentElement.dispatchEvent(new Event('fullscreenchange', { bubbles: true }));
  element = document.documentElement;
  for (const name of ['fullscreen', 'full-bleed-player']) watch.setAttribute(name, '');
  layout.hidden = true;
  fullscreenChange();
  await advance(200);
  expect(root.dataset.suspended).toBe('true');
  element = null;
  for (const name of ['fullscreen', 'full-bleed-player']) watch.removeAttribute(name);
  layout.hidden = false;
  await mutationsSettle();
  expect(root.dataset.suspended, 'not revealed when the attribute leaves').toBe('true');
  fullscreenChange();
  await advance(200);
  await frames();
  expect(document.querySelector('#tubekit-root')).toBe(root);
  expect(root.dataset.suspended, 'still held after the maintenance pass').toBe('true');
  panel.remove();
  await advance(16);
  expect(root.dataset.suspended).toBe('false');
  Object.values(panes).forEach(pane => { pane.hidden = false; });
  await frames();
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

describe('moving to another video', () => {
  const moveAddress = (videoId) => {
    document.dispatchEvent(new Event('yt-navigate-start'));
    history.pushState({}, '', `/watch?v=${videoId}`);
  };

  const pageMoves = (watch, videoId) => watch.setAttribute('video-id', videoId);

  async function setupOnRelated() {
    const page = await setup();
    const panes = await scrollBothTabs();
    document.querySelector('#tubekit-related-tab').click();
    await frames();
    return { ...page, panes, root: document.querySelector('#tubekit-root'), related: document.querySelector('#related') };
  }

  function expectPanelUntouched({ root, related, panes }) {
    expect(document.querySelector('#tubekit-root')).toBe(root);
    expect(related.parentNode).toBe(document.querySelector('#tubekit-related-pane'));
    expect(document.querySelector('#secondary-inner > #related')).toBe(null);
    expect(document.querySelector('#primary #comments')).toBe(null);
    expect(root.dataset.suspended).toBe('false');
    expect(selected(document)).toBe('related');
    expect(panes.related.value).toBe(700);
    expect(document.querySelector('.tubekit-status')).toBe(null);
  }

  test('the panel stays as it is while the address names a new video and the page still shows the old one', async () => {
    const { document, watch, ...page } = await setupOnRelated();
    moveAddress('B');
    await advance(500);
    expectPanelUntouched(page);
    document.querySelector('#below').append(document.createElement('div'));
    window.dispatchEvent(new Event('resize'));
    await advance(60_000);
    expectPanelUntouched(page);
    expect(watch.getAttribute('video-id')).toBe('A');
    document.querySelector('#tubekit-comments-tab').click();
    expect(selected(document)).toBe('comments');
  });

  test('the page reaching the new video swaps the panel in the same step and opens the comments tab', async () => {
    const { document, watch, root, related, panes } = await setupOnRelated();
    moveAddress('B');
    await advance(500);
    expect(panes.related.value).toBe(700);
    pageMoves(watch, 'B');
    await mutationsSettle();
    const fresh = document.querySelector('#tubekit-root');
    expect(fresh).toBeTruthy();
    expect(fresh).not.toBe(root);
    expect(document.querySelectorAll('#tubekit-root').length).toBe(1);
    expect(selected(document)).toBe('comments');
    expect(fresh.dataset.suspended).toBe('false');
    expect(document.querySelector('#tubekit-related-pane #related')).toBe(related);
    expect(document.querySelector('#secondary-inner > #related')).toBe(null);
    const arriving = newComments(document);
    document.querySelector('#below').append(arriving);
    await advance(500);
    expect(document.querySelector('#tubekit-comments-pane #comments')).toBe(arriving);
    expect(document.querySelector('.tubekit-status')).toBe(null);
  });

  test('going back to the old video after the page moved on shows a fresh panel on the comments tab', async () => {
    const { document, watch } = await setupOnRelated();
    moveAddress('B');
    pageMoves(watch, 'B');
    await advance(300);
    document.querySelector('#tubekit-related-tab').click();
    history.pushState({}, '', '/watch?v=A');
    pageMoves(watch, 'A');
    await mutationsSettle();
    expect(selected(document)).toBe('comments');
  });

  test('a navigation that ends on the same video keeps the tab and the scroll position', async () => {
    const page = await setupOnRelated();
    document.dispatchEvent(new Event('yt-navigate-start'));
    await advance(500);
    expectPanelUntouched(page);
    moveAddress('A');
    await advance(500);
    expectPanelUntouched(page);
    moveAddress('B');
    await advance(500);
    document.dispatchEvent(new Event('yt-navigate-start'));
    history.pushState({}, '', '/watch?v=A');
    window.dispatchEvent(new Event('popstate'));
    await advance(500);
    expectPanelUntouched(page);
    document.dispatchEvent(new Event('yt-navigate-finish'));
    await advance(500);
    expectPanelUntouched(page);
  });

  test('leaving the two-column layout while the page lags behind takes the panel down and gives the lists back', async () => {
    const { document } = await setup();
    const comments = document.querySelector('#comments');
    const related = document.querySelector('#related');
    moveAddress('B');
    await advance(300);
    expect(document.querySelector('#tubekit-root')).toBeTruthy();
    collapseToOneColumn();
    await advance(300);
    expect(document.querySelector('#tubekit-root')).toBe(null);
    expect(document.querySelector('#secondary-inner > #related')).toBe(related);
    expect(document.querySelector('#below > #comments')).toBe(comments);
    expect(document.documentElement.classList.contains('tubekit-active')).toBe(false);
  });

  test.each([
    ['the home page', '/'],
    ['the search results', '/results?search_query=news'],
  ])('leaving for %s keeps the panel until the watch page is hidden, then gives the lists back', async (_name, address) => {
    const { document, watch } = await setup();
    const root = document.querySelector('#tubekit-root');
    const related = document.querySelector('#related');
    const comments = document.querySelector('#comments');
    document.querySelector('#tubekit-related-tab').click();
    document.dispatchEvent(new Event('yt-navigate-start'));
    history.pushState({}, '', address);
    await advance(5000);
    expect(document.querySelector('#tubekit-root')).toBe(root);
    expect(related.parentNode).toBe(document.querySelector('#tubekit-related-pane'));
    expect(document.querySelector('#secondary-inner > #related')).toBe(null);
    expect(selected(document)).toBe('related');
    expect(root.dataset.suspended).toBe('false');
    watch.setAttribute('hidden', '');
    await mutationsSettle();
    expect(document.querySelector('#tubekit-root')).toBe(null);
    expect(document.querySelector('#secondary-inner > #related')).toBe(related);
    expect(document.querySelector('#below > #comments')).toBe(comments);
    expect(document.documentElement.classList.contains('tubekit-active')).toBe(false);
  });

  test('changes to other hidden elements while leaving the watch page do not take the panel down', async () => {
    const { document } = await setup();
    const root = document.querySelector('#tubekit-root');
    history.pushState({}, '', '/');
    const other = document.createElement('div');
    document.querySelector('#below').append(other);
    other.setAttribute('hidden', '');
    await advance(300);
    expect(document.querySelector('#tubekit-root')).toBe(root);
  });

  test('coming back to the same video after another screen starts the panel fresh on the comments tab', async () => {
    const { document, watch } = await setup();
    document.querySelector('#tubekit-related-tab').click();
    document.dispatchEvent(new Event('yt-navigate-start'));
    history.pushState({}, '', '/');
    watch.setAttribute('hidden', '');
    await advance(300);
    expect(document.querySelector('#tubekit-root')).toBe(null);
    history.pushState({}, '', '/watch?v=A');
    watch.removeAttribute('hidden');
    document.dispatchEvent(new Event('yt-navigate-finish'));
    await advance(500);
    expect(document.querySelector('#tubekit-root')).toBeTruthy();
    expect(selected(document)).toBe('comments');
  });

  test('going back to the same video before the other screen is drawn keeps the panel and its tab', async () => {
    const { document } = await setup();
    const root = document.querySelector('#tubekit-root');
    document.querySelector('#tubekit-related-tab').click();
    document.dispatchEvent(new Event('yt-navigate-start'));
    history.pushState({}, '', '/');
    await advance(500);
    history.pushState({}, '', '/watch?v=A');
    window.dispatchEvent(new Event('popstate'));
    await advance(500);
    expect(document.querySelector('#tubekit-root')).toBe(root);
    expect(selected(document)).toBe('related');
  });

  test('leaving the two-column layout on another screen takes the panel down', async () => {
    const { document } = await setup();
    history.pushState({}, '', '/');
    await advance(300);
    expect(document.querySelector('#tubekit-root')).toBeTruthy();
    collapseToOneColumn();
    await advance(300);
    expect(document.querySelector('#tubekit-root')).toBe(null);
  });

  test('fullscreen during the lag holds the panel, and the page reaching the new video then releases it', async () => {
    const { document, watch } = await setup();
    const root = document.querySelector('#tubekit-root');
    const fullscreen = fullscreenStub();
    moveAddress('B');
    await advance(300);
    fullscreen.enter();
    await advance(200);
    expect(document.querySelector('#tubekit-root')).toBe(root);
    expect(root.dataset.suspended).toBe('true');
    pageMoves(watch, 'B');
    await advance(200);
    expect(document.querySelector('#tubekit-root')).toBe(null);
  });

  test('YouTube emptying or replacing the comments during the lag raises no notice, switches no tab and shows no error', async () => {
    const { document } = await setup();
    const toast = document.querySelector('#tubekit-toast');
    moveAddress('B');
    document.querySelector('#comments').innerHTML = '';
    await advance(30_000);
    document.querySelector('#comments').innerHTML = '<ytd-message-renderer>Comments are turned off</ytd-message-renderer>';
    await advance(30_000);
    document.querySelector('#comments').innerHTML = '';
    document.querySelector('#comments').setAttribute('hidden', '');
    document.querySelector('#secondary-inner').prepend(document.createElement('ytd-live-chat-frame'));
    await advance(30_000);
    expect(toast.dataset.visible).not.toBe('true');
    expect(toast.textContent).toBe('');
    expect(selected(document)).toBe('comments');
    expect(document.querySelector('.tubekit-status')).toBe(null);
    expect(document.querySelector('#tubekit-root')).toBeTruthy();
  });

  test('YouTube taking the comments away during the lag shows no error however long the lag lasts', async () => {
    const { document, watch } = await setup();
    moveAddress('B');
    document.querySelector('#comments').remove();
    await advance(60_000);
    expect(selected(document)).toBe('comments');
    expect(document.querySelector('#tubekit-toast').textContent).toBe('');
    expect(document.querySelector('.tubekit-status')).toBe(null);
    pageMoves(watch, 'B');
    await mutationsSettle();
    expect(document.querySelector('#tubekit-root')).toBeTruthy();
    expect(selected(document)).toBe('comments');
  });

  test('comments YouTube puts in place of the old ones during the lag are taken without a loading box', async () => {
    const { document } = await setup();
    const old = document.querySelector('#comments');
    moveAddress('B');
    old.remove();
    const replacement = newComments(document);
    replacement.replaceChildren();
    document.querySelector('#below').append(replacement);
    await advance(30_000);
    expect(document.querySelector('#tubekit-comments-pane #comments')).toBe(replacement);
    expect(document.querySelector('#primary #comments')).toBe(null);
    expect(document.querySelector('.tubekit-status')).toBe(null);
    expect(document.querySelector('#tubekit-toast').textContent).toBe('');
  });

  test('the page video-id being emptied for a moment keeps the panel, and the new video then swaps it', async () => {
    const { document, watch } = await setup();
    const root = document.querySelector('#tubekit-root');
    const related = document.querySelector('#related');
    moveAddress('B');
    watch.setAttribute('video-id', '');
    await advance(500);
    expect(document.querySelector('#tubekit-root')).toBe(root);
    expect(related.parentNode).toBe(document.querySelector('#tubekit-related-pane'));
    pageMoves(watch, 'B');
    await mutationsSettle();
    const fresh = document.querySelector('#tubekit-root');
    expect(fresh).not.toBe(root);
    expect(document.querySelector('#tubekit-related-pane #related')).toBe(related);
  });

  test('fullscreen held while leaving the watch page releases once the watch page is hidden', async () => {
    const { document, watch } = await setup();
    const related = document.querySelector('#related');
    const fullscreen = fullscreenStub();
    fullscreen.enter();
    await advance(200);
    expect(document.querySelector('#tubekit-root').dataset.suspended).toBe('true');
    document.dispatchEvent(new Event('yt-navigate-start'));
    history.pushState({}, '', '/?v=A');
    await advance(500);
    expect(document.querySelector('#tubekit-root').dataset.suspended).toBe('true');
    watch.setAttribute('hidden', '');
    await mutationsSettle();
    expect(document.querySelector('#tubekit-root')).toBe(null);
    expect(document.documentElement.classList.contains('tubekit-suspended')).toBe(false);
    expect(document.documentElement.classList.contains('tubekit-active')).toBe(false);
    expect(document.querySelector('#secondary-inner > #related')).toBe(related);
  });

  test('the switch to related for comments turned off waits for the address to name the video again', async () => {
    const { document } = await setup({ disabled: true });
    await advance(100);
    moveAddress('B');
    await advance(1500);
    expect(selected(document)).toBe('comments');
    history.pushState({}, '', '/watch?v=A');
    window.dispatchEvent(new Event('popstate'));
    await advance(300);
    expect(selected(document)).toBe('related');
  });

  test('comments emptied during a lag that ends on the same video are judged again from what YouTube shows', async () => {
    const { document } = await setup();
    moveAddress('B');
    document.querySelector('#comments').innerHTML = '<ytd-message-renderer>Comments are turned off</ytd-message-renderer>';
    await advance(2000);
    expect(document.querySelector('#tubekit-toast').dataset.visible).not.toBe('true');
    history.pushState({}, '', '/watch?v=A');
    window.dispatchEvent(new Event('urlchange'));
    await advance(2000);
    expect(document.querySelector('#tubekit-toast').dataset.visible).toBe('true');
    expect(selected(document)).toBe('related');
  });

  test('the tab remembered on the old video is forgotten once another video was shown in between', async () => {
    const { document, watch } = await setup();
    document.querySelector('#tubekit-related-tab').click();
    await theater(watch);
    expect(document.querySelector('#tubekit-root')).toBe(null);
    moveAddress('B');
    pageMoves(watch, 'B');
    document.querySelector('#below').append(newComments(document));
    await advance(300);
    moveAddress('A');
    pageMoves(watch, 'A');
    document.querySelector('#below').append(newComments(document));
    await advance(300);
    await leaveTheater(watch);
    expect(document.querySelector('#tubekit-root')).toBeTruthy();
    expect(selected(document)).toBe('comments');
  });

  test('the tab remembered on the old video is resumed when the navigation only started and the same video stays', async () => {
    const { document, watch } = await setup();
    document.querySelector('#tubekit-related-tab').click();
    await theater(watch);
    document.dispatchEvent(new Event('yt-navigate-start'));
    await advance(300);
    await leaveTheater(watch);
    expect(selected(document)).toBe('related');
  });
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
    videoId: 'A',
    twoColumn: false,
    pageFollowsUrl: false,
    fullscreen: false,
    youtubePanel: false,
    leaving: false,
    gone: false,
    wrongGeneration: false,
    brokenRoot: false,
    currentTab: null,
  };
  const offScreen = facts => ({ ...idle, ...facts });
  const onScreen = facts => ({ ...idle, twoColumn: true, pageFollowsUrl: true, currentTab: onA, ...facts });
  const pageBehind = facts => onScreen({ videoId: 'B', pageFollowsUrl: false, ...facts });
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
    ['a new video in the address while the page still shows the old one keeps a shown panel', shown(), pageBehind(), shown(), []],
    ['a new video in the address while the page still shows the old one keeps a held panel', held(), pageBehind({ youtubePanel: true }), held(), []],
    ['the page showing the new video releases the old panel and shows the new one fresh on comments', shown(), onScreen({ videoId: 'B', wrongGeneration: true }), shown(), ['teardown', 'mount:comments']],
    ['the page showing the new video does not resume the tab of the old video even from the remembered one', released(onA), onScreen({ videoId: 'B', currentTab: null }), shown(), ['mount:comments']],
    ['the page not yet showing the new video never shows a released panel', released(), pageBehind({ currentTab: null }), released(), []],
    ['the address going back to the shown video keeps the panel and its tab', shown(), onScreen(), shown(), []],
    ['leaving the two-column layout while the page lags behind the address releases and forgets the tab', shown(), pageBehind({ twoColumn: false }), released(), ['teardown']],
    ['the address leaving the watch page releases and forgets the tab', shown(), offScreen({ videoId: null, currentTab: onA }), released(), ['teardown']],
    ['the address leaving the watch page keeps a shown panel while the watch page is still shown', shown(), offScreen({ videoId: null, leaving: true, currentTab: onA }), shown(), []],
    ['the address leaving the watch page keeps a held panel while the watch page is still shown', held(), offScreen({ videoId: null, leaving: true, youtubePanel: true, currentTab: onA }), held(), []],
    ['fullscreen held while the watch page is gone releases', held(), inFullscreen({ videoId: null, gone: true }), released(), ['teardown']],
    ['the watch page being left behind never shows a released panel', released(), offScreen({ videoId: null, leaving: true }), released(), []],
    ['fullscreen while the page lags behind the address holds the panel', shown(), pageBehind({ twoColumn: false, fullscreen: true }), held(), ['saveScroll', 'hide']],
    ['a YouTube panel opening while the page lags behind the address holds the panel', shown(), pageBehind({ youtubePanel: true }), held(), ['saveScroll', 'hide']],
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

  test('a loader still waiting while the address names another video neither fails nor decides, and goes on when the address comes back', async () => {
    const { loader, below, states } = startLoader();
    history.pushState({}, '', '/watch?v=B');
    await advance(60_000);
    expect(loader.state).toBe('loading');
    expect(states).toStrictEqual([]);
    history.pushState({}, '', '/watch?v=A');
    await advance(300);
    below.append(nativeComments(HEADER));
    await advance(600);
    expect(states).toStrictEqual(['loaded']);
  });

  test('changes seen while the address names another video are judged once it names the video again', async () => {
    const { loader, states } = startLoader({ content: HEADER });
    expect(states).toStrictEqual(['loaded']);
    history.pushState({}, '', '/watch?v=B');
    comments().innerHTML = '<ytd-message-renderer>Comments are turned off</ytd-message-renderer>';
    await advance(1000);
    expect(states).toStrictEqual(['loaded']);
    history.pushState({}, '', '/watch?v=A');
    loader.refresh();
    expect(loader.state).toBe('off');
  });

  test('comments replaced while the address names another video are taken without a loading state and loaded again on return', async () => {
    const { loader, below, states, region, commentsPane } = startLoader({ content: HEADER });
    const old = comments();
    history.pushState({}, '', '/watch?v=B');
    old.remove();
    const replacement = nativeComments();
    below.append(replacement);
    loader.refresh();
    await advance(1000);
    expect(states).toStrictEqual(['loaded']);
    expect(region.node).toBe(replacement);
    expect(commentsPane.contains(replacement)).toBe(true);
    history.pushState({}, '', '/watch?v=A');
    loader.refresh();
    expect(states).toStrictEqual(['loaded', 'loading']);
    replacement.insertAdjacentHTML('beforeend', HEADER);
    await advance(600);
    expect(states).toStrictEqual(['loaded', 'loading', 'loaded']);
  });

  test('comments that fill in while the address names another video are decided as soon as it names the video again, not failed later', async () => {
    const { loader, below, states } = startLoader();
    await advance(500);
    below.append(nativeComments());
    await advance(300);
    history.pushState({}, '', '/watch?v=B');
    comments().insertAdjacentHTML('beforeend', HEADER);
    await advance(1000);
    expect(states).toStrictEqual([]);
    history.pushState({}, '', '/watch?v=A');
    await advance(600);
    expect(states).toStrictEqual(['loaded']);
    await advance(30_000);
    expect(states).toStrictEqual(['loaded']);
    expect(loader.state).toBe('loaded');
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

  test('a node is restored when the page video-id is empty and the video asked for is none', () => {
    const { watch, root, commentsPane, below } = borrowPage();
    below.append(nativeComments());
    const region = createCommentsRegion(commentsPane, root);
    const node = region.take(watch);
    watch.setAttribute('video-id', '');
    region.restore(watch, restoreArguments(null));
    expect(node.parentNode).toBe(below);
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

describe('panel selection rules', () => {
  const [a, b, c] = ['a', 'b', 'c'];
  const state = (selected, previous, known) => ({ selected, previous, known });

  test.each([
    ['no panels reset everything', state(b, a, [a, b]), [], null, initialPanelSelection],
    ['the first panels start on the front one', initialPanelSelection, [a, b], null, state(a, null, [a, b])],
    ['a new panel opening is selected and the old one becomes the previous', state(a, null, [a]), [a, b], null, state(b, a, [a, b])],
    ['nothing new keeps the selection', state(b, a, [a, b]), [a, b], null, state(b, a, [a, b])],
    ['a request for another panel selects it', state(a, null, [a, b]), [a, b], b, state(b, a, [a, b])],
    ['a request for the selected panel changes nothing', state(b, a, [a, b]), [a, b], b, state(b, a, [a, b])],
    ['a request for a panel that is not open is ignored', state(a, null, [a, b]), [a, b], c, state(a, null, [a, b])],
    ['closing the selected panel returns to the previous one', state(c, a, [a, b, c]), [a, b], null, state(a, null, [a, b])],
    ['closing the selected panel with no previous goes to the front', state(c, null, [a, b, c]), [a, b], null, state(a, null, [a, b])],
    ['closing the selected panel whose previous also closed goes to the front', state(c, b, [a, b, c]), [a, c].filter(x => x !== c), null, state(a, null, [a])],
    ['closing a panel that is not selected keeps the view and the previous', state(c, a, [a, b, c]), [a, c], null, state(c, a, [a, c])],
    ['closing the previous panel forgets it', state(c, b, [a, b, c]), [a, c], null, state(c, null, [a, c])],
    ['one panel left keeps it selected', state(b, a, [a, b]), [b], null, state(b, null, [b])],
    ['a panel opening in the same pass as the selected one closing is selected', state(a, null, [a]), [b], null, state(b, null, [b])],
    ['a request beats the panels that opened in the same pass', state(a, null, [a]), [a, b, c], c, state(c, a, [a, b, c])],
    ['a request for a panel that was already open beats panels opened meanwhile', state(b, null, [a, b]), [a, b, c], a, state(a, b, [a, b, c])],
    ['a remembered selection resumes when nothing changed', state(b, null, [a, b]), [a, b], null, state(b, null, [a, b])],
    ['a remembered selection yields to a panel opened meanwhile', state(b, null, [a, b]), [a, b, c], null, state(c, b, [a, b, c])],
    ['a remembered selection closed meanwhile goes to the front', state(b, null, [a, b]), [a], null, state(a, null, [a])],
  ])('%s', (_name, before, panels, requested, after) => {
    expect(nextPanelSelection(before, panels, requested)).toStrictEqual(after);
  });
});

describe('YouTube panels fill the place of the held comments panel', () => {
  const VISIBLE = 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED';
  const HIDDEN = 'ENGAGEMENT_PANEL_VISIBILITY_HIDDEN';

  function addEngagement({ title = 'Info', targetId = null, close = true } = {}) {
    const panel = document.createElement('ytd-engagement-panel-section-list-renderer');
    if (targetId) panel.setAttribute('target-id', targetId);
    panel.setAttribute('visibility', VISIBLE);
    panel.innerHTML = `<ytd-engagement-panel-title-header-renderer><div id="header"><yt-formatted-string id="title-text">${title}</yt-formatted-string><div id="visibility-button"><button></button></div></div></ytd-engagement-panel-title-header-renderer>`;
    if (close) panel.querySelector('button').addEventListener('click', () => panel.setAttribute('visibility', HIDDEN));
    document.querySelector('#secondary-inner').append(panel);
    return {
      panel,
      setTitle: (text) => { panel.querySelector('#title-text').textContent = text; },
    };
  }

  function addChat(title = 'Top chat replay') {
    const container = document.createElement('div');
    container.id = 'chat-container';
    container.innerHTML = '<ytd-live-chat-frame id="chat"><iframe></iframe></ytd-live-chat-frame>';
    const chat = container.firstElementChild;
    const frame = chat.querySelector('iframe');
    const build = (text) => {
      const doc = document.implementation.createHTMLDocument('');
      doc.body.innerHTML = `<yt-live-chat-header-renderer><div id="label-text">${text}</div><div id="close-button"><button></button></div></yt-live-chat-header-renderer>`;
      doc.querySelector('#close-button button').addEventListener('click', () => chat.setAttribute('collapsed', ''));
      return doc;
    };
    let doc = build(title);
    stubProperty(frame, 'contentDocument', { get: () => doc });
    document.querySelector('#secondary-inner').prepend(container);
    return {
      chat,
      frame,
      setTitle: (text) => { doc.querySelector('#label-text').textContent = text; },
      reload: (text) => {
        doc = build(text);
        frame.dispatchEvent(new Event('load'));
      },
      collapse: () => chat.setAttribute('collapsed', ''),
      expand: () => chat.removeAttribute('collapsed'),
    };
  }

  const request = (targetId, title = '') => document.dispatchEvent(new CustomEvent('yt-action', {
    detail: {
      actionName: 'yt-engagement-panel-visible-changed',
      args: [{ targetId, header: { engagementPanelTitleHeaderRenderer: { title: { runs: [{ text: title }] } } } }],
    },
  }));

  const settle = () => advance(200);
  const row = () => document.querySelector('#tubekit-youtube-tabs');
  const tabs = () => [...document.querySelectorAll('#tubekit-youtube-tabs .tubekit-tab')];
  const tabNames = () => tabs().map(tab => tab.textContent);
  const tabSelected = () => tabs().find(tab => tab.getAttribute('aria-selected') === 'true')?.textContent;
  const marks = () => [...document.querySelectorAll('[data-tubekit-panel]')].map(node => node.getAttribute('data-tubekit-panel'));
  const markOf = (node) => node.getAttribute('data-tubekit-panel');
  const rootHeld = () => document.querySelector('#tubekit-root').dataset.suspended;
  const clickTab = (name) => tabs().find(tab => tab.textContent === name).click();

  test('one YouTube panel fills the place alone, with no tab row', async () => {
    await setup();
    const info = addEngagement({ title: 'Video info' });
    await settle();
    expect(rootHeld()).toBe('true');
    expect(row()).toBe(null);
    expect(markOf(info.panel)).toBe('shown');
    expect(document.documentElement.classList.contains('tubekit-youtube-panels')).toBe(true);
  });

  test('an expanded chat counts as a YouTube panel and a collapsed one does not', async () => {
    await setup();
    const chat = addChat();
    await settle();
    expect(markOf(chat.chat)).toBe('shown');
    chat.collapse();
    await settle();
    expect(rootHeld()).toBe('false');
    expect(chat.chat.hasAttribute('data-tubekit-panel')).toBe(false);
  });

  test('two panels get a tab row at the top of the right column in the order YouTube stacks them, named by their titles', async () => {
    await setup();
    addEngagement({ title: 'Video info' });
    addChat('Top chat replay');
    await settle();
    expect(row().parentNode).toBe(document.querySelector('#secondary-inner'));
    expect(document.querySelector('#secondary-inner').firstElementChild).toBe(row());
    expect(row().getAttribute('role')).toBe('tablist');
    expect(tabNames()).toStrictEqual(['Top chat replay', 'Video info']);
    expect(tabs().every(tab => tab.getAttribute('role') === 'tab')).toBe(true);
    expect(tabSelected()).toBe('Top chat replay');
    expect(marks()).toStrictEqual(['shown', 'hidden']);
    expect(row().lastElementChild.className).toBe('tubekit-close-all');
    expect(row().lastElementChild.textContent).toBe('Close all');
  });

  test('panels already open when the hold starts begin on the front tab', async () => {
    const { document } = await setup({
      beforeStart: () => {
        addEngagement({ title: 'Video info' });
        addChat('Chat');
      },
    });
    await settle();
    expect(rootHeld()).toBe('true');
    expect(tabNames()).toStrictEqual(['Chat', 'Video info']);
    expect(tabSelected()).toBe('Chat');
    expect(document.querySelector('#tubekit-root').dataset.suspended).toBe('true');
  });

  test('a panel opening later is selected at once, and tab clicks switch the shown panel', async () => {
    await setup();
    const chat = addChat('Chat');
    await settle();
    const info = addEngagement({ title: 'Video info' });
    await settle();
    expect(tabSelected()).toBe('Video info');
    expect(markOf(info.panel)).toBe('shown');
    expect(markOf(chat.chat)).toBe('hidden');
    clickTab('Chat');
    expect(tabSelected()).toBe('Chat');
    expect(markOf(chat.chat)).toBe('shown');
    expect(markOf(info.panel)).toBe('hidden');
    expect(tabs().map(tab => tab.tabIndex)).toStrictEqual([0, -1]);
  });

  test('hidden panels stay laid out so that they still count as open', async () => {
    await setup();
    addEngagement({ title: 'One' });
    const second = addEngagement({ title: 'Two' });
    await settle();
    const style = getComputedStyle(second.panel);
    expect(markOf(second.panel)).toBe('hidden');
    expect(style.display).not.toBe('none');
    expect(style.visibility).toBe('hidden');
    expect(style.position).toBe('absolute');
    await settle();
    expect(rootHeld()).toBe('true');
    expect(tabNames()).toStrictEqual(['One', 'Two']);
  });

  test('closing the viewed panel returns to the tab viewed just before, or the front tab when that is gone', async () => {
    await setup();
    const one = addEngagement({ title: 'One' });
    await settle();
    const two = addEngagement({ title: 'Two' });
    await settle();
    const three = addEngagement({ title: 'Three' });
    await settle();
    expect(tabSelected()).toBe('Three');
    clickTab('One');
    clickTab('Two');
    two.panel.setAttribute('visibility', HIDDEN);
    await settle();
    expect(tabSelected(), 'back to the previous').toBe('One');
    expect(markOf(one.panel)).toBe('shown');
    one.panel.setAttribute('visibility', HIDDEN);
    await settle();
    expect(row(), 'one panel left, no tab row').toBe(null);
    expect(markOf(three.panel)).toBe('shown');
  });

  test('closing a panel that is not shown only drops its tab', async () => {
    await setup();
    const one = addEngagement({ title: 'One' });
    const two = addEngagement({ title: 'Two' });
    const three = addEngagement({ title: 'Three' });
    await settle();
    expect(tabSelected(), 'panels already open when the hold starts begin on the front tab').toBe('One');
    clickTab('Two');
    one.panel.setAttribute('visibility', HIDDEN);
    await settle();
    expect(tabNames()).toStrictEqual(['Two', 'Three']);
    expect(tabSelected()).toBe('Two');
    expect(markOf(two.panel)).toBe('shown');
    expect(three.panel.getAttribute('data-tubekit-panel')).toBe('hidden');
    expect(one.panel.hasAttribute('data-tubekit-panel')).toBe(false);
    three.panel.setAttribute('visibility', HIDDEN);
    await settle();
    expect(row()).toBe(null);
    expect(tabSelected()).toBe(undefined);
    expect(markOf(two.panel)).toBe('shown');
  });

  test('closing the viewed panel with no tab viewed before goes to the front tab', async () => {
    await setup();
    addEngagement({ title: 'One' });
    await settle();
    addEngagement({ title: 'Two' });
    await settle();
    expect(tabSelected()).toBe('Two');
    const panels = document.querySelectorAll('ytd-engagement-panel-section-list-renderer');
    panels[1].setAttribute('visibility', HIDDEN);
    await settle();
    expect(markOf(panels[0])).toBe('shown');
    expect(row()).toBe(null);
  });

  test('a request to open a panel that is already open in another tab jumps to that tab', async () => {
    await setup();
    addEngagement({ title: 'Video info', targetId: 'info-target' });
    addEngagement({ title: 'Questions', targetId: 'ask-target' });
    addChat('Chat');
    await settle();
    expect(tabSelected()).toBe('Chat');
    request('info-target', 'Video info');
    await settle();
    expect(tabSelected()).toBe('Video info');
    clickTab('Chat');
    request('unknown-target', 'Questions');
    await settle();
    expect(tabSelected(), 'matched by its title when no target id fits').toBe('Questions');
    clickTab('Chat');
    request('unknown-target', 'Unknown');
    await settle();
    expect(tabSelected(), 'a request no panel matches changes nothing').toBe('Chat');
  });

  test('requests for panels that are not shown by the held comments panel have no effect', async () => {
    await setup();
    request('whatever', 'Whatever');
    await settle();
    expect(rootHeld()).toBe('false');
    const info = addEngagement({ title: 'Video info', targetId: 'info-target' });
    await settle();
    expect(markOf(info.panel)).toBe('shown');
  });

  test('a chat title change and a reloaded chat frame rename the tab', async () => {
    await setup();
    const chat = addChat('Top chat replay');
    addEngagement({ title: 'Video info' });
    await settle();
    expect(tabNames()).toStrictEqual(['Top chat replay', 'Video info']);
    chat.setTitle('Live chat replay');
    await settle();
    expect(tabNames()).toStrictEqual(['Live chat replay', 'Video info']);
    chat.reload('Live chat');
    chat.setTitle('Live chat renamed');
    await settle();
    expect(tabNames()).toStrictEqual(['Live chat renamed', 'Video info']);
  });

  test('an engagement panel title change renames its tab', async () => {
    await setup();
    const info = addEngagement({ title: 'Video info' });
    addEngagement({ title: 'Other' });
    await settle();
    info.setTitle('Renamed');
    await settle();
    expect(tabNames()).toStrictEqual(['Renamed', 'Other']);
  });

  test('a panel without a readable title is named Chat or Panel', async () => {
    await setup();
    const info = addEngagement({ title: '' });
    const chat = addChat('');
    await settle();
    expect(tabNames()).toStrictEqual(['Chat', 'Panel']);
    chat.setTitle('Named');
    info.setTitle('Titled');
    await settle();
    expect(tabNames()).toStrictEqual(['Named', 'Titled']);
  });

  test('tab names follow the page language', async () => {
    await setup();
    document.documentElement.lang = 'ko-KR';
    addEngagement({ title: '' });
    addChat('');
    await settle();
    expect(tabNames()).toStrictEqual(['채팅', '패널']);
    expect(row().lastElementChild.textContent).toBe('모두 닫기');
  });

  test('close all closes every open panel the way its own close button does, and the comments panel comes back', async () => {
    await setup();
    document.querySelector('[role="tab"][data-tab="related"]').click();
    await settle();
    const info = addEngagement({ title: 'Video info' });
    const chat = addChat('Chat');
    await settle();
    expect(row()).toBeTruthy();
    row().querySelector('.tubekit-close-all').click();
    await settle();
    expect(info.panel.getAttribute('visibility')).toBe(HIDDEN);
    expect(chat.chat.hasAttribute('collapsed')).toBe(true);
    expect(rootHeld()).toBe('false');
    expect(row()).toBe(null);
    expect(marks()).toStrictEqual([]);
    expect(selected(document)).toBe('related');
    expect(document.documentElement.classList.contains('tubekit-youtube-panels')).toBe(false);
  });

  test('close all still closes the panels when touched, although YouTube cancels clicks that miss the last touched element', async () => {
    await setup();
    let touched = null;
    const remember = (event) => {
      touched = event.composedPath()[0];
    };
    const cancel = (event) => {
      if (touched && !event.composedPath().includes(touched)) event.stopPropagation();
    };
    document.addEventListener('touchend', remember);
    document.addEventListener('click', cancel, true);
    onCleanup(() => {
      document.removeEventListener('touchend', remember);
      document.removeEventListener('click', cancel, true);
    });
    const tap = (element) => {
      element.dispatchEvent(new Event('touchend', { bubbles: true, composed: true }));
      element.click();
    };
    const info = addEngagement({ title: 'Video info' });
    addEngagement({ title: 'Ask' });
    await settle();
    tap(tabs()[1]);
    await settle();
    tap(row().querySelector('.tubekit-close-all'));
    await settle();
    expect(info.panel.getAttribute('visibility')).toBe(HIDDEN);
    expect(row()).toBe(null);
  });

  test('a single panel has no close all button', async () => {
    await setup();
    addEngagement({ title: 'Video info' });
    await settle();
    expect(document.querySelector('.tubekit-close-all')).toBe(null);
  });

  test('arrow keys, Home and End move between the tabs like the comments panel tabs and not onto close all', async () => {
    await setup();
    addEngagement({ title: 'One' });
    addEngagement({ title: 'Two' });
    addEngagement({ title: 'Three' });
    await settle();
    clickTab('One');
    tabs()[0].focus();
    const press = (key) => row().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    const expectTab = (name) => {
      expect(tabSelected()).toBe(name);
      expect(document.activeElement.textContent).toBe(name);
      expect(tabs().filter(tab => tab.tabIndex === 0)).toHaveLength(1);
    };
    press('ArrowRight');
    expectTab('Two');
    press('End');
    expectTab('Three');
    press('ArrowRight');
    expectTab('One');
    press('ArrowLeft');
    expectTab('Three');
    press('Home');
    expectTab('One');
  });

  test('YouTube panels keep the box of the comments panel in the two-column screen only', async () => {
    const { watch } = await setup();
    addEngagement({ title: 'One' });
    addChat('Chat');
    await settle();
    const secondary = document.querySelector('#secondary');
    const shown = document.querySelector('[data-tubekit-panel="shown"]');
    expect(getComputedStyle(secondary).position).toBe('sticky');
    expect(getComputedStyle(shown).margin).not.toBe('');
    expect(getComputedStyle(row()).display).toBe('flex');
    watch.setAttribute('theater', '');
    expect(getComputedStyle(secondary).position, 'theater mode releases the box at once').not.toBe('sticky');
    expect(getComputedStyle(row()).display).toBe('none');
    watch.removeAttribute('theater');
    expect(getComputedStyle(secondary).position).toBe('sticky');
  });

  test('YouTube panels do not fill the place while fullscreen holds the comments panel', async () => {
    await setup();
    addEngagement({ title: 'One' });
    addEngagement({ title: 'Two' });
    await settle();
    expect(row()).toBeTruthy();
    clickTab('Two');
    const fullscreen = fullscreenStub();
    fullscreen.enter();
    await settle();
    expect(rootHeld()).toBe('true');
    expect(document.documentElement.classList.contains('tubekit-youtube-panels')).toBe(false);
    expect(row()).toBe(null);
    fullscreen.exit();
    await settle();
    expect(rootHeld()).toBe('true');
    expect(document.documentElement.classList.contains('tubekit-youtube-panels')).toBe(true);
    expect(tabNames()).toStrictEqual(['One', 'Two']);
    expect(tabSelected(), 'the tab viewed before fullscreen is viewed again').toBe('Two');
  });

  test('the tab row stays in the right column while mutations happen around it, and idle DOM settles', async () => {
    await setup();
    addEngagement({ title: 'One' });
    addEngagement({ title: 'Two' });
    await settle();
    const created = row();
    await advance(400);
    expect(vi.getTimerCount()).toBe(0);
    expect(row()).toBe(created);
  });

  describe('after the comments panel was released and stands again', () => {
    async function twoPanels() {
      const { watch } = await setup();
      const first = addEngagement({ title: 'One' });
      const second = addEngagement({ title: 'Two' });
      await settle();
      clickTab('One');
      return { watch, first, second };
    }

    const leave = (watch) => watch.removeAttribute('is-two-columns_');
    const back = async (watch) => {
      watch.setAttribute('is-two-columns_', '');
      await settle();
    };

    test('the same video resumes the tab that was viewed', async () => {
      const { watch } = await twoPanels();
      leave(watch);
      await settle();
      expect(document.querySelector('#tubekit-root')).toBe(null);
      expect(document.querySelector('#tubekit-youtube-tabs')).toBe(null);
      expect(marks()).toStrictEqual([]);
      expect(document.documentElement.classList.contains('tubekit-youtube-panels')).toBe(false);
      await back(watch);
      expect(tabNames()).toStrictEqual(['One', 'Two']);
      expect(tabSelected()).toBe('One');
    });

    test('a panel opened in the meantime is the tab shown', async () => {
      const { watch } = await twoPanels();
      leave(watch);
      await settle();
      addEngagement({ title: 'Three' });
      await back(watch);
      expect(tabSelected()).toBe('Three');
    });

    test('the viewed panel closed in the meantime leaves the front tab', async () => {
      const { watch, first } = await twoPanels();
      clickTab('Two');
      leave(watch);
      await settle();
      addEngagement({ title: 'Three' });
      document.querySelectorAll('ytd-engagement-panel-section-list-renderer')[1].setAttribute('visibility', HIDDEN);
      await back(watch);
      expect(tabNames()).toStrictEqual(['One', 'Three']);
      expect(tabSelected()).toBe('Three');
      expect(first.panel.getAttribute('data-tubekit-panel')).toBe('hidden');
    });

    test('closing the viewed panel in the meantime goes to the front tab', async () => {
      const { watch, first, second } = await twoPanels();
      leave(watch);
      await settle();
      first.panel.setAttribute('visibility', HIDDEN);
      second.panel.setAttribute('visibility', VISIBLE);
      addEngagement({ title: 'Three' }).panel.setAttribute('visibility', HIDDEN);
      await back(watch);
      expect(row()).toBe(null);
      expect(markOf(second.panel)).toBe('shown');
    });

    test('the viewed panel closed in the meantime leaves the front tab, not the one viewed before it', async () => {
      const { watch } = await setup();
      addEngagement({ title: 'One' });
      await settle();
      addEngagement({ title: 'Two' });
      await settle();
      const three = addEngagement({ title: 'Three' });
      await settle();
      clickTab('Two');
      clickTab('Three');
      leave(watch);
      await settle();
      three.panel.setAttribute('visibility', HIDDEN);
      await back(watch);
      expect(tabNames()).toStrictEqual(['One', 'Two']);
      expect(tabSelected()).toBe('One');
    });

    test('a different video starts on the front tab', async () => {
      const { watch } = await twoPanels();
      leave(watch);
      await settle();
      history.replaceState(null, '', '/watch?v=B');
      watch.setAttribute('video-id', 'B');
      await back(watch);
      expect(tabSelected()).toBe('One');
      clickTab('Two');
      leave(watch);
      await settle();
      history.replaceState(null, '', '/watch?v=A');
      watch.setAttribute('video-id', 'A');
      await back(watch);
      expect(tabSelected(), 'seeing another video in between forgets the tab').toBe('One');
    });
  });

  test('syncing again leaves the tab buttons where they are, so keyboard focus stays', async () => {
    await setup();
    addEngagement({ title: 'One' });
    addEngagement({ title: 'Two' });
    addEngagement({ title: 'Three' });
    await settle();
    const buttons = tabs();
    buttons[1].focus();
    const moved = vi.fn();
    const watcher = new MutationObserver(moved);
    watcher.observe(row(), { childList: true });
    document.querySelector('#secondary-inner').append(document.createElement('div'));
    await settle();
    window.dispatchEvent(new Event('resize'));
    await settle();
    expect(document.activeElement).toBe(buttons[1]);
    expect(tabs()).toStrictEqual(buttons);
    expect(moved).not.toHaveBeenCalled();
    watcher.disconnect();
  });

  test('a chat whose frame is added after the chat itself is still watched for its title', async () => {
    await setup();
    const container = document.createElement('div');
    container.id = 'chat-container';
    container.innerHTML = '<ytd-live-chat-frame id="chat"></ytd-live-chat-frame>';
    document.querySelector('#secondary-inner').prepend(container);
    addEngagement({ title: 'Video info' });
    await settle();
    expect(tabNames()).toStrictEqual(['Chat', 'Video info']);
    const frame = document.createElement('iframe');
    const doc = document.implementation.createHTMLDocument('');
    doc.body.innerHTML = '<yt-live-chat-header-renderer><div id="label-text">Top chat replay</div></yt-live-chat-header-renderer>';
    stubProperty(frame, 'contentDocument', { get: () => doc });
    container.firstElementChild.append(frame);
    await settle();
    expect(tabNames()).toStrictEqual(['Top chat replay', 'Video info']);
    doc.querySelector('#label-text').textContent = 'Live chat replay';
    await settle();
    expect(tabNames()).toStrictEqual(['Live chat replay', 'Video info']);
  });

  test('a panel hidden and re-requested while viewing another stays out of the way of the next video', async () => {
    const { watch } = await setup();
    addEngagement({ title: 'One', targetId: 'one' });
    addEngagement({ title: 'Two', targetId: 'two' });
    await settle();
    watch.removeAttribute('is-two-columns_');
    await settle();
    expect(document.querySelector('#tubekit-root')).toBe(null);
    request('two', 'Two');
    await advance(100);
    history.replaceState(null, '', '/watch?v=B');
    watch.setAttribute('video-id', 'B');
    watch.setAttribute('is-two-columns_', '');
    await settle();
    expect(tabSelected(), 'the stale request of the old video is dropped').toBe('One');
  });

  test('requests made while the comments panel is released decide the tab when it stands again, the latest action first', async () => {
    const { watch } = await setup();
    addEngagement({ title: 'One', targetId: 'one' });
    addEngagement({ title: 'Two', targetId: 'two' });
    await settle();
    watch.removeAttribute('is-two-columns_');
    await settle();
    addEngagement({ title: 'Three', targetId: 'three' });
    const four = addEngagement({ title: 'Four', targetId: 'four' });
    request('three', 'Three');
    request('four', 'Four');
    expect(four.panel).toBeTruthy();
    watch.setAttribute('is-two-columns_', '');
    await settle();
    expect(tabSelected()).toBe('Four');
    clickTab('One');
    watch.removeAttribute('is-two-columns_');
    await settle();
    request('two', 'Two');
    watch.setAttribute('is-two-columns_', '');
    await settle();
    expect(tabSelected(), 'an already open panel pressed again counts as the latest action').toBe('Two');
  });

  test('the tab viewed before leaving is forgotten when the watch page goes away and the same video comes back at once', async () => {
    const { watch } = await setup();
    addEngagement({ title: 'One' });
    addEngagement({ title: 'Two' });
    await settle();
    clickTab('Two');
    history.replaceState(null, '', '/');
    watch.setAttribute('hidden', '');
    window.dispatchEvent(new Event('popstate'));
    expect(document.querySelector('#tubekit-root')).toBe(null);
    history.replaceState(null, '', '/watch?v=A');
    watch.removeAttribute('hidden');
    window.dispatchEvent(new Event('popstate'));
    await settle();
    expect(document.querySelector('#tubekit-root')).toBeTruthy();
    expect(tabSelected()).toBe('One');
  });

  test('stopping the feature removes what it put on the page', async () => {
    const { stop } = await setup();
    addEngagement({ title: 'One' });
    addEngagement({ title: 'Two' });
    const chat = addChat('Chat');
    await settle();
    stop();
    chat.setTitle('Late');
    await advance(300);
    expect(tabNames()).not.toContain('Late');
    document.dispatchEvent(new CustomEvent('yt-action', { detail: { actionName: 'yt-engagement-panel-visible-changed', args: [{ targetId: 'x' }] } }));
    await advance(300);
    expect(vi.getTimerCount()).toBe(0);
  });
});
