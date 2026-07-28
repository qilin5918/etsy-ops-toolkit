# Etsy Operations Toolkit

一个无需后端、无需 API Key 的 Etsy 店铺日常运营网页工具。所有文案生成和图片处理均在浏览器本地完成。

## 功能

### Etsy Listing Content

- 根据产品名称、类型、材质、颜色、尺寸、受众、送礼场景和情绪价值生成自然的中英文标题及描述。
- 自动整理 13 个英文 Etsy Tags、Materials、Primary Color 和 Secondary Color。
- 每一个输出区均可单独复制，并提供一键填入的示例数据。

### Image Compressor

- 同时导入多张 JPG、PNG 或 WebP（单张最大 25MB）。
- 在浏览器中转换为标准 RGB JPG，并保持图片原始宽高比例。
- 逐步调节 JPG 质量，尽量压缩到 1MB 以下；必要时等比缩小超大图片。
- 显示原始/压缩后大小、尺寸和节省比例，支持逐张下载及全部下载。

## 本地使用

无需安装依赖。直接双击 `index.html`，或在项目目录启动任意静态文件服务器：

```bash
python3 -m http.server 8000
```

然后访问 <http://localhost:8000>。

> 字体通过 Google Fonts 加载；离线时会自动使用系统字体，所有核心功能仍可正常使用。

## 文件结构

```text
index.html  # 页面结构和表单
style.css   # 响应式视觉样式
script.js   # 文案生成、复制和图片压缩逻辑
README.md   # 使用说明
```
