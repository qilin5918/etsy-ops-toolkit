const $ = (id) => document.getElementById(id);
const form = $('listing-form');
const zhFieldIds = ['product-name','product-type','materials','primary-color','secondary-color','size','audience','occasion','emotion'].map(id => `zh-${id}`);
const enFieldIds = ['product-name','product-type','materials','primary-color','secondary-color','size','audience','occasion','emotion'].map(id => `en-${id}`);
const examples = {
  'zh-product-name':'月光陶瓷马克杯','zh-product-type':'手工陶瓷咖啡杯','zh-materials':'炻器陶土、食品级釉料','zh-primary-color':'奶油白','zh-secondary-color':'午夜蓝','zh-size':'350 毫升 / 9 × 8 厘米','zh-audience':'咖啡爱好者与居家生活爱好者','zh-occasion':'生日、乔迁或犒赏自己的礼物','zh-emotion':'宁静、治愈与日常的小惊喜',
  'en-product-name':'Moonlight Ceramic Mug','en-product-type':'handmade ceramic coffee mug','en-materials':'stoneware clay, food-safe glaze','en-primary-color':'cream white','en-secondary-color':'midnight blue','en-size':'350 ml / 9 × 8 cm','en-audience':'coffee lovers and homebodies','en-occasion':'birthdays, housewarmings, or self-care gifts','en-emotion':'calm, comfort, and a small moment of wonder'
};
const val = id => $(id).value.trim();
const cap = text => text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
const cleanTag = text => text.toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim().slice(0,20).trim();
const containsChinese = text => /[\u3400-\u9fff]/.test(text);

$('fill-example').addEventListener('click', () => {
  Object.entries(examples).forEach(([id,value]) => $(id).value = value);
  hideError('listing-error');
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const requiredZh = ['zh-product-name','zh-product-type','zh-materials','zh-primary-color'];
  const requiredEn = ['en-product-name','en-product-type','en-materials','en-primary-color'];
  const missingZh = requiredZh.filter(id => !val(id));
  const missingEn = requiredEn.filter(id => !val(id));
  const invalidEn = enFieldIds.filter(id => containsChinese(val(id)));
  if (missingEn.length || invalidEn.length) {
    showError('listing-error','请填写英文商品信息，避免英文文案中出现中文内容。');
    $(missingEn[0] || invalidEn[0]).focus();
    return;
  }
  if (missingZh.length) {
    showError('listing-error','请填写中文商品信息中所有带 * 的必填项目。');
    $(missingZh[0]).focus();
    return;
  }
  hideError('listing-error');
  const zh = Object.fromEntries(zhFieldIds.map(id => [id.replace('zh-',''), val(id)]));
  const en = Object.fromEntries(enFieldIds.map(id => [id.replace('en-',''), val(id)]));

  const enAudience = en.audience || 'thoughtful gift seekers';
  const enOccasion = en.occasion || 'birthdays and meaningful moments';
  const enEmotion = en.emotion || 'warmth, character, and everyday joy';
  const sizeLine = en.size ? `Sized at ${en.size}, it is made for comfortable everyday use.` : 'Thoughtfully proportioned for comfortable everyday use.';
  const enTitle = `${cap(en['product-name'])} — A Thoughtful ${cap(en['product-type'])} for ${cap(enAudience)}`;
  const enDescription = `Bring ${enEmotion} into the everyday with this ${en['product-type']}. ${en['product-name']} is carefully made from ${en.materials}, pairing ${en['primary-color']}${en['secondary-color'] ? ` with touches of ${en['secondary-color']}` : ''} for a quietly distinctive finish.\n\n${sizeLine} Each piece has the subtle variations that make handmade work special. It is a lovely choice for ${enAudience}, and a meaningful gift for ${enOccasion}.\n\nDETAILS\n• Materials: ${en.materials}\n• Color: ${en['primary-color']}${en['secondary-color'] ? ` and ${en['secondary-color']}` : ''}${en.size ? `\n• Size: ${en.size}` : ''}\n\nMade with care and ready to become part of someone’s daily ritual.`;

  const zhAudience = zh.audience || '珍惜手作温度的人';
  const zhOccasion = zh.occasion || '生日与值得纪念的时刻';
  const zhEmotion = zh.emotion || '温暖、个性与日常喜悦';
  const zhTitle = `${zh['product-name']}｜为${zhAudience}用心制作的${zh['product-type']}`;
  const zhDescription = `让这件${zh['product-type']}为日常带来${zhEmotion}。${zh['product-name']}采用${zh.materials}细心制作，以${zh['primary-color']}为主色${zh['secondary-color'] ? `，搭配${zh['secondary-color']}细节` : ''}，呈现安静而独特的质感。\n\n${zh.size ? `尺寸为${zh.size}，` : ''}适合${zhAudience}日常使用，也适合作为${zhOccasion}的暖心礼物。手工制作带来的细微差异，让每一件作品都拥有自己的个性。\n\n材料：${zh.materials}\n颜色：${zh['primary-color']}${zh['secondary-color'] ? `、${zh['secondary-color']}` : ''}${zh.size ? `\n尺寸：${zh.size}` : ''}`;

  const rawTags = [en['product-type'],en['product-name'],'handmade gift',`${en['primary-color']} decor`,en.materials.split(',')[0],enAudience.split(/,| and /)[0],enOccasion.split(/,| or /)[0],'artisan made','unique keepsake','thoughtful present','small batch made','cozy home gift',en['secondary-color'] || 'made with care'];
  const tags = [];
  rawTags.map(cleanTag).forEach(tag => { if (tag && !tags.includes(tag)) tags.push(tag); });
  ['etsy handmade','gift for her','gift for him','everyday beauty','handcrafted item','creative gift','artisan decor','special occasion'].forEach(tag => { if (tags.length < 13 && !tags.includes(tag)) tags.push(tag); });
  const zhKeywords = [zh['product-type'],zh['product-name'],'手工礼物',`${zh['primary-color']}家居`,zh.materials.split(/、|，/)[0],zhAudience.split(/、|与|和/)[0],zhOccasion.split(/、|或/)[0],'匠心制作','独特纪念品','暖心赠礼','小批量手作','温馨家居礼物',zh['secondary-color'] || '用心制作'];

  setText('en-title',enTitle); setText('en-description',enDescription);
  $('tags').innerHTML = tags.slice(0,13).map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('');
  setText('tags-text',tags.slice(0,13).join(', '));
  setText('en-out-materials',en.materials); setText('en-out-primary',en['primary-color']);
  setText('en-out-secondary',en['secondary-color'] || 'Not specified'); setText('en-out-size',en.size || 'Not specified');
  setText('zh-title',zhTitle); setText('zh-description',zhDescription);
  $('zh-keywords').innerHTML = zhKeywords.map(keyword => `<span class="tag">${escapeHtml(keyword)}</span>`).join('');
  setText('zh-keywords-text',zhKeywords.join('、'));
  setText('zh-out-materials',zh.materials); setText('zh-out-primary',zh['primary-color']);
  setText('zh-out-secondary',zh['secondary-color'] || '未填写'); setText('zh-out-size',zh.size || '未填写');
  $('empty-output').hidden = true; $('output-content').hidden = false;
  if (innerWidth < 800) $('listing-output').scrollIntoView({behavior:'smooth',block:'start'});
});

