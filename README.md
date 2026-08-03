# Etsy Operations Toolkit

面向 Etsy 手作卖家的本地优先运营工具：从产品主档、双语上架包到广告和利润分析集中在一个响应式页面中；原有 AI Listing 与图片压缩功能保持不变。

## 功能

### AI Etsy Listing

- 只需上传一张 JPG、PNG 或 WebP 白底产品图（最大 3MB），无需填写任何文字。
- 服务端通过 OpenAI Responses API 识别造型、颜色、可见皮革拼接及缝线等细节。
- 固定商品设定为美国市场的 Genuine Leather Bag Charm，生成自然的美国英语。
- 输出简短 English Title、English Description、标准 Primary/Secondary Color，以及正好 13 个 Etsy Tags。
- 前后端均校验 Tag 数量、长度、重复项和中文字符；每个字段均可单独复制，也可使用 Copy All。
- Listing 图片会发送给 AI 服务分析；OpenAI API Key 仅从服务端环境变量读取，不会进入浏览器代码或 API 响应。

### Image Compressor

- 同时导入多张 JPG、PNG 或 WebP（单张最大 25MB）。
- 在浏览器中转换为标准 RGB JPG，并保持图片原始宽高比例。
- 逐步调节 JPG 质量，尽量压缩到 1MB 以下；必要时等比缩小超大图片。
- 显示原始/压缩后大小、尺寸和节省比例，支持逐张下载及全部下载。
- 图片只在当前浏览器中处理，不会离开设备。

### 产品主档与品牌规则

- 保存名称、SKU、类型、动物造型、颜色、材质、尺寸、人群、礼物对象、场景、情绪价值、授权、售价、成本和运费。
- 支持新增、编辑、复制和删除；默认产品类型为 `Bag Charm`，所有主档均存储在浏览器 `localStorage`。
- 上架包生成时检查动物名称、标题关键词堆砌、13 个标签及 20 字符限制；已授权商品强制包含授权说明。

### 完整 Etsy 上架包

- 从产品主档生成英文/中文标题与描述、13 个英文标签、Materials、主辅色、尺寸、亮点、礼物对象和使用场景。
- 英文标题避免目录式表达，不以 `Handmade Leather` 开头，也不会自动把商品称为 `Keychain`。

### 广告、利润与运营看板

- 广告分析器支持手动输入及带引号字段的 CSV 导入，计算 CTR、CPC、CVR、ROAS、每单广告成本和净利润，并提供行动建议。
- 利润计算器的刊登费、交易费率、支付费率/固定费和其他费率均可修改、本地保存；输出自然流量利润、广告后利润、保本 ROAS、广告预算上限和折扣后利润。
- 运营看板汇总主档状态、广告状态、最后修改时间、最近操作与下一步建议。

## 本地数据与 CSV 格式

除 AI Listing 上传的单张产品图外，新运营模块的数据不会发送到服务器。清除浏览器站点数据会同时清除产品、广告记录与费率设置，请按需自行备份。

广告 CSV 第一行可使用以下英文表头：

```csv
product,days,ad views,clicks,spend,orders,revenue,favorites,price,cost,shipping
Fox Charm,14,1200,36,18.50,3,89.70,12,29.90,8.00,4.50
```

## 本地开发

Listing 接口是 Vercel Serverless Function，因此推荐使用 Vercel CLI：

```bash
npm install
npx vercel dev
```

在项目根目录创建不会提交到 Git 的 `.env.local`：

```dotenv
OPENAI_API_KEY=your_openai_api_key
```

然后打开终端显示的本地地址。可选环境变量 `OPENAI_MODEL` 可覆盖默认视觉模型 `gpt-4.1-mini`。

> 仅运行 `python3 -m http.server 8000` 可以查看页面并使用图片压缩，但静态服务器不会运行 `/api/analyze-listing`。

## 部署到 Vercel

1. 将仓库导入 Vercel，Framework Preset 选择 **Other**；项目无需 Build Command。
2. 在项目的 **Settings → Environment Variables** 新增 `OPENAI_API_KEY`，值为 OpenAI API Key，并按需勾选 Production、Preview 和 Development。
3. 重新部署，使环境变量应用到 Serverless Function。
4. 打开部署地址，上传一张不超过 3MB 的白底产品图进行验证。

也可以使用 CLI：

```bash
vercel env add OPENAI_API_KEY
vercel --prod
```

请勿将 Key 写入 `index.html`、`script.js` 或任何提交文件。`.gitignore` 已排除常见本地环境变量文件。

## 测试

```bash
npm test
```

## 文件结构

```text
api/analyze-listing.js  # 安全调用 OpenAI Responses API 的 Vercel 后端
index.html              # AI Listing、产品、上架、广告、利润、看板与压缩页面
style.css               # 完整桌面端/手机端响应式视觉样式
script.js               # 本地数据、生成/校验/计算、CSV、图片上传与压缩逻辑
test/api.test.js        # 后端 JSON 校验与解析测试
```
