const ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const SHORTS_PATH = /^\/shorts\/([^/]+)\/?$/;

function shortsIdFromPath(pathname) {
  const match = SHORTS_PATH.exec(pathname);
  return match && ID_PATTERN.test(match[1]) ? match[1] : null;
}

// 이동은 이 함수 하나로 모은다(테스트가 계측한다).
function redirectTo(url) {
  location.replace(url);
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

// 데스크톱(yt-navigate)과 모바일(window의 navigate) 공용.
function rewriteEndpoint(event) {
  const detail = event.detail;
  const watch = detail && watchEndpointFor(detail.endpoint);
  if (!watch) return;
  detail.endpoint = watch.endpoint;
  if ('href' in detail) detail.href = `/watch?v=${watch.id}`;
}

function start() {
  redirectIfShorts();
  document.addEventListener('yt-navigate', rewriteEndpoint, true);
  document.addEventListener('yt-navigate-finish', redirectIfShorts);
  window.addEventListener('popstate', redirectIfShorts);
  window.addEventListener('navigate', rewriteEndpoint, true);
  window.addEventListener('state-navigateend', redirectIfShorts);
}

export default { id: 'shorts-to-watch', start };
