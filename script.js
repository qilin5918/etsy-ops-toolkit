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

// Local-first product, listing, advertising, profit and operations tools.
const STORE={products:'etsyOps.products.v1',ads:'etsyOps.ads.v1',rates:'etsyOps.rates.v1'};
const readStore=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
const writeStore=(key,value)=>localStorage.setItem(key,JSON.stringify(value));
let products=readStore(STORE.products,[]),ads=readStore(STORE.ads,[]);
const productSchema=[['name','产品名称','text',true],['sku','SKU','text',true],['type','产品类型','text'],['animal','动物造型','text'],['primaryColor','颜色','text'],['secondaryColor','辅助颜色','text'],['material','材质','text'],['size','尺寸','text'],['audience','适用人群','text'],['recipient','礼物对象','text'],['scene','使用场景','text'],['emotion','情绪价值','text'],['licensed','授权状态','select'],['price','售价','number'],['cost','成本','number'],['shipping','运费','number']];
const adSchema=[['product','产品','text'],['days','投放天数','number'],['views','Ad Views','number'],['clicks','Clicks','number'],['spend','Spend','number'],['orders','Orders','number'],['revenue','Revenue','number'],['favorites','Favorites','number'],['price','售价','number'],['cost','成本','number'],['shipping','运费','number']];
const defaultRates={listingFee:.2,transactionRate:6.5,paymentRate:3,paymentFixed:.25,otherRate:0,discount:0};
const profitSchema=[['price','售价','number'],['cost','成本','number'],['shippingCharged','买家支付运费','number'],['shippingCost','实际运费','number'],['adSpend','广告花费','number'],['discount','折扣率 %','number'],['listingFee','刊登费','number'],['transactionRate','交易费率 %','number'],['paymentRate','支付费率 %','number'],['paymentFixed','支付固定费','number'],['otherRate','其他费率 %','number']];
function fieldMarkup(schema){return schema.map(([id,label,type,required])=>`<label>${escapeHtml(label)}${required?' <span>*</span>':''}${type==='select'?`<select id="${id}" ${required?'required':''}><option value="未授权">未授权</option><option value="已授权">已授权</option></select>`:`<input id="${id}" type="${type}" ${type==='number'?'min="0" step="0.01"':''} ${required?'required':''}>`}</label>`).join('')}
$('product-fields').innerHTML=fieldMarkup(productSchema);$('ad-fields').innerHTML=fieldMarkup(adSchema);$('profit-fields').innerHTML=fieldMarkup(profitSchema);
const val=id=>$(id).value.trim(),num=value=>Number(value)||0,money=value=>`$${Number(value).toFixed(2)}`;
function collect(schema){return Object.fromEntries(schema.map(([id,,type])=>[id,type==='number'?num($(id).value):val(id)]))}
function resetProduct(){ $('product-form').reset();$('type').value='Bag Charm';$('product-id').value='';setText('product-form-title','新增产品') }
$('reset-product').onclick=resetProduct;
$('product-form').addEventListener('submit',event=>{event.preventDefault();const data=collect(productSchema),id=val('product-id'),now=new Date().toISOString();if(id){const old=products.find(p=>p.id===id);Object.assign(old,data,{updatedAt:now,lastAction:'编辑产品'});}else products.unshift({...data,id:crypto.randomUUID(),createdAt:now,updatedAt:now,lastAction:'新增产品'});writeStore(STORE.products,products);resetProduct();renderProducts();toast('产品已保存到本地')});
function renderProducts(){setText('product-count',`${products.length} 件产品`);$('product-list').innerHTML=products.length?products.map(p=>`<article class="record-card"><header><div><h4>${escapeHtml(p.name)}</h4><p>${escapeHtml(p.sku)} · ${escapeHtml(p.type||'Bag Charm')} · ${money(p.price)}</p></div><span class="status-pill">${escapeHtml(p.licensed)}</span></header><p>${escapeHtml([p.animal,p.primaryColor,p.material,p.size].filter(Boolean).join(' · ')||'尚未补充产品细节')}</p><div class="record-actions"><button data-product-action="edit" data-id="${p.id}">编辑</button><button data-product-action="copy" data-id="${p.id}">复制</button><button data-product-action="package" data-id="${p.id}">生成上架包</button><button class="danger" data-product-action="delete" data-id="${p.id}">删除</button></div></article>`).join(''):'<div class="empty-inline">还没有产品，先创建第一件产品吧。</div>';refreshProductSelect();renderDashboard()}
$('product-list').addEventListener('click',event=>{const b=event.target.closest('[data-product-action]');if(!b)return;const p=products.find(x=>x.id===b.dataset.id);if(b.dataset.productAction==='edit'){productSchema.forEach(([id])=>$(id).value=p[id]??'');$('product-id').value=p.id;setText('product-form-title','编辑产品');$('product-form').scrollIntoView({behavior:'smooth'});}if(b.dataset.productAction==='copy'){const now=new Date().toISOString();products.unshift({...p,id:crypto.randomUUID(),name:`${p.name} Copy`,sku:`${p.sku}-COPY`,createdAt:now,updatedAt:now,lastAction:'复制产品'});writeStore(STORE.products,products);renderProducts();}if(b.dataset.productAction==='delete'&&confirm(`确定删除 ${p.name}？`)){products=products.filter(x=>x.id!==p.id);writeStore(STORE.products,products);renderProducts();}if(b.dataset.productAction==='package'){$('package-product').value=p.id;generatePackage();location.hash='package';}});
function refreshProductSelect(){const current=$('package-product').value;$('package-product').innerHTML='<option value="">请选择产品</option>'+products.map(p=>`<option value="${p.id}">${escapeHtml(p.name)} (${escapeHtml(p.sku)})</option>`).join('');if(products.some(p=>p.id===current))$('package-product').value=current}
function words(value){return String(value||'').trim().split(/\s+/).filter(Boolean)}
function uniqueTags(p){const candidates=[`${p.animal} bag charm`,`${p.primaryColor} charm`,`${p.material} accessory`,'bag charm','purse accessory','gift for her',p.recipient,p.scene,p.emotion,`${p.animal} gift`,'cute bag accessory','handmade charm','leather bag charm','small thoughtful gift','purse charm'];const out=[];for(const raw of candidates){const tag=String(raw||'').trim().toLowerCase().slice(0,20).trim();if(tag&&!out.includes(tag))out.push(tag);if(out.length===13)break}for(let i=1;out.length<13;i++)out.push(`bag charm gift ${i}`);return out}
function makePackage(p){const productType=/keychain/i.test(p.type||'')?'Bag Charm':(p.type||'Bag Charm');const animal=p.animal||'Animal';const title=`${animal} ${productType} in ${p.primaryColor||'Classic Color'}, ${p.material||'Handcrafted'} Purse Accessory${p.recipient?` Gift for ${p.recipient}`:''}`;const license=p.licensed==='已授权'?`\n\nAuthorization: This product is officially licensed for authorized sale.`:'';return{title,titleZh:`${p.primaryColor||''}${animal}${productType}，${p.material||'手作'}包包装饰`,description:`Add a warm, playful detail to your favorite bag with this ${String(animal).toLowerCase()} ${productType}. Made from ${p.material||'quality materials'} in ${p.primaryColor||'a versatile color'}, it is designed for ${p.audience||'everyday accessory lovers'}.\n\nSize: ${p.size||'Please contact us for details'}\nPerfect for: ${p.recipient||'a thoughtful gift'}\nOccasions: ${p.scene||'everyday use'}${license}`,descriptionZh:`用这款${animal}${productType}为日常包袋增添温暖有趣的细节。采用${p.material||'优质材料'}制作，主色为${p.primaryColor||'经典色'}。\n\n尺寸：${p.size||'请咨询详情'}\n礼物对象：${p.recipient||'适合作为贴心礼物'}\n使用场景：${p.scene||'日常使用'}${p.licensed==='已授权'?'\n\n授权说明：本产品已获得正式销售授权。':''}`,tags:uniqueTags(p),materials:p.material||'Not specified',primary:p.primaryColor||'Not specified',secondary:p.secondaryColor||'Not specified',size:p.size||'Not specified',highlights:[`${animal} design`,p.emotion||'Thoughtful detail',`${productType} for bags`].join(' · '),recipient:p.recipient||'Gift recipient not specified',scene:p.scene||'Everyday use'}}
function generatePackage(){const p=products.find(x=>x.id===$('package-product').value);if(!p){toast('请先选择产品');return}const data=makePackage(p),checks=[['默认使用 Bag Charm',!(/keychain/i.test(data.title))],['动物名称明确',Boolean(p.animal)],['标题自然且未堆砌',words(data.title).length<=18&&!/^Handmade Leather/i.test(data.title)],['完整 13 个标签',data.tags.length===13],['每个标签不超过 20 字符',data.tags.every(t=>t.length<=20)],['授权说明',p.licensed!=='已授权'||/Authorization:/.test(data.description)]];$('brand-checks').className='checks';$('brand-checks').innerHTML=checks.map(([label,pass])=>`<span class="check ${pass?'pass':'warn'}">${pass?'✓':'!'} ${label}</span>`).join('');const fields=[['英文标题',data.title],['中文标题',data.titleZh],['英文描述',data.description,'wide'],['中文描述',data.descriptionZh,'wide'],['13 个英文标签',data.tags.join(', '),'wide'],['Materials',data.materials],['Primary Color',data.primary],['Secondary Color',data.secondary],['尺寸',data.size],['产品亮点',data.highlights],['礼物对象',data.recipient],['使用场景',data.scene]];$('package-output').innerHTML=fields.map(([label,value,wide])=>`<div class="package-field ${wide||''}"><h4>${label}</h4><p>${escapeHtml(value)}</p></div>`).join('');p.updatedAt=new Date().toISOString();p.lastAction='生成上架包';writeStore(STORE.products,products);renderDashboard()}
$('generate-package').onclick=generatePackage;
function adMetrics(a){const ctr=a.views?a.clicks/a.views*100:0,cpc=a.clicks?a.spend/a.clicks:0,cvr=a.clicks?a.orders/a.clicks*100:0,roas=a.spend?a.revenue/a.spend:0,cpa=a.orders?a.spend/a.orders:0,profit=a.revenue-a.orders*(a.cost+a.shipping)-a.spend;let advice='数据不足';if(a.views>=500&&ctr<1)advice='修改主图';else if(a.clicks>=20&&cvr<1)advice='修改标题';else if(a.clicks>=20&&a.orders===0)advice='检查价格运费';else if(a.spend>=a.price&&a.orders===0)advice='暂停广告';else if(a.orders>=2&&roas>=2)advice='继续投放';return{ctr,cpc,cvr,roas,cpa,profit,advice}}
$('ad-form').addEventListener('submit',e=>{e.preventDefault();const a={...collect(adSchema),id:crypto.randomUUID(),createdAt:new Date().toISOString()};ads.unshift(a);writeStore(STORE.ads,ads);e.target.reset();renderAds();toast('广告数据已保存')});
function renderAds(){setText('ad-count',`${ads.length} 条记录`);$('ad-results').innerHTML=ads.length?ads.map(a=>{const m=adMetrics(a);return`<article class="record-card"><header><h4>${escapeHtml(a.product||'未命名产品')}</h4><span class="recommendation">${m.advice}</span></header><p>${a.days} 天 · ${a.views} Views · ${a.clicks} Clicks · ${a.orders} Orders</p><div class="metric-row"><div class="metric"><strong>${m.ctr.toFixed(2)}%</strong><span>CTR</span></div><div class="metric"><strong>${money(m.cpc)}</strong><span>CPC</span></div><div class="metric"><strong>${m.cvr.toFixed(2)}%</strong><span>CVR</span></div><div class="metric"><strong>${m.roas.toFixed(2)}</strong><span>ROAS</span></div><div class="metric"><strong>${money(m.cpa)}</strong><span>每单广告</span></div><div class="metric"><strong>${money(m.profit)}</strong><span>净利润</span></div></div></article>`}).join(''):'<div class="empty-inline">暂无广告数据</div>';renderDashboard()}
$('clear-ads').onclick=()=>{ads=[];writeStore(STORE.ads,ads);renderAds()};
function parseCSV(text){const rows=[];let row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i],next=text[i+1];if(c==='"'&&quoted&&next==='"'){cell+='"';i++}else if(c==='"')quoted=!quoted;else if(c===','&&!quoted){row.push(cell);cell=''}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&next==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell=''}else cell+=c}row.push(cell);if(row.some(x=>x.trim()))rows.push(row);return rows}
$('ad-csv').onchange=async e=>{const file=e.target.files[0];if(!file)return;const rows=parseCSV(await file.text());if(rows.length<2){toast('CSV 没有可导入的数据');return}const normalize=s=>s.toLowerCase().replace(/[^a-z]/g,''),headers=rows[0].map(normalize),aliases={product:['product','产品'],days:['days','投放天数'],views:['adviews','views'],clicks:['clicks'],spend:['spend'],orders:['orders'],revenue:['revenue'],favorites:['favorites'],price:['price','售价'],cost:['cost','成本'],shipping:['shipping','运费']};rows.slice(1).forEach(row=>{const item={};adSchema.forEach(([key,,type])=>{const index=headers.findIndex(h=>aliases[key].some(a=>normalize(a)===h));item[key]=type==='number'?num(row[index]):String(row[index]||'').trim()});ads.unshift({...item,id:crypto.randomUUID(),createdAt:new Date().toISOString()})});writeStore(STORE.ads,ads);renderAds();e.target.value='';toast(`已导入 ${rows.length-1} 条广告数据`)};
function loadRates(){const rates={...defaultRates,...readStore(STORE.rates,{})};profitSchema.forEach(([id])=>{if(rates[id]!==undefined)$(id).value=rates[id]})}
$('save-rates').onclick=()=>{const data=collect(profitSchema);writeStore(STORE.rates,Object.fromEntries(['listingFee','transactionRate','paymentRate','paymentFixed','otherRate'].map(k=>[k,data[k]])));toast('费率设置已保存')};
$('profit-form').addEventListener('submit',e=>{e.preventDefault();const d=collect(profitSchema),sale=d.price*(1-d.discount/100),gross=sale+d.shippingCharged,fees=d.listingFee+d.paymentFixed+gross*(d.transactionRate+d.paymentRate+d.otherRate)/100,organic=gross-d.cost-d.shippingCost-fees,withAds=organic-d.adSpend,maxAd=Math.max(0,organic),breakEven=sale?1/(Math.max(.0001,(sale-d.cost-d.shippingCost-fees)/sale)):0;$('profit-results').className='metric-grid';$('profit-results').innerHTML=[['未投广告利润',organic],['投广告后利润',withAds],['保本 ROAS',breakEven,'x'],['最大可承担广告花费',maxAd],['折扣后利润',withAds]].map(([label,value,suffix])=>`<div class="profit-card"><strong>${suffix?value.toFixed(2)+suffix:money(value)}</strong><span>${label}</span></div>`).join('')});
function renderDashboard(){const latestAds=new Map();ads.forEach(a=>{if(!latestAds.has(a.product))latestAds.set(a.product,a)});$('dashboard-list').innerHTML=products.length?products.map(p=>{const a=latestAds.get(p.name),m=a&&adMetrics(a),next=m?m.advice:(p.animal?'生成上架包':'补充动物造型');return`<article class="dashboard-card"><h3>${escapeHtml(p.name)}</h3><span class="status-pill">主档已保存</span><span class="status-pill">${a?`广告：${m.advice}`:'广告：未投放'}</span><dl><dt>最后修改</dt><dd>${new Date(p.updatedAt).toLocaleString('zh-CN')}</dd><dt>最近操作</dt><dd>${escapeHtml(p.lastAction||'保存产品')}</dd></dl><div class="next-step">下一步：${escapeHtml(next)}</div></article>`}).join(''):'<div class="empty-inline">创建产品后，运营状态会显示在这里。</div>'}
resetProduct();loadRates();renderProducts();renderAds();
