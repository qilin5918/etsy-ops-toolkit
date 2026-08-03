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
const productSchema=[['name','产品名称','text',true],['sku','SKU','text',true],['type','产品类型','text'],['animal','动物或造型','text'],['primaryColor','主色','text'],['secondaryColor','辅色','text'],['material','真实材质（须确认）','text',true],['size','尺寸（须确认）','text',true],['weight','重量（须确认）','text',true],['craft','手工工艺','text'],['audience','目标客户','text'],['recipient','礼物对象','text'],['scene','使用场景','text'],['emotion','产品亮点','text'],['licensed','授权状态（须确认）','select',true],['price','售价','number'],['cost','成本（须确认）','number',true],['shipping','运费','number']];
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
function generatePackage(){const p=products.find(x=>x.id===$('package-product').value);if(!p){toast('请先选择产品');return}const data=makePackage(p),checks=[['默认使用 Bag Charm',!(/keychain/i.test(data.title))],['动物名称明确',Boolean(p.animal)],['标题自然且未堆砌',words(data.title).length<=18&&!/^Handmade Leather/i.test(data.title)],['完整 13 个标签',data.tags.length===13],['每个标签不超过 20 字符',data.tags.every(t=>t.length<=20)],['授权说明',p.licensed!=='已授权'||/Authorization:/.test(data.description)]];$('brand-checks').className='checks';$('brand-checks').innerHTML=checks.map(([label,pass])=>`<span class="check ${pass?'pass':'warn'}">${pass?'✓':'!'} ${label}</span>`).join('');const fields=[['英文标题',data.title],['中文标题',data.titleZh],['英文描述',data.description,'wide'],['中文描述',data.descriptionZh,'wide'],['13 个英文标签',data.tags.join(', '),'wide'],['Materials',data.materials],['Primary Color',data.primary],['Secondary Color',data.secondary],['尺寸',data.size],['产品亮点',data.highlights],['礼物对象',data.recipient],['使用场景',data.scene],['授权说明',p.licensed==='已授权'?'Officially licensed for authorized sale.':'No third-party character or brand authorization is claimed.'],['图片拍摄建议',`白底正面主图；${p.animal||'产品'}细节与${p.craft||'工艺'}特写；挂在包上的比例场景图；礼物场景图`,'wide'],['每张图片 SEO 信息',`主图：${p.primaryColor||''} ${p.animal||''} Bag Charm front view\n细节图：${p.material||''} ${p.animal||''} craftsmanship close-up\n场景图：${p.animal||''} Bag Charm styled on a purse`,'wide']];$('package-output').innerHTML=fields.map(([label,value,wide])=>`<div class="package-field ${wide||''}"><h4>${label}</h4><p>${escapeHtml(value)}</p></div>`).join('');p.updatedAt=new Date().toISOString();p.lastAction='生成上架包';writeStore(STORE.products,products);renderDashboard()}
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
function renderDashboard(){const latestAds=new Map();ads.forEach(a=>{if(!latestAds.has(a.product))latestAds.set(a.product,a)});const states=[['待生成文案',products.filter(p=>p.lastAction!=='生成上架包').length],['待压缩图片',0],['待上架',products.filter(p=>p.lastAction==='生成上架包').length],['已上架',0],['广告观察中',ads.filter(a=>adMetrics(a).advice==='数据不足').length],['需要更换主图',ads.filter(a=>adMetrics(a).advice==='修改主图').length],['需要修改标题',ads.filter(a=>adMetrics(a).advice==='修改标题').length],['需要调整价格',ads.filter(a=>adMetrics(a).advice==='检查价格运费').length],['暂停广告',ads.filter(a=>adMetrics(a).advice==='暂停广告').length],['已出单',readStore('etsyOps.orders.v1',[]).length]];if($('status-summary'))$('status-summary').innerHTML=states.map(([label,count])=>`<div class="status-tile"><strong>${count}</strong><span>${label}</span></div>`).join('');$('dashboard-list').innerHTML=products.length?products.map(p=>{const a=latestAds.get(p.name),m=a&&adMetrics(a),next=m?m.advice:(p.animal?'生成上架包':'补充动物造型');return`<article class="dashboard-card"><h3>${escapeHtml(p.name)}</h3><span class="status-pill">主档已保存</span><span class="status-pill">${a?`广告：${m.advice}`:'广告：未投放'}</span><dl><dt>最后修改</dt><dd>${new Date(p.updatedAt).toLocaleString('zh-CN')}</dd><dt>最近操作</dt><dd>${escapeHtml(p.lastAction||'保存产品')}</dd></dl><div class="next-step">下一步：${escapeHtml(next)}</div></article>`}).join(''):'<div class="empty-inline">创建产品后，运营状态会显示在这里。</div>'}
resetProduct();loadRates();renderProducts();renderAds();

