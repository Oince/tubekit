import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const RAW_URL = 'https://raw.githubusercontent.com/Oince/tubekit/main/tubekit.user.js';

// 배포물은 저장소 루트의 tubekit.user.js다. outDir을 루트로 두므로 emptyOutDir을 꺼서 저장소 파일이 지워지지 않게 한다.
// 최신성 검사(test/build.test.cjs)는 `--outDir`로 임시 위치에 빌드해 비교한다.
export default defineConfig({
  build: {
    outDir: '.',
    emptyOutDir: false,
    minify: false,
  },
  plugins: [
    monkey({
      entry: 'src/main.js',
      userscript: {
        name: 'Tubekit',
        namespace: 'oince.tubekit',
        version,
        author: 'Oince',
        description: '개인용 YouTube 편의 기능 모음.',
        match: ['https://www.youtube.com/*', 'https://m.youtube.com/*', 'https://www.youtube-nocookie.com/*'],
        exclude: ['https://www.youtube.com/live_chat*'],
        'run-at': 'document-start',
        grant: ['window.onurlchange'],
        downloadURL: RAW_URL,
        updateURL: RAW_URL,
      },
      build: {
        fileName: 'tubekit.user.js',
        autoGrant: false,
      },
    }),
  ],
});
