(() => {
  'use strict';

  const site = window.DWGC2E_SITE || {};
  const api = String(site.apiBaseUrl || '').replace(/\/$/, '');
  const storageKey = 'dwgc2e.session';
  const deviceKey = 'dwgc2e.device-id';
  const getDeviceId = () => {
    try {
      let id = localStorage.getItem(deviceKey);
      if (!id) { id = `web-${crypto.randomUUID()}`; localStorage.setItem(deviceKey, id); }
      return id;
    } catch { return 'web-browser'; }
  };
  const $ = selector => document.querySelector(selector);
  const form = $('#accountForm');
  const root = document.documentElement;
  const body = document.body;
  const authPanel = $('#authPanel');
  const accountPanel = $('#accountPanel');
  const loading = $('#accountLoading');

  if (!form || !api || !authPanel || !accountPanel) return;

  let mode = 'login';
  let codeTimer = null;

  const clearEntryState = () => {
    root.classList.remove('has-session');
    body.classList.remove('has-session', 'auth-loading');
    if (loading) loading.hidden = true;
  };

  const showAuth = message => {
    clearEntryState();
    accountPanel.hidden = true;
    authPanel.hidden = false;
    setMode('login');
    if (message) setMessage(message);
  };

  const showDashboard = () => {
    root.classList.remove('has-session');
    body.classList.remove('has-session', 'auth-loading');
    if (loading) loading.hidden = true;
    authPanel.hidden = true;
    accountPanel.hidden = false;
  };

  const setMessage = (text, error = false) => {
    const el = $('#formMessage');
    if (!el) return;
    el.textContent = text || '';
    el.className = `form-message${error ? ' error' : ''}`;
  };

  const setMode = next => {
    mode = next;
    document.querySelectorAll('[data-auth-mode]').forEach(button => {
      button.classList.toggle('active', button.dataset.authMode === mode);
      button.setAttribute('aria-selected', button.dataset.authMode === mode ? 'true' : 'false');
    });
    document.querySelectorAll('.login-only').forEach(el => { el.hidden = mode !== 'login'; });
    document.querySelectorAll('.register-only').forEach(el => { el.hidden = mode !== 'register'; });
    document.querySelectorAll('.forgot-only').forEach(el => { el.hidden = mode !== 'forgot'; });
    const submit = $('#authSubmit');
    if (submit) submit.textContent = mode === 'login' ? '登录' : mode === 'register' ? '创建账号' : '重置密码';
    setMessage('');
  };

  const request = async (path, options = {}) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    let response;
    try {
      response = await fetch(`${api}${path}`, {
        ...options,
        headers: { 'content-type': 'application/json', ...(options.headers || {}) },
        signal: controller.signal
      });
    } finally { clearTimeout(timeout); }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || data.error || data.error_code || `请求失败（${response.status}）`);
    return data;
  };
  const loadDashboard = async token => {
    const headers = { Authorization: `Bearer ${token}` };
    const [profile, subscription, usage] = await Promise.all([
      request('/v1/profile', { headers }),
      request('/v1/subscription', { headers }),
      request('/v1/usage', { headers })
    ]);
    // 设备绑定失败不应阻塞账户中心显示。
    const devices = await request('/v1/devices/bind', { method: 'POST', headers, body: '{}' }).catch(() => ({ used_devices: 0, max_devices: 3 }));
    $('#profileName').textContent = profile.display_name || profile.account || profile.email || 'DWGC2E 用户';
    $('#profileEmail').textContent = profile.account && profile.email && profile.account !== profile.email
      ? `账号：${profile.account} · ${profile.email}` : (profile.account || profile.email || '');
    $('#planName').textContent = subscription.plan_name || '免费版';
    $('#usageUsed').textContent = Number(usage.used || 0).toLocaleString();
    $('#usageQuota').textContent = Number(usage.monthly_quota || 0).toLocaleString();
    $('#deviceCount').textContent = `${devices.used_devices || 0} / ${devices.max_devices || 3}`;
    $('#usageBar').style.width = `${usage.monthly_quota ? Math.min(100, Number(usage.used || 0) / Number(usage.monthly_quota) * 100) : 0}%`;
    $('#accountStatus').textContent = '账户信息已同步。';
    showDashboard();
  };

  const sendVerificationCode = async (purpose, email, button) => {
    if (!/^\S+@\S+\.\S+$/.test(email)) { setMessage('请先填写有效邮箱。', true); return; }
    if (codeTimer) clearInterval(codeTimer);
    button.disabled = true;
    try {
      await request(purpose === 'register' ? '/v1/auth/register/request-code' : '/v1/auth/password/request-code', {
        method: 'POST', body: JSON.stringify({ email })
      });
      setMessage('验证码已发送，请检查邮箱（10 分钟内有效）。');
      let seconds = 60;
      button.textContent = `${seconds}s 后重试`;
      codeTimer = setInterval(() => {
        seconds -= 1;
        button.textContent = seconds ? `${seconds}s 后重试` : '发送验证码';
        if (!seconds) { clearInterval(codeTimer); codeTimer = null; button.disabled = false; }
      }, 1000);
    } catch (error) { setMessage(error.message || '验证码发送失败。', true); button.disabled = false; }
  };

  $('#sendCode')?.addEventListener('click', () => sendVerificationCode('password_reset', form.elements.reset_email.value.trim(), $('#sendCode')));
  $('#sendRegisterCode')?.addEventListener('click', () => sendVerificationCode('register', form.elements.email.value.trim(), $('#sendRegisterCode')));
  document.querySelectorAll('[data-auth-mode]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.authMode)));

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    if (mode === 'forgot') {
      if (!data.reset_email || !data.code || !data.new_password || data.new_password.length < 8) return setMessage('请填写邮箱、验证码和至少 8 位新密码。', true);
    } else if (!data.password || data.password.length < 8) return setMessage('密码至少需要 8 位。', true);
    const button = $('#authSubmit');
    button.disabled = true;
    setMessage(mode === 'login' ? '正在登录…' : mode === 'register' ? '正在创建账号…' : '正在重置密码…');
    try {
      if (mode === 'forgot') {
        await request('/v1/auth/password/reset', { method: 'POST', body: JSON.stringify({ email: data.reset_email, code: data.code, new_password: data.new_password }) });
        setMode('login'); setMessage('密码已重置，请使用新密码登录。'); return;
      }
      if (mode === 'register') {
        if (!data.email || !data.register_code) return setMessage('请填写邮箱和邮箱验证码。', true);
        await request('/v1/auth/register', { method: 'POST', body: JSON.stringify({ ...data, verification_code: data.register_code }) });
      }
      const result = await request('/v1/auth/login', { method: 'POST', body: JSON.stringify({ account: data.account || data.email, password: data.password, device_id: getDeviceId(), device_name: data.device_name || '网页端' }) });
      sessionStorage.setItem(storageKey, JSON.stringify({ token: result.token, expiresAt: result.expires_at }));
      await loadDashboard(result.token);
    } catch (error) { setMessage(error.name === 'AbortError' ? '服务器响应超时，请检查 API 部署状态后重试。' : (error.message || '请求失败，请稍后重试。'), true); }
    finally { button.disabled = false; }
  });

  $('#logoutButton')?.addEventListener('click', () => { sessionStorage.removeItem(storageKey); showAuth('已退出登录。'); });

  $('#refreshButton')?.addEventListener('click', async () => {
    let saved;
    try { saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null'); } catch { saved = null; }
    if (!saved?.token) return showAuth('登录状态已失效，请重新登录。');
    const button = $('#refreshButton');
    button.disabled = true;
    button.textContent = '同步中…';
    try { await loadDashboard(saved.token); }
    catch { sessionStorage.removeItem(storageKey); showAuth('登录状态已失效，请重新登录。'); }
    finally { button.disabled = false; button.textContent = '刷新数据'; }
  });
  // 首屏只依据本地会话决定显示：有效会话显示加载层，绝不先显示登录表单。
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
    const valid = !!(saved?.token && (!saved.expiresAt || new Date(saved.expiresAt) > new Date()));
    if (valid) {
      root.classList.add('has-session');
      body.classList.add('has-session', 'auth-loading');
      loadDashboard(saved.token).catch(() => { sessionStorage.removeItem(storageKey); showAuth('登录状态已失效，请重新登录。'); });
    } else {
      sessionStorage.removeItem(storageKey);
      showAuth();
    }
  } catch {
    sessionStorage.removeItem(storageKey);
    showAuth();
  }
})();








