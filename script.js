const $ = (id) => document.getElementById(id);
const ALLOWED_LISTING_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_LISTING_SIZE = 3 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 60000;
const STANDARD_COLORS = ['Black', 'White', 'Brown', 'Beige', 'Yellow', 'Blue', 'Red', 'Green', 'Pink', 'Orange', 'Gray', 'Purple', 'Gold', 'Silver'];
let listingImage = null;
let listingPreviewUrl = null;

function setText(id, text) { $(id).textContent = text; }
function escapeHtml(value) { const element = document.createElement('div'); element.textContent = value; return element.innerHTML; }
function showError(id, message) { $(id).textContent = message; $(id).classList.add('show'); }
function hideError(id) { $(id).textContent = ''; $(id).classList.remove('show'); }
function toast(message) { const element = $('toast'); element.textContent = message; element.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => element.classList.remove('show'), 1800); }
function containsChinese(text) { return /[\u3400-\u9fff]/.test(text); }

const listingInput = $('listing-image-input');
const listingDrop = $('listing-drop-zone');
const generateButton = $('generate-listing');

listingDrop.addEventListener('click', () => { if (!listingImage) listingInput.click(); });
listingDrop.addEventListener('keydown', (event) => {
  if ((event.key === 'Enter' || event.key === ' ') && !listingImage) { event.preventDefault(); listingInput.click(); }
});
['dragenter', 'dragover'].forEach(name => listingDrop.addEventListener(name, event => { event.preventDefault(); listingDrop.classList.add('dragover'); }));
['dragleave', 'drop'].forEach(name => listingDrop.addEventListener(name, event => { event.preventDefault(); listingDrop.classList.remove('dragover'); }));
listingDrop.addEventListener('drop', event => selectListingImage(event.dataTransfer.files[0]));
listingInput.addEventListener('change', () => { selectListingImage(listingInput.files[0]); listingInput.value = ''; });
$('replace-listing-image').addEventListener('click', () => listingInput.click());
$('remove-listing-image').addEventListener('click', clearListingImage);

function selectListingImage(file) {
  hideError('listing-error');
  if (!file) return;
  if (!ALLOWED_LISTING_TYPES.includes(file.type)) { showError('listing-error', '图片格式不支持，请上传 JPG、PNG 或 WebP 图片。'); return; }
  if (file.size > MAX_LISTING_SIZE) { showError('listing-error', '图片太大，请上传不超过 3MB 的图片。'); return; }
  if (listingPreviewUrl) URL.revokeObjectURL(listingPreviewUrl);
  listingImage = file;
  listingPreviewUrl = URL.createObjectURL(file);
  $('listing-preview').src = listingPreviewUrl;
  setText('listing-file-name', file.name);
  $('listing-upload-prompt').hidden = true;
  $('listing-preview-wrap').hidden = false;
  $('listing-image-actions').hidden = false;
  generateButton.disabled = false;
  resetListingOutput();
}

function clearListingImage() {
  if (listingPreviewUrl) URL.revokeObjectURL(listingPreviewUrl);
  listingImage = null; listingPreviewUrl = null; listingInput.value = '';
  $('listing-preview').removeAttribute('src');
  $('listing-upload-prompt').hidden = false;
  $('listing-preview-wrap').hidden = true;
  $('listing-image-actions').hidden = true;
  generateButton.disabled = true;
  hideError('listing-error');
  resetListingOutput();
}

function resetListingOutput() {
  $('empty-output').hidden = false;
  $('output-content').hidden = true;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('read_failed'));
    reader.readAsDataURL(file);
  });
}

