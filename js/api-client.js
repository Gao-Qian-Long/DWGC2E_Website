/* DWGC2E Web API adapter: one place for future account and billing integrations. */
(() => {
  const site = window.DWGC2E_SITE || {};
  const base = String(site.apiBaseUrl || '').replace(/\/$/, '');
  const sessionKey = 'dwgc2e.session';
  const readToken = () => { try { return JSON.parse(sessionStorage.getItem(sessionKey) || 'null')?.token || ''; } catch { return ''; } };
  const request = async (path, options = {}) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeout || 12000);
    try {
      const headers = { ...(options.body ? { 'content-type': 'application/json' } : {}), ...(options.headers || {}) };
      const token = readToken();
      if (token && !headers.Authorization) headers.Authorization = `Bearer ${token}`;
      const response = await fetch(`${base}${path}`, { ...options, headers, signal: controller.signal });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw Object.assign(new Error(data.message || data.error || `请求失败（${response.status}）`), { status: response.status, code: data.error_code });
      return data;
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
      profile: () => request('/v1/profile'),
      subscription: () => request('/v1/subscription'),
      usage: () => request('/v1/usage'),
      devices: () => request('/v1/devices/bind', { method: 'POST', body: '{}' })
    },
    // 后端接口开放后，只需在此处补齐实现，页面无需重新设计：
    billing: { plans: () => request('/v1/billing/plans'), checkout: body => request('/v1/billing/checkout', { method: 'POST', body: JSON.stringify(body) }) },
    deviceManagement: { list: () => request('/v1/devices'), revoke: id => request(`/v1/devices/${encodeURIComponent(id)}`, { method: 'DELETE' }) },
    profileManagement: { update: body => request('/v1/profile', { method: 'PATCH', body: JSON.stringify(body) }) }
  });
})();
