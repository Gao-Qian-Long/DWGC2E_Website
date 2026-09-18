# 网页正式部署记录 — 2026-09-18

- 用户明确授权部署并直接上线。
- 项目：dwgc2e-website；Production / main。
- 部署 ID：fde2aff2-7481-4194-bbf8-7ac3971a89e3。
- 正式域名：https://cad.pocketter.dpdns.org/
- 固定版本：https://fde2aff2.dwgc2e-website.pages.dev
- 上一正式部署（回退目标）：82538ddc-a54e-48c3-accb-2af33c9fffbf。
- Wrangler 直接上传本地白名单快照，commit-dirty=true；未执行 Git commit/push。源 HEAD：5d7a761ccae2defbc02f666983d8135bf595524c。
- 上传76个静态资产（6个新上传，70个已存在），另上传 headers/routes/编译后的 Pages Functions。未上传内部文档、测试、Git 目录。
- 未部署独立 Worker、修改数据库、修改支付开关、触发真实支付或邮件；未构建桌面 APP。
- 发布前复跑43项单元/新增浏览器回归，全通过。
- 正式域名75个公开文件全部200，SHA-256与本次快照完全一致。robots.txt因Cloudflare托管内容不列入字节相等检查。
- health/site：200；API、数据库健康返回operational。
- 未登录profile/devices/admin session：401。
- 内部docs/tests/.git路径：404。
- CSP、nosniff、DENY响应头生效。
- 部署前已核对远程生产分支、构建配置及环境变量名称；未修改远程secret。
- 证据：artifacts/web-deploy-20260918/ 下的 manifest.json、deploy.log、deployments-before/after.json、production-verification.json。

注意：线上已更新不等于Git远程已同步；之后从Git自动部署前应先审查并同步未提交的源码，以免覆盖本次直接上传版本。
