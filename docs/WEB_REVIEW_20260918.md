# 网页端代码 Review 与修复执行记录 — 2026-09-18

## 范围与边界

- 网页源码：`D:\DWGC2E_Website`，25 个 HTML 页面、25 个 JavaScript 文件（含 vendor）、共享 CSS、Pages API 代理、CSP 与白名单构建工具。
- 检查重点：登录/会话隔离、资料与设备、套餐与订单、词库冲突恢复、历史记录、运营后台、动态下载配置、首页交互、响应式与构建边界。
- 网站和 Worker 在本轮开始前已有大量未提交改动；保留原状态，未重置、提交或覆盖他人工作。本报告只归属下面列出的增量修复，不把整个 Git diff 当成本轮产出。
- Worker 只用于阅读契约和隔离 SQLite 集成验证，本轮没有修改或部署 Worker。没有修改生产数据库、触发真实邮件、创建真实订单、开启购买或发布下载。
- 本轮没有构建 APP，没有改动 `D:\DWGC2E\release`。网页修复仅在本地源码生效，不能等同线上已修复。

## 修复计划与执行结果

| 优先级 | 问题及触发条件 | 已实施修复 | 验证 |
| --- | --- | --- | --- |
| P1 | API 的 2xx JSON `null`、布尔值、数字或字符串被当成有效操作结果，写操作调用方可能报告成功 | 公共适配器在解包后拒绝无效结果，返回 `invalid_response`，不重试写入 | 单元测试覆盖原始值及 `{data:null}` |
| P2 | 非 2xx 响应体是 `null` 时访问 `.message` 抛 TypeError，真实 HTTP 状态丢失并被误报为网络错误 | 错误体先归一化，保留响应 status | 503/null 单元回归 |
| P1 | 后台清空下载链接后首页仍可访问旧地址，包括从页面缓存恢复时 | 成功读取的动态配置具有权威性；空或不安全地址移除 href、target、rel 并禁用入口；读取失败不破坏现有内容 | 真实页面脚本 + CSP + 合成 persisted pageshow 回归；不是实际 BFCache 生命周期测试 |
| P2 | 静态下载地址为空、动态地址随后可用时，旧禁用点击处理仍拦截下载；旧锚点处理还会将 HTTPS URL 当 CSS selector | 点击时检查最新禁用状态；平滑滚动仅接受当前仍以 `#` 开头的链接 | 启用后点击不被拦截且无 pageerror |
| P2 | 历史接口返回异常结构被当成空列表，刷新覆盖已加载记录 | 校验列表、行对象和分页游标后再更新 UI；失败保留旧记录并显示错误 | 缺字段、null 行、数组行、错误游标四类回归 |
| P2 | 词库输入未保存时点击刷新会无提示 reset 表单 | 有表单内容时刷新前确认；取消不请求、不清空输入 | 取消刷新回归 |
| P2 | 词库导入只检查导入文件自身数量，合并后超过 1000 条仍发送请求并锁入待恢复状态 | 所有词库提交入口在建立 pending 事务前检查合并总量，超限保留现有状态和输入 | 1000 条现有词条 + 1 条导入，断言 0 PUT、表单仍可用 |
| P2 | 首页 `<dialog>` 使用 `</div>` 错误闭合，提示消息和后续脚本被解析进关闭的灯箱 | 改为 `</dialog>` | DOM 层级、首页/灯箱交互回归 |
| P3 | 后台测试依赖未设置的截图环境变量，另一个测试写死到此前 APP 任务目录 | 管理员测试提供本地默认输出；账户集成截图仅在设置 `AUDIT_OUTPUT` 时输出 | 后台用户测试与实际 Worker/SQLite 账户测试 |

执行顺序：现有单元基线 → 新增失败用例 → 公共适配器/下载 → 历史/词库/HTML → 浏览器回归 → 白名单构建与记录。本轮新增用例最初复现了 7 个失败测试，修复后全部通过。

## 本轮文件归属

生产源码（6 个）：
- `index.html`
- `js/api-client.js`
- `js/main.js`
- `js/site-runtime.js`
- `js/history.js`
- `js/terminology.js`

测试（4 个）：
- `tests/api-client.test.mjs`
- `tests/review-regressions.cjs`（新增，真实页面脚本、实际 CSP、所有请求隔离）
- `tests/admin-accounts.cjs`
- `tests/admin-users.cjs`