function validateListing(data) {
  if (!data || typeof data !== 'object') return '返回结果缺少字段，请重试。';
  const textFields = ['title', 'description', 'primaryColor', 'secondaryColor', 'detectedProduct'];
  if (textFields.some(field => typeof data[field] !== 'string' || !data[field].trim()) || !Array.isArray(data.warnings)) return '返回结果缺少字段，请重试。';
  if (!Array.isArray(data.tags) || data.tags.length !== 13) return 'AI 返回的 Tags 数量不是 13 个，请重试。';
  if (data.tags.some(tag => typeof tag !== 'string' || !tag.trim())) return '返回结果缺少有效的 Tags，请重试。';
  if (data.tags.some(tag => tag.length > 20)) return 'AI 返回了超过 20 个字符的 Tag，请重试。';
  if (new Set(data.tags.map(tag => tag.toLowerCase())).size !== 13) return 'AI 返回了重复的 Tags，请重试。';
  const englishContent = [data.title, data.description, data.primaryColor, data.secondaryColor, ...data.tags].join(' ');
  if (containsChinese(englishContent)) return 'AI 返回的英文结果包含中文，请重试。';
  if (!STANDARD_COLORS.includes(data.primaryColor) || ![...STANDARD_COLORS, 'Not specified'].includes(data.secondaryColor)) return 'AI 返回了无效的颜色，请重试。';
  return '';
}

$('listing-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!listingImage) { showError('listing-error', '请先上传一张白底产品图片。'); return; }
  hideError('listing-error');
  generateButton.disabled = true;
  generateButton.classList.add('loading');
  setText('listing-status', '正在分析产品图片并生成 Etsy 文案……');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const image = await fileToDataUrl(listingImage);
    const response = await fetch('/api/analyze-listing', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image }), signal: controller.signal
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error || 'API 请求失败，请稍后重试。');
    const validationError = validateListing(data);
    if (validationError) throw new Error(validationError);
    if (data.warnings.includes('无法准确识别产品造型，请更换一张更清晰的白底图片。')) {
      throw new Error('无法准确识别产品造型，请更换一张更清晰的白底图片。');
    }
    renderListing(data);
  } catch (error) {
    const message = error.name === 'AbortError' ? '网络请求超时，请检查网络后重试。' : (error.message || 'API 请求失败，请稍后重试。');
    showError('listing-error', message);
  } finally {
    clearTimeout(timeout);
    generateButton.disabled = !listingImage;
    generateButton.classList.remove('loading');
    setText('listing-status', '');
  }
});

function renderListing(data) {
  setText('en-title', data.title); setText('en-description', data.description);
  setText('en-out-primary', data.primaryColor); setText('en-out-secondary', data.secondaryColor);
  $('tags').innerHTML = data.tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('');
  setText('tags-text', data.tags.join(', '));
  $('empty-output').hidden = true; $('output-content').hidden = false;
  if (innerWidth < 800) $('listing-output').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); }
  catch { const area = document.createElement('textarea'); area.value = text; document.body.append(area); area.select(); document.execCommand('copy'); area.remove(); }
}
document.querySelectorAll('.copy-button').forEach(button => button.addEventListener('click', async () => {
  await copyText($(button.dataset.copy).textContent);
  const original = button.textContent; button.textContent = 'Copied ✓'; button.classList.add('copied'); toast('Copied to clipboard');
  setTimeout(() => { button.textContent = original; button.classList.remove('copied'); }, 1500);
}));
$('copy-all-listing').addEventListener('click', async () => {
  const text = [['Title', 'en-title'], ['Description', 'en-description'], ['Primary Color', 'en-out-primary'], ['Secondary Color', 'en-out-secondary'], ['13 Etsy Tags', 'tags-text']]
    .map(([label, id]) => `${label}\n${$(id).textContent}`).join('\n\n');
  await copyText(text); toast('English listing copied');
});

