/* Browser-only, sequential video compression powered by ffmpeg.wasm. */
(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const allowedTypes = new Set(['video/mp4', 'video/quicktime', 'video/webm']);
  const maxSafeSize = 1024 * 1024 * 1024;
  const jobs = [];
  let running = false;
  let ffmpeg = null;
  let currentJob = null;
  let cancelRequested = false;

  const modeNames = {quality: 'Etsy 高画质', balanced: '平衡', maximum: '最大压缩'};
  const friendlyError = {
    unsupported: '不支持此视频格式。请选择 MP4、MOV 或 WebM 文件。',
    large: '视频文件较大，当前浏览器无法在本地安全处理。建议关闭其他标签页，或先将视频缩短后重新上传。',
    decode: '无法读取视频，文件可能已损坏或当前浏览器不支持解码。',
    engine: '压缩引擎加载失败，请检查网络连接后重试。',
    memory: '视频文件较大，当前浏览器无法在本地安全处理。建议关闭其他标签页，或先将视频缩短后重新上传。',
    transcode: '视频压缩失败，请尝试较小的文件或更换浏览器。',
    download: '下载失败，请稍后重试。'
  };

  function selected(name) { return document.querySelector(`[name="${name}"]:checked`).value; }
  function formatSize(bytes) { return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`; }
  function formatDuration(seconds) { return Number.isFinite(seconds) ? `${Math.round(seconds)} 秒` : '无法读取'; }
  function safeName(name) { return name.replace(/[<>"'&]/g, c => ({'<':'&lt;','>':'&gt;','"':'&quot;', "'":'&#39;','&':'&amp;'}[c])); }
  function revoke(url) { if (url) URL.revokeObjectURL(url); }
  function showVideoError(message) { const el = $('video-error'); el.textContent = message; el.classList.add('show'); }
  function clearVideoError() { const el = $('video-error'); el.textContent = ''; el.classList.remove('show'); }

  function getEtsyVideoReadiness(video) {
    const issues = [];
    let status = 'READY';
    if (!Number.isFinite(video.duration) || video.duration < 3 || video.duration > 15) {
      status = 'NOT_READY';
      issues.push(Number.isFinite(video.duration) ? `视频时长为 ${Math.round(video.duration)} 秒，建议裁剪至 3–15 秒以内。` : '无法读取视频时长，请播放确认后再上传。');
    }
    if (video.size > 100 * 1024 * 1024) { status = 'NOT_READY'; issues.push(`视频仍有 ${formatSize(video.size)}，建议使用“平衡模式”再次压缩。`); }
    if (video.format !== 'MP4') { status = status === 'READY' ? 'WARNING' : status; issues.push('建议转换为兼容性更好的 MP4 格式。'); }
    if (Math.max(video.width || 0, video.height || 0) < 1080) { status = status === 'READY' ? 'WARNING' : status; issues.push('画面低于建议的 1080px 级别，请确认商品细节足够清晰。'); }
    if (Math.max(video.width || 0, video.height || 0) > 1920) { status = status === 'READY' ? 'WARNING' : status; issues.push('视频仍为较高分辨率；Etsy 展示通常使用 1080p 即可。'); }
    return {status, issues};
  }
  window.getEtsyVideoReadiness = getEtsyVideoReadiness;

  function recommendation(meta) {
    const longest = Math.max(meta.width, meta.height);
    const tips = [];
    if (longest >= 3840) tips.push('该视频为 4K。用于 Etsy 产品展示通常没有必要保留完整 4K，建议输出 1080p，可明显降低文件体积，同时保持良好的商品细节。');
    else if (longest >= 1080) tips.push('该视频已经是 1080p 级别，建议保持当前分辨率或输出 1080p，仅优化编码质量。');
    else tips.push('原视频分辨率低于 1080p，不建议放大，保持原始分辨率即可。');
    if (meta.duration > 15) tips.push('该视频超过 Etsy Listing Video 常用时长限制，建议先裁剪。');
    return tips.join(' ');
  }

  function readMetadata(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const video = document.createElement('video');
      video.preload = 'metadata'; video.muted = true; video.playsInline = true;
      const fail = () => { revoke(url); reject(new Error('decode')); };
      video.onerror = fail;
      video.onloadedmetadata = () => {
        if (!Number.isFinite(video.duration) || !video.videoWidth || !video.videoHeight) return fail();
        video.currentTime = Math.min(.1, Math.max(0, video.duration / 10));
      };
      video.onseeked = () => {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 320 / video.videoWidth);
        canvas.width = Math.max(1, Math.round(video.videoWidth * scale)); canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
        try { canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height); } catch (error) { console.warn('Thumbnail failed', error); }
        canvas.toBlob(blob => resolve({duration: video.duration, width: video.videoWidth, height: video.videoHeight, sourceUrl: url, thumbUrl: blob ? URL.createObjectURL(blob) : null, fps: null}), 'image/jpeg', .82);
      };
      video.src = url;
    });
  }

  function snapshotSettings() {
    return {mode: selected('video-mode'), resolution: $('video-resolution').value, fps: $('video-fps').value, audio: $('video-audio').value};
  }

  function renderJob(job) {
    const meta = job.meta;
    job.card.innerHTML = `<div class="video-card-head"><img src="${meta.thumbUrl || ''}" alt="视频第一帧预览"><div><h4>${safeName(job.file.name)}</h4><p>${job.format} · ${formatSize(job.file.size)} · ${formatDuration(meta.duration)}</p><p>${meta.width} × ${meta.height} · ${meta.width >= meta.height ? '横屏' : '竖屏'} · 帧率：${meta.fps || '无法读取'}</p></div><span class="job-state">等待中</span></div><p class="smart-tip">${recommendation(meta)}</p><div class="progress-track" hidden><span></span></div><p class="stage">等待压缩</p><div class="video-card-actions"><button class="text-button cancel-video" type="button">取消压缩</button><button class="text-button delete-video" type="button">删除</button></div><div class="video-result-detail"></div>`;
    job.card.querySelector('.cancel-video').onclick = () => cancelJob(job);
    job.card.querySelector('.delete-video').onclick = () => removeJob(job);
  }

  function setStage(job, text, progress) {
    job.card.querySelector('.stage').textContent = text;
    job.card.querySelector('.job-state').textContent = job.status === 'processing' ? '处理中' : text;
    const track = job.card.querySelector('.progress-track');
    if (typeof progress === 'number') { track.hidden = false; track.querySelector('span').style.width = `${Math.max(0, Math.min(100, progress))}%`; }
  }

  async function addFiles(files) {
    clearVideoError();
    for (const file of files) {
      const ext = file.name.split('.').pop().toLowerCase();
      if ((!allowedTypes.has(file.type) && !['mp4','mov','webm'].includes(ext))) { showVideoError(friendlyError.unsupported); continue; }
      if (!file.size || file.size > maxSafeSize) { showVideoError(friendlyError.large); continue; }
      const card = document.createElement('article'); card.className = 'video-card';
      card.innerHTML = `<h4>${safeName(file.name)}</h4><p class="stage">正在分析视频…</p>`;
      if (!jobs.length) $('video-results').innerHTML = '';
      $('video-results').append(card);
      try {
        const meta = await readMetadata(file);
        const job = {id: crypto.randomUUID(), file, format: ext === 'mov' ? 'MOV' : ext.toUpperCase(), meta, card, settings: snapshotSettings(), status: 'waiting', outputUrl: null, outputBlob: null};
        jobs.push(job); renderJob(job); updateVideoCount();
      } catch (error) { console.error('Video metadata error', error); card.remove(); showVideoError(friendlyError.decode); }
    }
    processQueue();
  }

  async function loadEngine(job) {
    if (ffmpeg) return ffmpeg;
    setStage(job, '正在准备压缩引擎…', 2);
    try {
      const [{FFmpeg}, {toBlobURL}] = await Promise.all([
        import('https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/esm/index.js'),
        import('https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.2/dist/esm/index.js')
      ]);
      const instance = new FFmpeg();
      instance.on('progress', ({progress}) => { if (currentJob && currentJob.status === 'processing') setStage(currentJob, `正在压缩 ${Math.round(progress * 100)}%`, Math.round(progress * 100)); });
      const base = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm';
      await instance.load({coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'), wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm')});
      ffmpeg = instance; return ffmpeg;
    } catch (error) { console.error('ffmpeg.wasm load failed', error); throw new Error('engine'); }
  }

  function outputDimensions(meta, resolution) {
    if (resolution === 'original') return {width: meta.width - meta.width % 2, height: meta.height - meta.height % 2};
    const target = Number(resolution);
    const longest = Math.max(meta.width, meta.height);
    if (longest <= target) return {width: meta.width - meta.width % 2, height: meta.height - meta.height % 2};
    const ratio = target / longest;
    return {width: Math.max(2, Math.round(meta.width * ratio / 2) * 2), height: Math.max(2, Math.round(meta.height * ratio / 2) * 2)};
  }

  async function transcode(job) {
    const engine = await loadEngine(job);
    if (cancelRequested) throw new Error('cancelled');
    const ext = job.file.name.split('.').pop().toLowerCase();
    const inputName = `input-${job.id}.${ext}`; const outputName = `output-${job.id}.mp4`;
    const data = new Uint8Array(await job.file.arrayBuffer());
    await engine.writeFile(inputName, data);
    const dims = outputDimensions(job.meta, job.settings.resolution);
    const crf = {quality: dims.width * dims.height >= 1920 * 1080 ? '20' : '19', balanced: '25', maximum: '30'}[job.settings.mode];
    const args = ['-i', inputName, '-map_metadata', '-1', '-vf', `scale=${dims.width}:${dims.height}:flags=lanczos`, '-c:v', 'libx264', '-preset', 'medium', '-crf', crf, '-pix_fmt', 'yuv420p'];
    if (job.settings.fps !== 'original') args.push('-r', job.settings.fps);
    if (job.settings.audio === 'keep') args.push('-c:a', 'aac', '-b:a', job.settings.mode === 'maximum' ? '96k' : '128k'); else args.push('-an');
    args.push('-movflags', '+faststart', outputName);
    try {
      await engine.exec(args);
      if (cancelRequested) throw new Error('cancelled');
      setStage(job, '正在生成 MP4…', 98);
      const output = await engine.readFile(outputName);
      job.outputBlob = new Blob([output.buffer], {type: 'video/mp4'});
      job.outputUrl = URL.createObjectURL(job.outputBlob); job.outputDimensions = dims;
      setStage(job, '正在完成处理…', 99);
    } finally {
      try { await engine.deleteFile(inputName); await engine.deleteFile(outputName); } catch (error) { console.debug('Temporary file cleanup', error); }
    }
  }

  async function processQueue() {
    if (running) return; running = true;
    while ((currentJob = jobs.find(job => job.status === 'waiting'))) {
      const job = currentJob; job.status = 'processing'; cancelRequested = false; setStage(job, '正在准备压缩引擎…', 1); updateVideoCount();
      try { await transcode(job); job.status = 'done'; renderCompleted(job); }
      catch (error) {
        console.error('Video transcode error', error);
        if (cancelRequested || error.message === 'cancelled') { job.status = 'cancelled'; setStage(job, '已取消'); }
        else { job.status = 'failed'; setStage(job, friendlyError[error.message] || (/memory|alloc|OOM/i.test(String(error)) ? friendlyError.memory : friendlyError.transcode)); }
      }
      currentJob = null; updateVideoCount();
    }
    running = false;
  }

  function renderCompleted(job) {
    const saved = Math.round((1 - job.outputBlob.size / job.file.size) * 100);
    const ready = getEtsyVideoReadiness({duration: job.meta.duration, size: job.outputBlob.size, width: job.outputDimensions.width, height: job.outputDimensions.height, format: 'MP4'});
    const label = ready.status === 'READY' ? '✓ Etsy Ready' : '⚠ Etsy 建议调整';
    setStage(job, '压缩完成 ✓', 100); job.card.querySelector('.job-state').textContent = label;
    job.card.querySelector('.cancel-video').remove();
    job.card.querySelector('.video-result-detail').innerHTML = `<div class="result-stats"><span>原始大小：<strong>${formatSize(job.file.size)}</strong></span><span>压缩后：<strong>${formatSize(job.outputBlob.size)}</strong></span><span>节省：<strong>${Math.max(0, saved)}%</strong></span><span>原始：<strong>${job.meta.width} × ${job.meta.height}</strong></span><span>输出：<strong>${job.outputDimensions.width} × ${job.outputDimensions.height}</strong></span><span>时长：<strong>${formatDuration(job.meta.duration)}</strong></span><span>模式：<strong>${modeNames[job.settings.mode]}</strong></span></div><div class="readiness ${ready.status.toLowerCase()}"><strong>${label}</strong><p>${ready.issues.join(' ') || `${formatDuration(job.meta.duration)} · ${job.outputDimensions.width} × ${job.outputDimensions.height} · ${formatSize(job.outputBlob.size)}`}</p></div><button class="button secondary preview-video" type="button">预览</button> <button class="button primary download-video" type="button">下载 MP4</button><div class="video-comparison" hidden><label>原视频<video src="${job.meta.sourceUrl}" controls preload="metadata"></video></label><label>压缩后<video src="${job.outputUrl}" controls preload="metadata"></video></label></div>`;
    job.card.querySelector('.preview-video').onclick = event => { const comparison = job.card.querySelector('.video-comparison'); comparison.hidden = !comparison.hidden; event.currentTarget.textContent = comparison.hidden ? '预览' : '收起预览'; };
    job.card.querySelector('.download-video').onclick = () => downloadJob(job);
  }

  function cancelJob(job) {
    if (job.status === 'waiting') { job.status = 'cancelled'; setStage(job, '已取消'); updateVideoCount(); return; }
    if (job !== currentJob || job.status !== 'processing') return;
    cancelRequested = true;
    try { ffmpeg?.terminate(); } catch (error) { console.debug('Terminate failed', error); }
    ffmpeg = null;
  }
  function cleanupJob(job) { revoke(job.meta?.sourceUrl); revoke(job.meta?.thumbUrl); revoke(job.outputUrl); job.outputUrl = null; job.outputBlob = null; }
  function removeJob(job) { if (job === currentJob) cancelJob(job); cleanupJob(job); const index = jobs.indexOf(job); if (index >= 0) jobs.splice(index, 1); job.card.remove(); updateVideoCount(); }
  function downloadJob(job) {
    if (job.status !== 'done' || !job.outputUrl) return;
    try { const a = document.createElement('a'); a.href = job.outputUrl; a.download = job.file.name.replace(/\.[^.]+$/, '') + '-etsy.mp4'; document.body.append(a); a.click(); a.remove(); }
    catch (error) { console.error('Download failed', error); showVideoError(friendlyError.download); }
  }
  function updateVideoCount() {
    const done = jobs.filter(job => job.status === 'done').length;
    $('video-result-count').textContent = jobs.length ? `${jobs.length} 个视频 · 已完成 ${done} 个` : '上传视频后将在这里显示';
    $('video-clear-all').hidden = !jobs.length; $('video-download-all').hidden = !done;
    if (!jobs.length) $('video-results').innerHTML = '<div class="result-empty">还没有待处理的视频</div>';
  }
  function clearAllVideos() {
    if (currentJob) cancelJob(currentJob);
    jobs.forEach(cleanupJob); jobs.length = 0; $('video-input').value = ''; updateVideoCount(); clearVideoError();
  }

  const videoDrop = $('video-drop-zone'); const videoInput = $('video-input');
  videoDrop.onclick = () => videoInput.click(); videoDrop.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); videoInput.click(); } };
  ['dragenter','dragover'].forEach(name => videoDrop.addEventListener(name, event => { event.preventDefault(); videoDrop.classList.add('dragover'); }));
  ['dragleave','drop'].forEach(name => videoDrop.addEventListener(name, event => { event.preventDefault(); videoDrop.classList.remove('dragover'); }));
  videoDrop.addEventListener('drop', event => addFiles([...event.dataTransfer.files]));
  videoInput.onchange = () => { addFiles([...videoInput.files]); videoInput.value = ''; };
  $('video-clear-all').onclick = clearAllVideos;
  $('video-download-all').onclick = () => jobs.filter(job => job.status === 'done').forEach((job, index) => setTimeout(() => downloadJob(job), index * 300));
  $('image-tab').onclick = () => switchTab(false); $('video-tab').onclick = () => switchTab(true);
  function switchTab(video) { $('image-compressor').hidden = video; $('video-compressor').hidden = !video; $('image-tab').classList.toggle('active', !video); $('video-tab').classList.toggle('active', video); $('image-tab').setAttribute('aria-selected', String(!video)); $('video-tab').setAttribute('aria-selected', String(video)); }
  window.addEventListener('beforeunload', () => jobs.forEach(cleanupJob));
})();
