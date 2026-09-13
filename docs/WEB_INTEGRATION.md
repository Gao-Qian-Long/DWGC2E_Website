# DWGC2E 网页端对接清单

网页端是 Cloudflare Pages 静态站点，所有需要鉴权的请求由 `js/api-client.js` 自动附加：

```text
Authorization: Bearer <token>
Content-Type: application/json
```

## 已接入 Worker

```text
POST /v1/auth/register/request-code
POST /v1/auth/password/request-code
POST /v1/auth/password/reset
POST /v1/auth/register
POST /v1/auth/login
GET  /v1/profile
GET  /v1/subscription
GET  /v1/usage
POST /v1/devices/bind
GET  /v1/version
```

## 已预留页面和 API 方法

```text
DWGC2E_API.billing.plans()
DWGC2E_API.billing.checkout({ plan_id })
DWGC2E_API.deviceManagement.list()
DWGC2E_API.deviceManagement.revoke(deviceId)
DWGC2E_API.profileManagement.update({ display_name })
DWGC2E_API.profileManagement.changePassword({ current_password, new_password })
DWGC2E_API.feedback.submit({ email, category, message })
```

## 需要后端补齐的接口与字段

### 套餐和订单

```text
GET /v1/billing/plans
返回：{ "plans": [{ "id": "standard", "name": "标准版", "description": "...", "price": 39, "currency": "CNY", "billing_cycle": "month" }] }

POST /v1/billing/checkout
请求：{ "plan_id": "standard" }
返回：{ "checkout_url": "https://...", "order_id": "..." }

GET /v1/billing/orders
返回：{ "orders": [{ "id": "...", "plan_id": "standard", "plan_name": "标准版", "status": "paid", "created_at": "2026-09-13T00:00:00Z" }] }
```

### 设备

```text
GET /v1/devices
返回：{ "devices": [{ "device_id": "...", "device_name": "办公电脑", "platform": "Windows", "last_seen_at": "..." }] }

DELETE /v1/devices/:device_id
返回：{ "success": true }
```

### 资料和密码

```text
PATCH /v1/profile
请求：{ "display_name": "新的名称" }
返回：{ "display_name": "新的名称", "email": "user@example.com" }

PATCH /v1/auth/password
请求：{ "current_password": "...", "new_password": "..." }
返回：{ "success": true }
```

### 反馈

```text
POST /v1/feedback
请求：{ "email": "user@example.com", "category": "installation|translation|compatibility|other", "message": "..." }
返回：{ "success": true, "ticket_id": "..." }
```

## 统一错误格式

建议所有接口使用 HTTP 状态码，并返回：

```json
{ "success": false, "error_code": "profile_not_configured", "message": "资料接口尚未配置" }
```

特别注意：接口未实现时请返回 `404` 或 `501`，不要返回 HTTP 200 的假成功；前端会把这类状态显示为“接口暂未开放”。密码、验证码和支付接口必须在 Worker 侧做频率限制、输入校验和审计日志。

### 翻译任务上传

前端会以 `multipart/form-data` 调用现有接口：

```text
POST /v1/translate
files: 一个或多个 DWG/DXF 文件
source_language: auto|en|ja|ko
 target_language: zh-CN|zh-TW|en
glossary_id: 可选
```

成功建议返回：

```json
{ "task_id": "task_001", "status": "queued" }
```

Worker 需要限制文件数量、单文件大小、扩展名和总请求大小，并使用任务 ID 异步处理，不能在请求中直接假设文件已翻译完成。
