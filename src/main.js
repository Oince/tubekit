import features from './features/index.js';

function inFrame() {
  try {
    return window.top !== window;
  } catch {
    return true;
  }
}

// 프레임(임베드) 안에서는 frames: true를 선언한 기능만 시작한다.
const framed = inFrame();
for (const feature of features) {
  if (!framed || feature.frames) feature.start();
}