// Unified local image inbox. Original image bytes are deliberately never persisted.
const imageTypes={product:'产品白底图 / 场景图',listing:'Etsy Listing 页面截图',ads:'Etsy Ads 数据截图',order:'Etsy 订单截图',fees:'运费 / 费用 / 价格截图',unknown:'无法判断'};
const imageQueue=[];
const localKeys={orders:'etsyOps.orders.v1',comparisons:'etsyOps.comparisons.v1'};
let orders=readStore(localKeys.orders,[]),comparisons=readStore(localKeys.comparisons,[]);
const unifiedInput=$('unified-image-input'),unifiedDrop=$('unified-drop-zone');
unifiedDrop.onclick=()=>unifiedInput.click();
unifiedDrop.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();unifiedInput.click()}};
['dragenter','dragover'].forEach(type=>unifiedDrop.addEventListener(type,e=>{e.preventDefault();unifiedDrop.classList.add('dragover')}));
['dragleave','drop'].forEach(type=>unifiedDrop.addEventListener(type,e=>{e.preventDefault();unifiedDrop.classList.remove('dragover')}));
unifiedDrop.addEventListener('drop',e=>addToImageQueue([...e.dataTransfer.files]));
unifiedInput.onchange=()=>{addToImageQueue([...unifiedInput.files]);unifiedInput.value=''};
function addToImageQueue(files){
  hideError('upload-error');
  const valid=files.filter(file=>ALLOWED_LISTING_TYPES.includes(file.type)&&file.size<=25*1024*1024);
  if(valid.length!==files.length)showError('upload-error','部分文件已跳过：仅支持 JPG、PNG、WebP，单张不超过 25MB。');
  valid.forEach(file=>{const guess=EtsyOpsCore.classifyFilename(file.name),item={id:crypto.randomUUID(),file,name:file.name,url:URL.createObjectURL(file),type:guess.type,confidence:guess.confidence,confirmed:false,fields:{}};imageQueue.push(item);runLocalOCR(item)});
  renderImageQueue();
}
async function runLocalOCR(item){
  if(!('TextDetector' in window))return;
  try{
    const bitmap=await createImageBitmap(item.file),blocks=await new TextDetector().detect(bitmap);bitmap.close();
    const text=blocks.map(block=>block.rawValue).join('\n');item.ocrText=text;
    const explicit=/\bAd Views\b|\bClicks\b.*\bSpend\b/is.test(text)?'ads':/\bOrder(?: number| #)?\b|\bShip by\b/is.test(text)?'order':/\bListing\b.*\bPrice\b/is.test(text)?'listing':/\bTransaction fee\b|\bShipping cost\b/is.test(text)?'fees':null;
    if(item.type==='unknown'&&explicit){item.type=explicit;item.confidence=.72}
    const patterns={views:/Ad Views\s*[:\n]?\s*([\d,]+)/i,clicks:/Clicks\s*[:\n]?\s*([\d,]+)/i,spend:/Spend\s*[:$\n]?\s*([\d,.]+)/i,orders:/Orders\s*[:\n]?\s*([\d,]+)/i,revenue:/Revenue\s*[:$\n]?\s*([\d,.]+)/i,roas:/ROAS\s*[:\n]?\s*([\d,.]+)/i,favorites:/Favorites\s*[:\n]?\s*([\d,]+)/i,orderNumber:/Order(?: number| #)?\s*[:#\n]?\s*([A-Z0-9-]+)/i,country:/Ship(?:ping)? to\s*[:\n]?\s*([A-Za-z ]+)/i,shipBy:/Ship by\s*[:\n]?\s*([^\n]+)/i};
    Object.entries(patterns).forEach(([key,pattern])=>{const match=text.match(pattern);if(match)item.fields[key]=match[1].replace(/,/g,'').trim()});
    renderImageQueue();
  }catch{ /* Unsupported image/text is intentionally left for manual confirmation. */ }
}
function typeOptions(selected){return Object.entries(imageTypes).map(([value,label])=>`<option value="${value}" ${value===selected?'selected':''}>${label}</option>`).join('')}
function fieldsFor(item){
  const f=item.fields;
  if(item.type==='ads')return [['product','产品名称','text'],['dateRange','日期范围','text'],['views','Ad Views','number'],['clicks','Clicks','number'],['spend','Spend','number'],['orders','Orders','number'],['revenue','Revenue','number'],['roas','ROAS','number'],['favorites','Favorites','number']];
  if(item.type==='order')return [['orderNumber','订单号','text'],['product','产品','text'],['quantity','数量','number'],['personalization','个性化要求','text'],['country','收货国家','text'],['shipBy','发货截止时间','date'],['status','订单状态','text']];
  if(item.type==='fees')return [['price','售价','number'],['shippingCost','实际运费','number'],['adSpend','广告花费','number'],['etsyFees','Etsy 费用（参考）','number'],['cost','产品成本（须手动确认）','number'],['packaging','包装成本（须手动确认）','number'],['offline','其他线下成本（须手动确认）','number']];
  if(item.type==='product')return [['name','产品名称','text'],['sku','SKU','text'],['animal','动物或造型','text'],['primaryColor','主色','text'],['secondaryColor','辅色','text'],['material','真实材质（须确认）','text'],['size','尺寸（须确认）','text'],['weight','重量（须确认）','text'],['cost','成本（须确认）','number'],['licensed','授权状态（须确认）','text']];
  if(item.type==='listing')return [['title','标题','text'],['price','价格','number'],['shipping','运费','number'],['tags','标签','text'],['mainImageNote','主图观察','text']];
  return [];
}
function renderImageQueue(){
  setText('queue-count',imageQueue.length?`${imageQueue.length} 张 · ${imageQueue.filter(x=>!x.confirmed).length} 张待确认`:'暂无待处理图片');$('clear-queue').hidden=!imageQueue.length;
  $('image-queue').innerHTML=imageQueue.length?imageQueue.map(item=>`<article class="queue-card ${item.type==='unknown'?'needs-confirmation':''}" data-queue-id="${item.id}"><img src="${item.url}" alt="${escapeHtml(item.name)} 本地预览"><div class="queue-body"><header><div><h4>${escapeHtml(item.name)}</h4><span class="confidence ${item.confidence<.7?'low':''}">${item.type==='unknown'?'必须手动选择类型':item.confidence<.7?'低置信度 · 待确认':'初步分类 · 待确认'}</span></div><button class="text-button danger" data-queue-action="delete" type="button">删除</button></header><label class="type-picker">图片类型<select data-queue-type>${typeOptions(item.type)}</select></label>${item.type==='unknown'?'<p class="manual-warning">无法可靠判断图片类型，请手动选择后再继续。</p>':`<div class="ocr-note">本地识别草稿 · 请检查并编辑所有字段后确认</div><div class="field-grid compact">${fieldsFor(item).map(([key,label,type])=>`<label>${label}${['material','size','weight','cost','licensed','packaging','offline'].includes(key)?' <span>*</span>':''}<input data-ocr-field="${key}" type="${type}" ${type==='number'?'min="0" step="0.01"':''} value="${escapeHtml(item.fields[key]??'')}"></label>`).join('')}</div><button class="button primary confirm-image" data-queue-action="confirm" type="button">${item.confirmed?'已确认并保存 ✓':'确认字段并保存'}</button>`}</div></article>`).join(''):'<div class="empty-inline">上传后将在这里分类。低置信度字段会标记为“待确认”。</div>';
  refreshComparisonOptions();
}
$('image-queue').addEventListener('input',e=>{const card=e.target.closest('[data-queue-id]'),item=imageQueue.find(x=>x.id===card?.dataset.queueId);if(item&&e.target.dataset.ocrField)item.fields[e.target.dataset.ocrField]=e.target.value});
$('image-queue').addEventListener('change',e=>{if(!e.target.matches('[data-queue-type]'))return;const item=imageQueue.find(x=>x.id===e.target.closest('[data-queue-id]').dataset.queueId);item.type=e.target.value;item.confirmed=false;renderImageQueue()});
$('image-queue').addEventListener('click',e=>{const button=e.target.closest('[data-queue-action]');if(!button)return;const item=imageQueue.find(x=>x.id===button.closest('[data-queue-id]').dataset.queueId);if(button.dataset.queueAction==='delete'){URL.revokeObjectURL(item.url);imageQueue.splice(imageQueue.indexOf(item),1);renderImageQueue();return}confirmQueueItem(item)});
function requiredMissing(item){const requirements={product:['material','size','weight','cost','licensed'],fees:['cost','packaging','offline'],ads:[],order:['orderNumber','product','quantity','country','shipBy','status'],listing:[]};return (requirements[item.type]||[]).filter(key=>String(item.fields[key]??'').trim()==='')}
function confirmQueueItem(item){
  const missing=requiredMissing(item);if(missing.length){toast('请先确认所有带 * 的字段');return}
  item.confirmed=true;
  if(item.type==='product'){productSchema.forEach(([id])=>{if($(id)&&item.fields[id]!==undefined)$(id).value=item.fields[id]});$('type').value='Bag Charm';location.hash='products';toast('产品信息已填入主档，请检查后保存')}
  if(item.type==='ads'){const a={...Object.fromEntries(adSchema.map(([key,,type])=>[key,type==='number'?num(item.fields[key]):String(item.fields[key]||'')])),dateRange:item.fields.dateRange,id:crypto.randomUUID(),createdAt:new Date().toISOString(),source:'截图确认'};ads.unshift(a);writeStore(STORE.ads,ads);renderAds();toast('广告截图数据已确认保存')}
  if(item.type==='fees'){['price','shippingCost','adSpend','cost'].forEach(key=>{if($(key)&&item.fields[key]!==undefined)$(key).value=item.fields[key]});location.hash='profit';toast('费用数据已填入利润计算器，请检查费率')}
  if(item.type==='order'){const clean=EtsyOpsCore.sanitizeOrder({...item.fields,id:crypto.randomUUID(),createdAt:new Date().toISOString(),confirmed:true});orders.unshift(clean);writeStore(localKeys.orders,orders);renderOrders();toast('订单已保存（不含客户隐私）')}
  renderImageQueue();renderDashboard();
}
$('clear-queue').onclick=()=>{imageQueue.forEach(item=>URL.revokeObjectURL(item.url));imageQueue.length=0;renderImageQueue();toast('图片队列已清空')};
function renderOrders(){$('order-list').innerHTML=orders.length?orders.map(order=>`<article class="record-card"><header><div><h4>${escapeHtml(order.orderNumber)}</h4><p>${escapeHtml(order.product)} × ${Number(order.quantity)||0}</p></div><span class="status-pill">${escapeHtml(order.status)}</span></header><p>${escapeHtml(order.country)} · 发货截止 ${escapeHtml(order.shipBy)} · 客户隐私：••••••</p><p>${escapeHtml(order.personalization||'无个性化要求')}</p><div class="record-actions"><button class="danger" data-order-delete="${order.id}">删除</button></div></article>`).join(''):'<div class="empty-inline">暂无已确认订单</div>'}
$('order-list').onclick=e=>{const b=e.target.closest('[data-order-delete]');if(b&&confirm('确定删除这条订单记录？')){orders=orders.filter(x=>x.id!==b.dataset.orderDelete);writeStore(localKeys.orders,orders);renderOrders();renderDashboard()}};
function refreshComparisonOptions(){const listing=imageQueue.filter(x=>x.type==='listing');const html='<option value="">请选择 Listing 截图</option>'+listing.map(x=>`<option value="${x.id}">${escapeHtml(x.name)}</option>`).join('');['comparison-before','comparison-after'].forEach(id=>{const old=$(id).value;$(id).innerHTML=html;$(id).value=listing.some(x=>x.id===old)?old:''})}
$('comparison-date').valueAsDate=new Date();
$('comparison-form').onsubmit=e=>{e.preventDefault();const before=imageQueue.find(x=>x.id===$('comparison-before').value),after=imageQueue.find(x=>x.id===$('comparison-after').value);if(!before?.confirmed||!after?.confirmed){toast('请先确认两张 Listing 截图的字段');return}comparisons.unshift({id:crypto.randomUUID(),before:{name:before.name,...before.fields},after:{name:after.name,...after.fields},date:val('comparison-date'),reason:val('comparison-reason'),result:val('comparison-result')});writeStore(localKeys.comparisons,comparisons);renderComparisons();e.target.reset();$('comparison-date').valueAsDate=new Date();refreshComparisonOptions();toast('对比记录已保存')};
function renderComparisons(){$('comparison-list').innerHTML=comparisons.map(c=>`<article class="record-card"><header><h4>${escapeHtml(c.date)} Listing 优化</h4><button class="text-button danger" data-comparison-delete="${c.id}" type="button">删除</button></header><p><strong>修改：</strong>${escapeHtml(c.reason)}</p><p>${escapeHtml(c.before.title||'未识别标题')} → ${escapeHtml(c.after.title||'未识别标题')}</p><p><strong>结果：</strong>${escapeHtml(c.result||'观察中')}</p></article>`).join('')}
$('comparison-list').onclick=e=>{const b=e.target.closest('[data-comparison-delete]');if(b){comparisons=comparisons.filter(x=>x.id!==b.dataset.comparisonDelete);writeStore(localKeys.comparisons,comparisons);renderComparisons()}};
function downloadText(name,text,type){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),0)}
$('export-json').onclick=()=>downloadText(`etsy-ops-backup-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify({version:1,exportedAt:new Date().toISOString(),products,ads,orders,comparisons,rates:readStore(STORE.rates,{})},null,2),'application/json');
$('export-csv').onclick=()=>{const rows=[...products.map(x=>({recordType:'product',...x})),...ads.map(x=>({recordType:'ad',...x})),...orders.map(x=>({recordType:'order',...x}))];downloadText(`etsy-ops-export-${new Date().toISOString().slice(0,10)}.csv`,EtsyOpsCore.recordsToCSV(rows),'text/csv;charset=utf-8')};
$('clear-local-data').onclick=()=>{if(!confirm('这会清除产品、广告、订单、对比和费率。确定继续？'))return;Object.values({...STORE,...localKeys}).forEach(key=>localStorage.removeItem(key));products=[];ads=[];orders=[];comparisons=[];renderProducts();renderAds();renderOrders();renderComparisons();loadRates();toast('所有本地运营数据已清除')};
renderOrders();renderComparisons();renderImageQueue();
