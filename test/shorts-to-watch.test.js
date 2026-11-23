import { beforeEach, expect, test, vi } from 'vitest';
import { loadPage, startFeature } from './helpers.js';

const redirects = vi.hoisted(() => []);
vi.mock('../src/features/shorts-to-watch/redirect.js', () => ({ redirectTo: url => { redirects.push(url); } }));

beforeEach(() => {
  redirects.length = 0;
});

async function shortsPage(url) {
  loadPage({ url, body: '<ytd-app><div id="x"></div></ytd-app>' });
  await startFeature('shorts-to-watch');
}

function shortsEvent(endpoint) {
  const event = new CustomEvent('yt-navigate', { bubbles: true, detail: { endpoint } });
  document.querySelector('#x').dispatchEvent(event);
  return event;
}

test('yt-navigate with reelWatchEndpoint is rewritten to a watch endpoint', async () => {
  await shortsPage('https://www.youtube.com/results?search_query=a');
  const event = shortsEvent({
    clickTrackingParams: 'ctp',
    commandMetadata: { webCommandMetadata: { url: '/shorts/abcdefghijk', webPageType: 'WEB_PAGE_TYPE_SHORTS', rootVe: 37414 } },
    reelWatchEndpoint: { videoId: 'abcdefghijk' },
  });
  const ep = event.detail.endpoint;
  expect(ep.watchEndpoint.videoId).toBe('abcdefghijk');
  expect(ep.commandMetadata.webCommandMetadata.url).toBe('/watch?v=abcdefghijk');
  expect(ep.commandMetadata.webCommandMetadata.webPageType).toBe('WEB_PAGE_TYPE_WATCH');
  expect(ep.clickTrackingParams).toBe('ctp');
  expect(ep.reelWatchEndpoint).toBe(undefined);
});

test('yt-navigate without reelWatchEndpoint is left alone', async () => {
  await shortsPage('https://www.youtube.com/results?search_query=a');
  const endpoint = { watchEndpoint: { videoId: 'abcdefghijk' } };
  const event = shortsEvent(endpoint);
  expect(event.detail.endpoint).toBe(endpoint);
  expect(event.detail.endpoint).toStrictEqual({ watchEndpoint: { videoId: 'abcdefghijk' } });
});

test('opening /shorts/<id> redirects to /watch keeping other params and hash', async () => {
  await shortsPage('https://www.youtube.com/shorts/abcdefghijk?t=5&tubekit-dev=1#x');
  expect(redirects).toStrictEqual(['/watch?v=abcdefghijk&t=5&tubekit-dev=1#x']);
});

test('SPA arrival at /shorts/<id> redirects on yt-navigate-finish and popstate', async () => {
  await shortsPage('https://www.youtube.com/results');
  history.pushState({}, '', '/shorts/abcdefghijk');
  document.dispatchEvent(new CustomEvent('yt-navigate-finish'));
  window.dispatchEvent(new PopStateEvent('popstate'));
  expect(redirects).toStrictEqual(['/watch?v=abcdefghijk', '/watch?v=abcdefghijk']);
});

test('normal pages and invalid ids do not redirect', async () => {
  await shortsPage('https://www.youtube.com/watch?v=A');
  document.dispatchEvent(new CustomEvent('yt-navigate-finish'));
  window.dispatchEvent(new PopStateEvent('popstate'));
  history.pushState({}, '', '/shorts/');
  window.dispatchEvent(new PopStateEvent('popstate'));
  history.pushState({}, '', '/shorts/bad');
  window.dispatchEvent(new PopStateEvent('popstate'));
  expect(redirects).toStrictEqual([]);
});

test('mobile: navigate event is rewritten (endpoint and href)', async () => {
  await shortsPage('https://m.youtube.com/results?search_query=a');
  const fireNavigate = detail => {
    const event = new CustomEvent('navigate', { detail });
    window.dispatchEvent(event);
    return event;
  };
  const event = fireNavigate({
    href: '/shorts/abcdefghijk',
    endpoint: {
      clickTrackingParams: 'ctp',
      commandMetadata: { webCommandMetadata: { url: '/shorts/abcdefghijk', webPageType: 'WEB_PAGE_TYPE_SHORTS' } },
      reelWatchEndpoint: { videoId: 'abcdefghijk' },
    },
  });
  const ep = event.detail.endpoint;
  expect(ep.watchEndpoint.videoId).toBe('abcdefghijk');
  expect(ep.commandMetadata.webCommandMetadata.webPageType).toBe('WEB_PAGE_TYPE_WATCH');
  expect(ep.reelWatchEndpoint).toBe(undefined);
  expect(event.detail.href).toBe('/watch?v=abcdefghijk');

  const endpoint = { watchEndpoint: { videoId: 'abcdefghijk' } };
  const other = fireNavigate({ href: '/watch?v=abcdefghijk', endpoint });
  expect(other.detail.endpoint).toBe(endpoint);
  expect(other.detail.href).toBe('/watch?v=abcdefghijk');
});

test('mobile: opening /shorts/<id> redirects to /watch', async () => {
  await shortsPage('https://m.youtube.com/shorts/abcdefghijk?ra=m');
  expect(redirects).toStrictEqual(['/watch?v=abcdefghijk&ra=m']);
});

test('mobile: SPA arrival redirects on state-navigateend', async () => {
  await shortsPage('https://m.youtube.com/results');
  history.pushState({}, '', '/shorts/abcdefghijk');
  window.dispatchEvent(new CustomEvent('state-navigateend'));
  expect(redirects).toStrictEqual(['/watch?v=abcdefghijk']);
});