const input=$('image-input'), drop=$('drop-zone'), results=$('image-results'); let compressed=[];
drop.addEventListener('click',()=>input.click()); drop.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();input.click()}});
['dragenter','dragover'].forEach(name=>drop.addEventListener(name,e=>{e.preventDefault();drop.classList.add('dragover')}));
['dragleave','drop'].forEach(name=>drop.addEventListener(name,e=>{e.preventDefault();drop.classList.remove('dragover')}));
drop.addEventListener('drop',e=>handleFiles([...e.dataTransfer.files])); input.addEventListener('change',()=>{handleFiles([...input.files]);input.value=''});
async function handleFiles(files){
  hideError('image-error'); if(!files.length)return;
  const valid=files.filter(f=>['image/jpeg','image/png','image/webp'].includes(f.type)&&f.size<=25*1024*1024);
  if(valid.length!==files.length)showError('image-error','部分文件已跳过：仅支持 JPG、PNG、WebP，且单张不能超过 25MB。');
  if(!valid.length)return; if(!compressed.length)results.innerHTML='';
  for(const file of valid){ const card=createProcessingCard(file); results.append(card); try{const item=await compressImage(file);compressed.push(item);renderCard(card,item);updateCount()}catch(err){card.innerHTML=`<div></div><div><h4>${escapeHtml(file.name)}</h4><p class="processing">处理失败：图片可能已损坏或浏览器不支持。</p></div>`} }
  updateCount();
}
function createProcessingCard(file){const card=document.createElement('div');card.className='image-card';card.innerHTML=`<div></div><div><h4>${escapeHtml(file.name)}</h4><p class="processing">正在压缩…</p></div>`;return card}
function loadImage(file){return new Promise((resolve,reject)=>{const img=new Image(),url=URL.createObjectURL(file);img.onload=()=>{URL.revokeObjectURL(url);resolve(img)};img.onerror=()=>{URL.revokeObjectURL(url);reject()};img.src=url})}
async function compressImage(file){
  const img=await loadImage(file), canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
  const ctx=canvas.getContext('2d',{alpha:false});ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0);
  let quality=.9,blob=await canvasBlob(canvas,quality); while(blob.size>1024*1024&&quality>.45){quality-=.08;blob=await canvasBlob(canvas,quality)}
  if(blob.size>1024*1024){const scale=Math.sqrt((1024*1024*.92)/blob.size), temp=document.createElement('canvas');temp.width=Math.max(1,Math.round(canvas.width*scale));temp.height=Math.max(1,Math.round(canvas.height*scale));temp.getContext('2d',{alpha:false}).drawImage(canvas,0,0,temp.width,temp.height);blob=await canvasBlob(temp,.78)}
  return {name:file.name.replace(/\.[^.]+$/, '')+'-compressed.jpg',original:file.size,blob,url:URL.createObjectURL(blob),width:img.naturalWidth,height:img.naturalHeight};
}
function canvasBlob(canvas,q){return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Canvas export failed')),'image/jpeg',q))}
function formatSize(bytes){return bytes<1024*1024?`${(bytes/1024).toFixed(0)} KB`:`${(bytes/1024/1024).toFixed(2)} MB`}
function renderCard(card,item){const saved=Math.max(0,Math.round((1-item.blob.size/item.original)*100));card.innerHTML=`<img src="${item.url}" alt="压缩图片预览"><div><h4>${escapeHtml(item.name)}</h4><p>${item.width} × ${item.height}px · ${formatSize(item.original)} → <strong>${formatSize(item.blob.size)}</strong> <span class="saving">${saved ? `节省 ${saved}%` : '已转为 JPG'}</span></p></div><button class="download-button" type="button">下载 JPG</button>`;card.querySelector('button').onclick=()=>download(item)}
function updateCount(){
  const hasResults=compressed.length>0;
  $('result-count').textContent=hasResults?`已完成 ${compressed.length} 张图片`:'上传图片后将在这里显示';
  $('clear-all').hidden=!hasResults;
  $('download-all').hidden=!hasResults;
}
function clearCompressed(){
  compressed.forEach(item=>URL.revokeObjectURL(item.url));
  compressed.length=0;
  results.innerHTML='<div class="result-empty">还没有待处理的图片</div>';
  input.value='';
  updateCount();
  toast('已清除所有压缩结果');
}
function download(item){const a=document.createElement('a');a.href=item.url;a.download=item.name;document.body.append(a);a.click();a.remove()}
$('clear-all').addEventListener('click',clearCompressed);
$('download-all').addEventListener('click',()=>{compressed.forEach((item,i)=>setTimeout(()=>{if(compressed.includes(item))download(item)},i*250));toast(`正在下载 ${compressed.length} 张图片`)});
