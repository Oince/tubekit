import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const RAW_URL = 'https://raw.githubusercontent.com/Oince/tubekit/main/tubekit.user.js';

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