文档：本文件。日志、构建验证副本与截图统一在 `artifacts/web-review-20260918/`。

## 验证结果

- 开始时已有 Node 单元测试：35/35。
- 修复后单元 + 新增浏览器回归：43/43，见 `focused-final.log`。
- 首页、支付交互、二维码恢复、图纸示例交互：4/4 测试文件通过；包含 390/1440 两种宽度，示例交互额外覆盖 768。见 `checkout-homepage.log`。支付均为 mock，不代表真实收款验收。
- 全站响应式：25 页面 × 5 宽度（360/390/768/1024/1440）=125/125；未发现横向溢出、可见 H1 数量错误或脚本未处理异常，见 `responsive.log`、`responsive/responsive.json`。这是结构冒烟，不代表每个后台登录后的状态均经过这125项检查。
- 静态验证：25 个 JS 语法检查；两个可执行内联脚本均符合实际 CSP hash；真实 `tools/stage-site.cjs` 在本轮隔离副本内输出 25 页面，tests/tools/.git/artifacts 未进入 public。见 `static-build.json`。不覆盖原 public，也未部署此副本。
- 浏览器隔离回归：56/56；另有真实 Worker + SQLite 集成 4/4 通过，合计60项均有通过记录。见 `browser-isolated-final.log` 与 `browser-final.log`。
- 本轮涉及的已跟踪源码/测试 `git diff --check` 通过；全仓检查发现其他既有文件的 EOF 空行，不为本轮清理无关改动。

### 浏览器环境说明

原有浏览器测试使用 Windows loopback。整套运行曾出现 `net::ERR_ADDRESS_IN_USE` 和零散加载超时；不能把这些运行写成全绿。`browser-final.log` 记录 59/60，其中唯一失败是在进入页面前的本机端口错误。

因此，将不依赖本地 Worker HTTP 服务的测试使用仓库既有 `tests/offline-browser.cjs` 适配器重新验证：页面仍执行未改写的本地源码，只将静态资源通过浏览器路由提供，避免 loopback 耗尽。真实 Worker/SQLite 的 4 项集成保留正常 HTTP 运行，已在 `browser-final.log` 通过，不使用该适配器代替后端。

首次执行现有账户集成脚本时，其旧硬编码路径输出了两张截图到此前任务目录；未将该目录作为垃圾删除或搬移。修正后输出仅使用本轮指定目录。

## 后续计划（不阻塞本轮修复，不扩大生产变更）

1. **P2：完善按接口的响应契约测试。** 本轮公共适配器拒绝基本类型异常，但没有给每个后台业务对象引入完整 schema。后续按 profile、catalog、orders、admin 的读取/写入分别加契约验证，避免一次大改影响支付恢复。
2. **P3：拆分大型后台脚本。** `js/admin-users.js` 同时负责用户、套餐和运营模块；建议以共享会话/请求层为基础，分模块迁移，每迁移一块先跑本地 SQLite 测试。此次不为代码风格重写安全敏感模块。
3. **P3：统一测试入口与依赖。** 当前多套脚本靠 `PLAYWRIGHT_MODULE`、外部浏览器和旁边的 Worker 目录运行；应后续收敛为明确命令和 CI 环境。本轮先修会写到旧任务目录的输出逻辑。
4. **发布前独立门禁。** 先核对这次与原有未提交改动的发布范围，再做 Pages 预览/线上只读验证。不要将本地全面回归、mock 支付或静态 staging 表述为生产付款、邮件、下载内容已验收。

## 本轮常用命令

在网页仓库执行，并将 `PLAYWRIGHT_MODULE` 设置为可用的本地 Playwright 模块路径；将 `AUDIT_OUTPUT` 指向本任务目录内：

```powershell
node --test tests/*.test.mjs tests/review-regressions.cjs
node --require ./tests/offline-browser.cjs --test --test-concurrency=1 tests/secondary-pages.cjs tests/browser-ui-regressions.cjs tests/admin-users.cjs tests/auth-overlays.cjs tests/service-status.cjs
node --test --test-concurrency=1 tests/admin-accounts.cjs tests/operations-admin.cjs
node --test --test-concurrency=1 tests/browser-interactions.cjs tests/billing-interactions.cjs tests/billing-qr-recovery.cjs tests/drawing-board.cjs
node tests/browser-smoke.cjs
```