function setText(id,text){ $(id).textContent = text; }
function escapeHtml(s){ const e=document.createElement('div'); e.textContent=s; return e.innerHTML; }
function showError(id,message){ $(id).textContent=message; $(id).classList.add('show'); }
function hideError(id){ $(id).classList.remove('show'); }
function toast(message){ const el=$('toast'); el.textContent=message; el.classList.add('show'); clearTimeout(toast.timer); toast.timer=setTimeout(()=>el.classList.remove('show'),1800); }
async function copyText(text){
  try { await navigator.clipboard.writeText(text); }
  catch { const area=document.createElement('textarea'); area.value=text; document.body.append(area); area.select(); document.execCommand('copy'); area.remove(); }
}
document.querySelectorAll('.copy-button').forEach(btn => btn.addEventListener('click', async () => {
  await copyText($(btn.dataset.copy).textContent);
  const original=btn.textContent; btn.textContent=original === '复制' ? '已复制 ✓' : 'Copied ✓'; btn.classList.add('copied'); toast('已复制到剪贴板');
  setTimeout(()=>{ btn.textContent=original; btn.classList.remove('copied'); },1500);
}));
const copyGroups = {
  english: [['English Title','en-title'],['English Description','en-description'],['13 Etsy Tags','tags-text'],['Materials','en-out-materials'],['Primary Color','en-out-primary'],['Secondary Color','en-out-secondary'],['Size','en-out-size']],
  chinese: [['中文标题','zh-title'],['中文产品描述','zh-description'],['13 个中文关键词参考','zh-keywords-text'],['材料','zh-out-materials'],['主要颜色','zh-out-primary'],['次要颜色','zh-out-secondary'],['尺寸','zh-out-size']]
};
document.querySelectorAll('.copy-all').forEach(btn => btn.addEventListener('click', async () => {
  const text=copyGroups[btn.dataset.copyGroup].map(([label,id]) => `${label}\n${$(id).textContent}`).join('\n\n');
  await copyText(text); toast(btn.dataset.copyGroup === 'english' ? 'English listing copied' : '已复制全部中文内容');
}));

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
