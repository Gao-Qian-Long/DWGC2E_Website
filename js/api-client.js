/* DWGC2E Web API adapter. Keeps transport, auth and response envelopes consistent. */
(() => {
  'use strict';
  const site = window.DWGC2E_SITE || {};
  const base = String(site.apiBaseUrl || '').replace(/\/$/, '');
  const sessionKey = 'dwgc2e.session';
  const readToken = () => { try { return JSON.parse(sessionStorage.getItem(sessionKey) || 'null')?.token || ''; } catch { return ''; } };
  const unwrap = value => {
    if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'data') && Object.keys(value).length === 1) return value.data;
    return value;
  };
  const request = async (path, options = {}) => {
    if (!base) throw Object.assign(new Error('尚未配置 API 地址。'), { code: 'API_NOT_CONFIGURED' });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeout || 12000);
    try {
      const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
      const headers = { ...(options.body && !isFormData ? { 'content-type': 'application/json' } : {}), ...(options.headers || {}) };
      const token = readToken();
      if (token && !headers.Authorization) headers.Authorization = `Bearer ${token}`;
      const response = await fetch(`${base}${path}`, { ...options, headers, signal: controller.signal, cache: options.cache || 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = Object.assign(new Error(data.message || data.error || data.error_code || `请求失败（${response.status}）`), { status: response.status, code: data.error_code || data.error });
        if (response.status === 401) { try { sessionStorage.removeItem(sessionKey); } catch {} error.authExpired = true; }
        throw error;
      }
      return unwrap(data);
    } finally { clearTimeout(timer); }
  };
  window.DWGC2E_API = Object.freeze({
    request,
    auth: {
      login: body => request('/v1/auth/login', { method: 'POST', body: JSON.stringify(body) }),
      register: body => request('/v1/auth/register', { method: 'POST', body: JSON.stringify(body) }),
      requestRegisterCode: body => request('/v1/auth/register/request-code', { method: 'POST', body: JSON.stringify(body) }),
      requestPasswordCode: body => request('/v1/auth/password/request-code', { method: 'POST', body: JSON.stringify(body) }),
      resetPassword: body => request('/v1/auth/password/reset', { method: 'POST', body: JSON.stringify(body) })
    },
    account: {
      profile: () => request('/v1/profile'), subscription: () => request('/v1/subscription'), usage: () => request('/v1/usage'), devices: () => request('/v1/devices')
    },
    billing: { plans: () => request('/v1/billing/plans'), checkout: body => request('/v1/billing/checkout', { method: 'POST', body: JSON.stringify(body) }), orders: () => request('/v1/billing/orders') },
    deviceManagement: { list: () => request('/v1/devices'), revoke: id => request('/v1/devices/revoke', { method: 'POST', body: JSON.stringify({ device_id: id }) }) },
    profileManagement: { update: body => request('/v1/profile', { method: 'PATCH', body: JSON.stringify(body) }), changePassword: body => request('/v1/auth/password', { method: 'PATCH', body: JSON.stringify(body) }) },
    feedback: { submit: body => request('/v1/feedback', { method: 'POST', body: JSON.stringify(body) }) },
    terminology: { list: () => request('/v1/terminology'), create: body => request('/v1/terminology', { method: 'POST', body: JSON.stringify(body) }), remove: id => request(`/v1/terminology/${encodeURIComponent(id)}`, { method: 'DELETE' }) },
    history: { list: () => request('/v1/translation/history'), detail: id => request(`/v1/translation/tasks/${encodeURIComponent(id)}`) },
    translation: { create: body => request('/v1/translate', { method: 'POST', body }) }
  });
})();


