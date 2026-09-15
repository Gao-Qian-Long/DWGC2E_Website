# 正式发布记录 · 2026-09-15

用户明确指示“部署上线吧”后执行。仅发布官网，没有修改后端业务或数据库。

- 正式域名：https://cad.pocketter.dpdns.org/
- 项目：dwgc2e-website
- 环境：Production / main
- 新部署 ID：c7a3a5b1-50a8-481c-8b16-dec279ff958f
- 固定版本地址：https://c7a3a5b1.dwgc2e-website.pages.dev
- 上一正式部署：2c2da6dd-9958-4c06-8658-34b27dab2658
- 上一版本地址：https://2c2da6dd.dwgc2e-website.pages.dev
- 部署方式：Wrangler 4.131.1，通过现有项目直接上传当前工作目录的发布快照；标记 commit-dirty=true。
- Git：基于 beb933f7c1ba487f1daa939b3c3c5ce8642fd35e 的未提交工作目录快照，未提交、未推送、未回退本地文件。

## 发布隔离

发布快照在 `D:\DWGC2E\artifacts\workshop-redesign\release-20260915`。只包含页面、CSS、JS、图片、字体、图标、robots/sitemap、原 _headers/_routes 和原 functions/api 转发函数。没有上传 .git、.wrangler、本地测试服务器、模拟会话、验收截图或内部文档。API 转发函数与原工作目录一致，成功编译上传。

哈希清单：同级 `release-manifest.json`。上传前扫描未发现模拟账号、测试 token、测试二维码或本地模拟地址。

## 上线检查

- Cloudflare 部署列表确认新 ID 为 Production / main 最新部署。
- 正式域名 51 个公开文件返回 200；50 个文件与发布快照 SHA-256 完全相同。
- robots.txt 内容差异来自 Cloudflare 添加的 Managed Content；原有 Allow 与 Sitemap 保留，不是发布文件丢失。
- 浏览器检查首页、账户、套餐页：新主题加载、无页面级横向溢出、无脚本异常；账户显示登录表单，套餐页保留登录后购买入口。
- `/api/v1/version` 返回 200。
- 未登录访问 `/api/v1/health` 与 `/api/v1/billing/plans` 返回 401。对上一正式部署执行相同只读请求也返回 401，属于现有后端鉴权行为。服务状态栏因此可能显示无法确认，不能据此宣称服务正常或宕机。
- 没有执行真实注册、登录提交、付款、邮件发送、反馈提交或订单修改。

详细结果：`D:\DWGC2E\artifacts\workshop-redesign\production-verification.json`。

## 后续与回退

当前线上是直接上传的本地快照，GitHub main 未包含这次未提交改版。下一次从 Git 自动部署前需先审查并同步当前源码，否则可能把线上覆盖为仓库旧版本。

如需回退，可在 Cloudflare Pages 当前项目中选择上一正式部署 ID 执行回退。本轮仅记录回退目标，没有实际执行回退。
