import { cp, mkdir } from 'node:fs/promises';
import { defineConfig } from 'vite';

const coreSource = new URL('./node_modules/@ffmpeg/core/dist/esm/', import.meta.url);
const coreTarget = new URL('./public/ffmpeg-core/', import.meta.url);

async function stageFFmpegCore() {
  await mkdir(coreTarget, {recursive: true});
  await Promise.all([
    cp(new URL('ffmpeg-core.js', coreSource), new URL('ffmpeg-core.js', coreTarget)),
    cp(new URL('ffmpeg-core.wasm', coreSource), new URL('ffmpeg-core.wasm', coreTarget))
  ]);
}

export default defineConfig({
  plugins: [{
    name: 'stage-same-origin-ffmpeg-core',
    async config() { await stageFFmpegCore(); },
    async configureServer() { await stageFFmpegCore(); }
  }]
});
