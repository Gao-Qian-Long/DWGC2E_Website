# DWGC2E 官网

原生 HTML / CSS / JavaScript 网站，采用「工程翻译工坊」视觉体系，可沿用现有 Cloudflare Pages 部署流程，无前端框架或构建迁移。

## 本地预览

在项目目录执行：

```bash
python -m http.server 8080
```

访问 `http://localhost:8080/`。此静态服务器不提供 `/api`；账户、套餐等联网功能会显示不可用提示，不能据此验证真实支付。

## Cloudflare Pages

- Framework preset: `None`
- Build command: `node tools/stage-site.cjs`
- Build output directory: `public`
- Production branch: `main`

2026-09-15 治理批次已发布新会话适配，并改成白名单 public 输出构建。当前记录见 `docs/GOVERNANCE_20260915.md`；`docs/DEPLOYMENT_20260915.md` 保留为早期视觉改版历史。源码以 main 为生产分支，禁止恢复旧 root-output 发布设置。

## 下载与版本配置

`js/site-config.js` 中的 `downloadUrl` 和 `version` 统一控制下载入口与版本显示。更换安装包时更新配置后按现有流程发布。

## 产品边界

官网用于介绍 Windows 客户端、管理账户、会员、额度和订单。图纸解析与写回在客户端完成；官网不提供在线 DWG/DXF 上传处理。术语及在线翻译预览页继续明确当前能力边界，不伪造结果。首页会员入口连接现有购买页，价格以购买页实时信息为准。

## 视觉与交互

- 奶白纸底、墨色正文、琥珀橙强调；本地托管思源宋体展示子集与 Inter。
- 不对称首屏、工程 SVG 插图、错落编号章节、墨黑对比区、票据会员入口、报纸式 FAQ。
- 实色粘性导航、移动菜单、可暂停文字带、手动效果轮播、键盘灯箱、返回顶部。
- 账户／支付／工具／协议页面统一工作台样式，二维码保持纯白底。
- 可见焦点、菜单和弹层关闭后焦点返回、减少动态效果支持。

共享样式位于 `css/theme.css`；详细变更、字体维护方式、本地验证范围及限制见 `docs/WORKSHOP_REDESIGN.md`。接口接入说明继续保留在 `docs/WEB_INTEGRATION.md`。
