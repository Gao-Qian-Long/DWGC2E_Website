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
    const sessionAtStart = readToken();
    const cancel = () => controller.abort();
    if (options.signal?.aborted) cancel();
    else options.signal?.addEventListener('abort', cancel, { once:true });
    const timer = setTimeout(() => controller.abort(), options.timeout || 12000);
    try {
      const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
      const headers = { ...(options.body && !isFormData ? { 'content-type': 'application/json' } : {}), ...(options.headers || {}) };
      const token = options.anonymous ? '' : sessionAtStart;
      const authKey = Object.keys(headers).find(key => key.toLowerCase() === 'authorization');
      if (token && !authKey) headers.Authorization = `Bearer ${token}`;
      const usesStoredSession = !!token && (authKey ? headers[authKey] : headers.Authorization) === `Bearer ${token}`;
      const response = await fetch(`${base}${path}`, { ...options, headers, signal: controller.signal, cache: options.cache || 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!options.anonymous && sessionAtStart !== readToken()) throw Object.assign(new Error('账号会话已切换，请重新加载。'), { code:'session_changed' });
      if (!response.ok) {
        const error = Object.assign(new Error(data.message || data.error || data.error_code || `请求失败（${response.status}）`), { status: response.status, code: data.error_code || data.error });
        if (response.status === 401 && usesStoredSession && ['unauthenticated','session_expired','token_expired'].includes(error.code) && sessionAtStart === readToken()) { try { sessionStorage.removeItem(sessionKey); } catch {} error.authExpired = true; }
        throw error;
      }
      return unwrap(data);
    } catch (error) {
      if (error.name === 'AbortError' && options.signal?.aborted) throw Object.assign(new Error('请求已取消。'), { code:'request_cancelled', name:'AbortError' });
      if (error.name === 'AbortError') throw Object.assign(new Error('连接账户服务超时，请稍后重试；下单请求请勿重复提交。'), { code: 'request_timeout' });
      if (error instanceof TypeError && !error.status) throw Object.assign(new Error('无法连接账户服务，请检查网络后刷新页面。'), { code: 'network_error' });
      throw error;
    } finally { clearTimeout(timer); options.signal?.removeEventListener('abort', cancel); }
  };
  window.DWGC2E_API = Object.freeze({
    request,
    auth: {
      login: body => request('/v1/auth/web/login', { method: 'POST', anonymous:true, body: JSON.stringify(body) }),
      logout: () => request('/v1/auth/logout', { method: 'POST' }),
      register: body => request('/v1/auth/register', { method: 'POST', anonymous:true, body: JSON.stringify(body) }),
      requestRegisterCode: body => request('/v1/auth/register/request-code', { method: 'POST', anonymous:true, body: JSON.stringify(body) }),
      requestPasswordCode: body => request('/v1/auth/password/request-code', { method: 'POST', anonymous:true, body: JSON.stringify(body) }),
      resetPassword: body => request('/v1/auth/password/reset', { method: 'POST', anonymous:true, body: JSON.stringify(body) })
    },
    account: {
      profile: () => request('/v1/profile'), subscription: () => request('/v1/subscription'), usage: () => request('/v1/usage'), devices: () => request('/v1/devices')
    },
    billing: { hide: no => request('/v1/billing/orders/' + encodeURIComponent(no) + '/hide', { method: 'POST' }), plans: () => request('/v1/billing/plans'), checkout: (body, key) => { if(typeof key !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(key)) return Promise.reject(Object.assign(new Error('下单标识无效，请刷新页面后重试。'), { code: 'invalid_idempotency_key' })); return request('/v1/billing/checkout', { method: 'POST', timeout: 20000, headers: { 'Idempotency-Key': key }, body: JSON.stringify(body) }); }, orders: before => request('/v1/billing/orders' + (before ? '?before=' + encodeURIComponent(before) : '')), status: no => request('/v1/billing/orders/' + encodeURIComponent(no)) },
    deviceManagement: { list: () => request('/v1/devices'), revoke: id => request('/v1/devices/revoke', { method: 'POST', body: JSON.stringify({ device_id: id }) }) },
    profileManagement: { update: body => request('/v1/profile', { method: 'PATCH', body: JSON.stringify(body) }), changePassword: body => request('/v1/auth/password', { method: 'PATCH', body: JSON.stringify(body) }) },
    feedback: { submit: body => request('/v1/feedback', { method: 'POST', body: JSON.stringify(body) }) },
    terminology: { list: () => request('/v1/terminology'), create: body => request('/v1/terminology', { method: 'POST', body: JSON.stringify(body) }), remove: id => request(`/v1/terminology/${encodeURIComponent(id)}`, { method: 'DELETE' }) },
    history: { list: () => request('/v1/translation/history'), detail: id => request(`/v1/translation/tasks/${encodeURIComponent(id)}`) },
    translation: { create: body => request('/v1/translate', { method: 'POST', body }) }
  });
})();
