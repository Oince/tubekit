const COMMENTS_CHECK_MS = 250;

export function createCommentsFollower({ region, watch }) {
  let disposed = false;
  let findTimer = 0;
  const frames = new Set();

  function nextFrame(callback) {
    const frame = requestAnimationFrame(() => {
      frames.delete(frame);
      if (!disposed) callback();
    });
    frames.add(frame);
  }

  function adopt() {
    if (disposed || !region.pane.isConnected) return true;
    if (region.node) return true;
    if (!region.take(watch)) return false;
    nextFrame(() => {
      region.pane.dispatchEvent(new Event('scroll'));
      window.dispatchEvent(new Event('scroll'));
    });
    return true;
  }

  function wait() {
    window.clearTimeout(findTimer);
    if (adopt()) return;
    findTimer = window.setTimeout(wait, COMMENTS_CHECK_MS);
  }

  return {
    start() {
      wait();
    },

    refresh() {
      if (disposed || !region.replaced(watch)) return;
      region.forget();
      wait();
    },

    dispose() {
      disposed = true;
      window.clearTimeout(findTimer);
      frames.forEach((frame) => cancelAnimationFrame(frame));
      frames.clear();
    },
  };
}
