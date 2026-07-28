const $ = (id) => document.getElementById(id);
const form = $('listing-form');
const fieldIds = ['product-name','product-type','materials','primary-color','secondary-color','size','audience','occasion','emotion'];
const examples = { 'product-name':'Moonlight Ceramic Mug','product-type':'handmade ceramic coffee mug','materials':'stoneware clay, food-safe glaze','primary-color':'cream white','secondary-color':'midnight blue','size':'350 ml / 9 × 8 cm','audience':'coffee lovers and homebodies','occasion':'birthday, housewarming or self-care gift','emotion':'calm, comfort and a small moment of wonder' };
const val = id => $(id).value.trim();
const cap = text => text ? text.charAt(0).toUpperCase()+text.slice(1) : '';
const cleanTag = text => text.toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim().slice(0,20).trim();

$('fill-example').addEventListener('click', () => { Object.entries(examples).forEach(([id,value]) => $(id).value=value); hideError('listing-error'); });
form.addEventListener('submit', (event) => {
  event.preventDefault();
  const required = ['product-name','product-type','materials','primary-color'];
  const missing = required.filter(id => !val(id));
  if (missing.length) { showError('listing-error','请填写所有带 * 的必填项目，再生成文案。'); $(missing[0]).focus(); return; }
  hideError('listing-error');
  const d = Object.fromEntries(fieldIds.map(id => [id,val(id)]));
  const audience = d.audience || 'thoughtful gift seekers';
  const occasion = d.occasion || 'birthdays and meaningful moments';
  const emotion = d.emotion || 'warmth, character and everyday joy';
  const sizeLine = d.size ? `Sized at ${d.size}, it is made for comfortable everyday use.` : 'Thoughtfully proportioned for comfortable everyday use.';
  const enTitle = `${cap(d['product-name'])} — A Thoughtful ${cap(d['product-type'])} for ${cap(audience)}`;
  const enDescription = `Bring ${emotion} into the everyday with this ${d['product-type']}. ${d['product-name']} is carefully made from ${d.materials}, pairing ${d['primary-color']}${d['secondary-color'] ? ` with touches of ${d['secondary-color']}` : ''} for a quietly distinctive finish.\n\n${sizeLine} Each piece has the subtle variations that make handmade work special. It is a lovely choice for ${audience}, and a meaningful gift for ${occasion}.\n\nDETAILS\n• Materials: ${d.materials}\n• Color: ${d['primary-color']}${d['secondary-color'] ? ` and ${d['secondary-color']}` : ''}${d.size ? `\n• Size: ${d.size}` : ''}\n\nMade with care and ready to become part of someone’s daily ritual.`;
  const zhTitle = `${d['product-name']}｜为${audience}用心制作的${d['product-type']}`;
  const zhDescription = `让这件${d['product-type']}为日常带来${emotion}。${d['product-name']}采用${d.materials}细心制作，以${d['primary-color']}为主色${d['secondary-color'] ? `，搭配${d['secondary-color']}细节` : ''}，呈现安静而独特的质感。\n\n${d.size ? `尺寸为 ${d.size}，` : ''}适合${audience}日常使用，也适合作为${occasion}的暖心礼物。手工制作带来的细微差异，让每一件作品都拥有自己的个性。\n\n材质：${d.materials}\n颜色：${d['primary-color']}${d['secondary-color'] ? `、${d['secondary-color']}` : ''}${d.size ? `\n尺寸：${d.size}` : ''}`;
  const rawTags = [d['product-type'],d['product-name'],'handmade gift',`${d['primary-color']} decor`,d.materials.split(',')[0],audience.split(/,| and /)[0],occasion.split(/,| or /)[0],'artisan made','unique keepsake','thoughtful present','small batch made','cozy home gift',d['secondary-color'] || 'made with care'];
  const tags=[]; rawTags.map(cleanTag).forEach(t => { if(t && !tags.includes(t)) tags.push(t); });
  const fallbacks=['etsy handmade','gift for her','gift for him','everyday beauty']; fallbacks.forEach(t=>{if(tags.length<13&&!tags.includes(t))tags.push(t)});
  setText('en-title',enTitle); setText('en-description',enDescription); setText('zh-title',zhTitle); setText('zh-description',zhDescription);
  $('tags').innerHTML=tags.slice(0,13).map(t=>`<span class="tag">${escapeHtml(t)}</span>`).join(''); setText('tags-text',tags.slice(0,13).join(', '));
  setText('out-materials',d.materials); setText('out-primary',d['primary-color']); setText('out-secondary',d['secondary-color']||'Not specified');
  $('empty-output').hidden=true; $('output-content').hidden=false;
  if(innerWidth<800) $('listing-output').scrollIntoView({behavior:'smooth',block:'start'});
});
function setText(id,text){ $(id).textContent=text; }
function escapeHtml(s){ const e=document.createElement('div');e.textContent=s;return e.innerHTML; }
function showError(id,message){ $(id).textContent=message;$(id).classList.add('show'); }
function hideError(id){ $(id).classList.remove('show'); }
function toast(message){ const el=$('toast');el.textContent=message;el.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),1800); }
document.querySelectorAll('.copy-button').forEach(btn=>btn.addEventListener('click',async()=>{ const text=$(btn.dataset.copy).textContent; try{await navigator.clipboard.writeText(text)}catch{const area=document.createElement('textarea');area.value=text;document.body.append(area);area.select();document.execCommand('copy');area.remove()} btn.textContent='Copied ✓';btn.classList.add('copied');toast('已复制到剪贴板');setTimeout(()=>{btn.textContent='Copy';btn.classList.remove('copied')},1500); }));

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
  for(const file of valid){ const card=createProcessingCard(file); results.append(card); try{const item=await compressImage(file);compressed.push(item);renderCard(card,item)}catch(err){card.innerHTML=`<div></div><div><h4>${escapeHtml(file.name)}</h4><p class="processing">处理失败：图片可能已损坏或浏览器不支持。</p></div>`} }
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
function updateCount(){$('result-count').textContent=`已完成 ${compressed.length} 张图片`; $('download-all').hidden=!compressed.length}
function download(item){const a=document.createElement('a');a.href=item.url;a.download=item.name;document.body.append(a);a.click();a.remove()}
$('download-all').addEventListener('click',()=>{compressed.forEach((item,i)=>setTimeout(()=>download(item),i*250));toast(`正在下载 ${compressed.length} 张图片`)});
