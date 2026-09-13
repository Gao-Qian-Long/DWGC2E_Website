# DWGC2E 官网

纯静态网站，可直接部署到 Cloudflare Pages 免费方案。

## 本地预览

直接打开 `index.html`，或在项目目录执行：

```bash
python -m http.server 8080
```

然后访问 `http://localhost:8080/`。

## Cloudflare Pages

- Framework preset: `None`
- Build command: 留空
- Build output directory: `.`
- Production branch: `main`

## 发布下载

下载地址集中配置在 `js/site-config.js` 的 `downloadUrl`。当前已接入蓝奏云下载页；以后更换安装包时，只需替换这个地址并提交到 `main`，Cloudflare Pages 会自动重新部署。

版本号配置在同一文件的 `version`，页面上的版本信息会自动同步。

## 当前产品边界

官网是 DWGC2E Windows 桌面翻译软件的产品介绍和官方下载入口，不提供在线 DWG/DXF 上传、解析或翻译。在线账号、会员、额度和 APP API 后端将在后续阶段单独接入；当前页面不会伪造登录或支付结果。

## 文件结构

```text
/
├── index.html
├── privacy.html
├── terms.html
├── favicon.svg
├── css/style.css
├── js/site-config.js
├── js/main.js
└── assets/
```

## 已实现交互

- Sticky / blur 顶部导航、移动端菜单
- Scroll reveal、滚动进度、回到顶部
- 价格月付 / 年付切换
- 产品界面 Tabs、演示进度反馈
- FAQ Accordion
- 效果对比轮播、触摸滑动、图片灯箱、Escape 关闭
- 下载按钮统一接入配置中的外部链接
- `prefers-reduced-motion` 支持

不使用第三方 CDN、前端框架或 npm 构建。
