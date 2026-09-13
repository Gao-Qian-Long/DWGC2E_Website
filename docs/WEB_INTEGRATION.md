# 网页端对接清单

## 已接入 Worker

- `POST /v1/auth/register/request-code`
- `POST /v1/auth/password/request-code`
- `POST /v1/auth/password/reset`
- `POST /v1/auth/register`
- `POST /v1/auth/login`
- `GET /v1/profile`
- `GET /v1/subscription`
- `GET /v1/usage`
- `POST /v1/devices/bind`
- `GET /v1/version`

## 已预留页面和 API 方法

`js/api-client.js` 已统一预留以下方法，后端接口名称确定后只需调整路径或字段，不需要重做页面：

- `DWGC2E_API.billing.plans()`：套餐列表
- `DWGC2E_API.billing.checkout(plan)`：创建订单/支付
- `DWGC2E_API.deviceManagement.list()`：设备列表
- `DWGC2E_API.deviceManagement.revoke(deviceId)`：解绑设备
- `DWGC2E_API.profileManagement.update(data)`：修改显示名称、邮箱等资料

## 建议后端补齐的接口

```text
GET    /v1/billing/plans
POST   /v1/billing/checkout
GET    /v1/billing/orders
GET    /v1/devices
DELETE /v1/devices/:device_id
PATCH  /v1/profile
PATCH  /v1/auth/password
POST   /v1/feedback
```

所有接口建议统一返回：

```json
{ "success": true, "data": {} }
```

错误统一返回：

```json
{ "success": false, "error_code": "...", "message": "..." }
```
