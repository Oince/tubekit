import features from './features/index.js';

function inFrame() {
  try {
    return window.top !== window;
  } catch {
    return true;
  }
}

const framed = inFrame();
for (const feature of features) {
  if (!framed || feature.frames) feature.start();
}
