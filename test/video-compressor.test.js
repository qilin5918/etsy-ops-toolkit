const assert = require('node:assert/strict');
const {readFile} = require('node:fs/promises');
const {join} = require('node:path');
const test = require('node:test');

test('loads the FFmpeg frontend and core from same-origin build assets', async () => {
  const source = await readFile(join(__dirname, '../video-compressor.js'), 'utf8');

  assert.match(source, /from '@ffmpeg\/ffmpeg'/);
  assert.match(source, /new URL\('\/ffmpeg-core\/ffmpeg-core\.js', window\.location\.origin\)/);
  assert.match(source, /new URL\('\/ffmpeg-core\/ffmpeg-core\.wasm', window\.location\.origin\)/);
  assert.doesNotMatch(source, /import\(['"]https?:\/\//);
  assert.doesNotMatch(source, /cdn\.jsdelivr\.net/);
});

test('reports component, worker, core, and transcode failures separately', async () => {
  const source = await readFile(join(__dirname, '../video-compressor.js'), 'utf8');

  assert.match(source, /视频压缩组件加载失败，请刷新页面后重试。/);
  assert.match(source, /浏览器阻止了视频处理组件，请尝试 Chrome 或 Edge。/);
  assert.match(source, /FFmpeg 核心文件加载失败。/);
  assert.match(source, /视频转码失败。/);
});
