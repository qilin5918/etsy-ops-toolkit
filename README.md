# Etsy Operations Toolkit

面向 Etsy 手作卖家的轻量工具：上传一张白底产品图，由 OpenAI 视觉模型生成英文 Listing；图片压缩功能继续完全在浏览器本地运行。

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
index.html              # Listing 图片上传、英文结果与图片压缩页面
style.css               # 响应式视觉样式
script.js               # 上传/校验/复制，以及原有图片压缩逻辑
test/api.test.js        # 后端 JSON 校验与解析测试
```
