import { redirectTo } from './redirect.js';

const ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const SHORTS_PATH = /^\/shorts\/([^/]+)\/?$/;

function shortsIdFromPath(pathname) {
  const match = SHORTS_PATH.exec(pathname);
  return match && ID_PATTERN.test(match[1]) ? match[1] : null;
}

function redirectIfShorts() {
  const id = shortsIdFromPath(location.pathname);
  if (!id) return;
  const rest = new URLSearchParams(location.search).toString();
  redirectTo(`/watch?v=${id}${rest ? `&${rest}` : ''}${location.hash}`);
}

function watchEndpointFor(endpoint) {
  const id = endpoint && endpoint.reelWatchEndpoint && endpoint.reelWatchEndpoint.videoId;
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) return null;
  return {
    id,
    endpoint: {
      clickTrackingParams: endpoint.clickTrackingParams,
      commandMetadata: {
        webCommandMetadata: { url: `/watch?v=${id}`, webPageType: 'WEB_PAGE_TYPE_WATCH', rootVe: 3832 },
      },
      watchEndpoint: { videoId: id },
    },
  };
}

function rewriteEndpoint(event) {
  const detail = event.detail;
  const watch = detail && watchEndpointFor(detail.endpoint);
  if (!watch) return;
  detail.endpoint = watch.endpoint;
  if ('href' in detail) detail.href = `/watch?v=${watch.id}`;
}

function start() {
  const controller = new AbortController();
  const { signal } = controller;
  redirectIfShorts();
  document.addEventListener('yt-navigate', rewriteEndpoint, { capture: true, signal });
  document.addEventListener('yt-navigate-finish', redirectIfShorts, { signal });
  window.addEventListener('popstate', redirectIfShorts, { signal });
  window.addEventListener('navigate', rewriteEndpoint, { capture: true, signal });
  window.addEventListener('state-navigateend', redirectIfShorts, { signal });
  return () => controller.abort();
}

export default { id: 'shorts-to-watch', start };
