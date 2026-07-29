const OPENAI_URL = 'https://api.openai.com/v1/responses';
const MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const ALLOWED_IMAGE_PATTERN = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const STANDARD_COLORS = ['Black', 'White', 'Brown', 'Beige', 'Yellow', 'Blue', 'Red', 'Green', 'Pink', 'Orange', 'Gray', 'Purple', 'Gold', 'Silver'];

const responseSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    title: { type: 'string' }, description: { type: 'string' },
    primaryColor: { type: 'string', enum: STANDARD_COLORS },
    secondaryColor: { type: 'string', enum: [...STANDARD_COLORS, 'Not specified'] },
    tags: { type: 'array', minItems: 13, maxItems: 13, items: { type: 'string', maxLength: 20 } },
    detectedProduct: { type: 'string' }, warnings: { type: 'array', items: { type: 'string' } }
  },
  required: ['title', 'description', 'primaryColor', 'secondaryColor', 'tags', 'detectedProduct', 'warnings']
};

const instructions = `Analyze the uploaded white-background product photo. The store always sells a Leather Bag Charm made from Genuine Leather to the United States. Write natural American English in a warm, playful, comforting, giftable brand voice. Only use details visibly supported by the image. Never invent dimensions, weight, construction, functionality, or unseen details.

Identify the exact animal, object, or shape; primary and secondary colors; visible leather panels; visible stitching; overall style; likely recipients; and gift occasions. If the shape cannot be identified confidently, return the exact Chinese warning "无法准确识别产品造型，请更换一张更清晰的白底图片。" in warnings. In that case detectedProduct may describe the uncertainty, but all customer-facing listing fields must remain English.

Title: 3-7 English words, ideally <=45 characters, mobile-friendly, containing the accurate animal/object shape and the exact words "Bag Charm". Never begin with "Handmade Leather"; do not keyword-stuff or add a subtitle.

Description: English only, ready for Etsy. Use three short paragraphs: (1) shape and emotional appeal, (2) only visible colors, leather paneling, stitching, and form details, (3) suitable recipients and gift occasions. Then add exactly these concise detail labels: Product type: Leather bag charm; Material: Genuine leather; Primary color: [standard color]; Secondary color: [standard color or Not specified]; Suitable for: [audience]. Do not claim anything not visible.

Colors must use only the allowed standard values. Return exactly 13 unique English tags. Every tag must be <=20 characters, a natural multi-word search phrase, directly relevant, and collectively cover shape/animal, bag charm, leather charm, purse accessory, recipient, occasion, style, and use. Avoid broad single words, unrelated trends, and repetitive phrases.`;

function validateResult(value) {
  if (!value || typeof value !== 'object') return false;
  const fields = ['title', 'description', 'primaryColor', 'secondaryColor', 'detectedProduct'];
  if (fields.some(key => typeof value[key] !== 'string' || !value[key].trim()) || !Array.isArray(value.warnings)) return false;
  if (!STANDARD_COLORS.includes(value.primaryColor) || ![...STANDARD_COLORS, 'Not specified'].includes(value.secondaryColor)) return false;
  if (!Array.isArray(value.tags) || value.tags.length !== 13 || value.tags.some(tag => typeof tag !== 'string' || !tag.trim() || tag.length > 20 || /[\u3400-\u9fff]/.test(tag))) return false;
  if (new Set(value.tags.map(tag => tag.toLowerCase())).size !== 13) return false;
  return !/[\u3400-\u9fff]/.test([value.title, value.description, value.primaryColor, value.secondaryColor].join(' '));
}

function extractOutput(response) {
  if (typeof response.output_text === 'string' && response.output_text) return response.output_text;
  for (const item of response.output || []) for (const content of item.content || []) if (content.type === 'output_text' && content.text) return content.text;
  return '';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: '仅支持 POST 请求。' }); }
  if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: '服务端尚未配置 OpenAI API Key。' });
  const image = req.body?.image;
  if (typeof image !== 'string' || !ALLOWED_IMAGE_PATTERN.test(image)) return res.status(400).json({ error: '图片格式不支持，请上传 JPG、PNG 或 WebP 图片。' });
  if (Buffer.byteLength(image, 'utf8') > 4.1 * 1024 * 1024) return res.status(413).json({ error: '图片太大，请上传不超过 3MB 的图片。' });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55000);
  try {
    const openaiResponse = await fetch(OPENAI_URL, {
      method: 'POST', signal: controller.signal,
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL, instructions,
        input: [{ role: 'user', content: [{ type: 'input_text', text: 'Analyze this product photo and return the Etsy listing JSON.' }, { type: 'input_image', image_url: image, detail: 'high' }] }],
        text: { format: { type: 'json_schema', name: 'etsy_listing', strict: true, schema: responseSchema } }
      })
    });
    const payload = await openaiResponse.json().catch(() => null);
    if (!openaiResponse.ok) { console.error('OpenAI request failed', openaiResponse.status, payload?.error?.type); return res.status(502).json({ error: 'AI 服务请求失败，请稍后重试。' }); }
    let result;
    try { result = JSON.parse(extractOutput(payload)); } catch { return res.status(502).json({ error: 'AI 返回结果无法读取，请重试。' }); }
    if (!validateResult(result)) return res.status(502).json({ error: 'AI 返回结果缺少字段或格式不正确，请重试。' });
    return res.status(200).json(result);
  } catch (error) {
    if (error.name === 'AbortError') return res.status(504).json({ error: 'AI 服务响应超时，请稍后重试。' });
    console.error('Analyze listing request failed', error.message);
    return res.status(502).json({ error: 'API 请求失败，请稍后重试。' });
  } finally { clearTimeout(timeout); }
};

module.exports.validateResult = validateResult;
module.exports.extractOutput = extractOutput;
