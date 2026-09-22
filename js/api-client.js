/* DWGC2E Web API adapter. Keeps transport, auth and response envelopes consistent. */
(() => {
  'use strict';
  const site = window.DWGC2E_SITE || {};
  const base = String(site.apiBaseUrl || '').replace(/\/$/, '');
  const sessionKey = 'dwgc2e.session';
  const readToken = () => { try { const s=JSON.parse(sessionStorage.getItem(sessionKey) || 'null'); return typeof s?.token==='string' && (!s.expiresAt || Date.parse(s.expiresAt)>Date.now()) ? s.token : ''; } catch { return ''; } };
  const unwrap = value => {
    if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'data') && Object.keys(value).length === 1) return value.data;
    return value;
  };
  const request = async (path, options = {}) => {
    if (!base) throw Object.assign(new Error('尚未配置 API 地址。'), { code: 'API_NOT_CONFIGURED' });
    if (!options.anonymous && !readToken()) { const error=Object.assign(new Error('请先登录后继续。'),{code:'unauthenticated',authExpired:true}); window.DWGC2E_AUTH?.failure(error); throw error; }
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
      const data = await response.json().catch(() => { if(response.ok)throw Object.assign(new Error('服务返回格式不完整，请重新读取确认操作结果。'),{code:'invalid_response'});return {}; });
      if (!options.anonymous && sessionAtStart !== readToken()) throw Object.assign(new Error('账号会话已切换，请重新加载。'), { code:'session_changed' });
      if (!response.ok) {
        const details = data && typeof data === 'object' ? data : {};
        const code = details.error_code || details.error || '';
        const serverText = typeof details.message === 'string' ? details.message : '';
        // Every 4xx from this API carries the Chinese text it wrote for the person using the page
        // (validation, quota, session state), and most of them have no error_code. Gating on
        // error_code hid all of that behind "请求失败（400）" and left operators unable to act.
        // 5xx stays local, and text that looks like internals is never shown.
        const looksInternal = /SQL|sqlite|D1_ERROR|Error:|Exception|at \w+\(|undefined|\[object|https?:\/\//.test(serverText);
        const message = response.status < 500 && serverText && !looksInternal && serverText.length <= 300 ? serverText
          : response.status >= 500 ? '服务暂时不可用，请稍后重试。'
          : `请求失败（${response.status}）`;
        const error = Object.assign(new Error(message), { status: response.status, code, rawMessage: serverText });
        if (response.status === 409 && error.code === 'payment_order_pending' && path === '/v1/billing/checkout' && data.order && /^DW[a-f0-9]{32}$/.test(data.order.orderNo)) error.order = data.order;
        if (response.status === 401 && usesStoredSession && ['unauthenticated','session_expired','token_expired'].includes(error.code) && sessionAtStart === readToken()) { try { sessionStorage.removeItem(sessionKey); } catch {} error.authExpired = true; }
        throw error;
      }
      const result = unwrap(data);
      if (!result || typeof result !== 'object') throw Object.assign(new Error('服务返回格式不完整，请重新读取确认操作结果。'), { code: 'invalid_response' });
      return result;
    } catch (error) {
      window.DWGC2E_AUTH?.failure(error);
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
    billing: { entitlements: () => request('/v1/billing/entitlements'), confirm: no => request('/v1/billing/orders/' + encodeURIComponent(no) + '/confirm', { method:'POST' }), hide: no => request('/v1/billing/orders/' + encodeURIComponent(no) + '/hide', { method: 'POST' }), plans: () => request('/v1/billing/plans'), publicPlans: () => request('/v1/billing/plans', { anonymous: true }), checkout: (body, key) => { if(typeof key !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(key)) return Promise.reject(Object.assign(new Error('下单标识无效，请刷新页面后重试。'), { code: 'invalid_idempotency_key' })); return request('/v1/billing/checkout', { method: 'POST', timeout: 20000, headers: { 'Idempotency-Key': key }, body: JSON.stringify(body) }); }, orders: before => request('/v1/billing/orders' + (before ? '?before=' + encodeURIComponent(before) : '')), status: no => request('/v1/billing/orders/' + encodeURIComponent(no)) },
    deviceManagement: { list: () => request('/v1/devices'), revoke: id => request('/v1/devices/revoke', { method: 'POST', body: JSON.stringify({ device_id: id }) }) },
    profileManagement: { update: body => request('/v1/profile', { method: 'PATCH', body: JSON.stringify(body) }), changePassword: body => request('/v1/auth/password', { method: 'PATCH', body: JSON.stringify(body) }) },
    feedback: { submit: body => request('/v1/feedback', { method: 'POST', anonymous:true, body: JSON.stringify(body) }) },
    glossary: { latest: () => request('/v1/glossary'), save: (entries, revision) => request('/v1/glossary', {method:'PUT',body:JSON.stringify({entries,expected_revision:revision})}) },
    terminology: { list: () => request('/v1/terminology'), create: body => request('/v1/terminology', { method: 'POST', body: JSON.stringify(body) }), remove: id => request(`/v1/terminology/${encodeURIComponent(id)}`, { method: 'DELETE' }) },
    history: { list: before => request('/v1/translation/history' + (before ? '?before='+encodeURIComponent(before) : '')), detail: id => request(`/v1/translation/tasks/${encodeURIComponent(id)}`) },
    translation: { create: body => request('/v1/translate', { method: 'POST', body }) }
  });
})();
