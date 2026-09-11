# DWGC2E 官网

纯静态网站，可直接部署到 Cloudflare Pages。

## 本地预览

直接打开 `index.html`，或在项目目录执行：

```bash
python -m http.server 8080
```

然后访问 `http://localhost:8080/`。

## Cloudflare Pages

建议配置：

- Framework preset: `None`
- Build command: 留空
- Build output directory: `.`
- Production branch: `main`

部署完成后在 Pages 项目的 **Custom domains** 中绑定：

`cad.pocketter.dpdns.org`

## 上线前必须修改

### 1. 蓝奏云下载链接

打开：

`js/main.js`

修改：

```js
const DOWNLOAD_URL = "https://example.lanzou.com/xxxxx";
```

### 2. 软件版本号

同一文件中修改：

```js
const APP_VERSION = "1.0.0";
```

网站所有版本号会自动同步。

### 3. 联系方式

`index.html` Footer 当前使用：

`contact@example.com`

请替换为你的实际联系方式。

### 4. 隐私政策 / 用户协议

目前是适合原型阶段的基础文本。正式收费前请结合实际经营主体、支付渠道、退款政策和数据处理流程完善。

## 文件结构

```text
/
├── index.html
├── privacy.html
├── terms.html
├── favicon.svg
├── css/
│   └── style.css
├── js/
│   └── main.js
└── assets/
    ├── logo.svg
    └── og-cover.svg
```

## 交互效果

- Sticky / blur 顶部导航
- 鼠标跟随背景光
- Hero 产品界面 3D 轻微跟随
- 卡片 hover spotlight
- Scroll reveal
- 工作流程线条动画
- 价格月付 / 年付切换
- 产品界面 Tabs
- FAQ Accordion
- Magnetic CTA
- Mobile Menu
- `prefers-reduced-motion` 支持

不使用任何第三方 CDN、前端框架或 npm 构建。
