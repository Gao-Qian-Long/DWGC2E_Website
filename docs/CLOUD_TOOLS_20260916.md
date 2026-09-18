# 云端术语与翻译历史交付 — 2026-09-16

## 当前线上版本与发布范围

- 生产站点：https://cad.pocketter.dpdns.org
- Pages：`42d55bdc-5997-493c-9632-8bbc97886ddb`
- Worker：`71defcea-ac8e-4bc2-8bc9-c76060b60c32`
- 已验证的原线上基础提交：`d818f4306321c66f892c2a26eade3f6723c7a83e`
- 独立候选：`D:\DWGC2E_Baselines\cloud-history-20260916-081820\site`，部署输出为其 public 目录。

**不是整个网站工作区已上线。** 当前工作区还有不属于本批的账号、界面等改动；独立候选仅覆盖 history.html、terminology.html、js/api-client.js、js/cloud-session.js、js/history.js、js/terminology.js。生产api-client保留原有传输层，仅增加glossary方法。cloud-session兼容旧线上外壳；工作区已有DWGC2E_AUTH时不接管。其余文件恢复为发布前线上原始字节，最终60个文件哈希与候选全部相同，只有上述6个文件相对上线前变化。

## 术语工作流与恢复

1. 登录后GET /v1/glossary读取entries、revision、max_entries，作为最新云端状态。
2. 增删改、批量删除或导入使用PUT /v1/glossary，提交entries和expected_revision；收到成功才认定云端保存完成。
3. 读取失败禁用修改；允许刷新重试。首次资料读取期间也禁用表单，避免意外原生提交。
4. 保存失败保留未保存草稿；冲突不自动取得新revision强行覆盖。网络中断可能已落库，重试仍使用原revision以防重复覆盖。
5. 可导出待保存内容；明确放弃后重新读取最新云端。不维护历史快照或另一个持久化本地词库。
6. 原浏览器旧词库只通过“合并本机词条到云端”显式迁移，成功后移除旧存储；不自动上传覆盖。
7. CSV支持引号、逗号、多行备注；严格校验字段，最大2MB、1000条。

## 历史契约与限制

服务端只读合并translation_requests与旧usage_logs，不改翻译/计费写入流程，不迁移数据库。每页50条，游标分页；详情按用户隔离。显示处理中、超时待结算、成功、部分完成或失败，并区分请求与计费字符数。不返回翻译正文或内部response_json。

请求表没有语言字段时显示“未记录”；由过期时间反推开始时间时显示“约”。在不改核心记录方式的前提下，新请求也有此元数据限制。这里是文本请求记录，不是DWG文件存档，不能提供DWG历史下载。

APP旧客户端不传revision的历史覆盖风险尚需客户端闭环。本批未改APP、未构建或替换release。

## 验证、阻断与回滚

- Worker202/202及类型检查通过；跨端24/24，G01/H01均为正向断言。
- 网页基础16/16；组合浏览器47/47（最终初次加载修补前）；最终独立候选与真实Worker处理器联测9/9。
- 所有带认证写入测试在隔离数据库中执行，不写生产账号，不发送邮件、不实付。
- 官网同源代理8通过/1警告/0失败；警告为既有公开下载地址为空。匿名术语GET/PUT均401。
- 本机直连workers.dev网络超时，直接探测9项失败；代理正常不等于APP直连已验收。不修改网络或安全配置掩盖此结果。
- Worker前版：`3a48c2e2-cacd-47bb-9b4f-ec9dcac71337`；Pages前版：`2015dd23-bc8b-49a2-9ada-c46e3f1d0446`。无数据库迁移；回滚需人工确认并核验配置。
- 测试入口和证据见 `D:\DWGC2E\tests\Integration\README.md` 与 `D:\DWGC2E\docs\CROSS_END_REVIEW_PLAN_20260916.md` 第8节。配置基线位于仓库外，可能含敏感值，禁止提交或公开。
