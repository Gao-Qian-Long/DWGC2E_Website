(() => {
  'use strict';

  const site = window.DWGC2E_SITE || {};
  const api = String(site.apiBaseUrl || '').replace(/\/$/, '');
  const storageKey = 'dwgc2e.session';
  const returnTarget = (() => { try { const value = new URLSearchParams(location.search).get('return'); return value && /^[a-z0-9._-]+\.html$/i.test(value) ? value : ''; } catch { return ''; } })();
  const $ = selector => document.querySelector(selector);
  const form = $('#accountForm');
  const root = document.documentElement;
  const body = document.body;
  const authPanel = $('#authPanel');
  const accountPanel = $('#accountPanel');
  const loading = $('#accountLoading');

  if (!form || !api || !authPanel || !accountPanel) return;

  let mode = 'login';
  let sessionGeneration = 0;
  let authSubmitting = false;
  const codeTimers = new Map();

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
    document.querySelectorAll('.password-shared').forEach(el => { el.hidden = mode === 'forgot'; });
    form.elements.password.autocomplete = mode === 'register' ? 'new-password' : 'current-password';
    document.querySelectorAll('.register-only').forEach(el => { el.hidden = mode !== 'register'; });
    document.querySelectorAll('.forgot-only').forEach(el => { el.hidden = mode !== 'forgot'; });
    const submit = $('#authSubmit');
    if (submit) submit.textContent = mode === 'login' ? '登录' : mode === 'register' ? '创建账号' : '重置密码';
    setMessage('');
  };

  const request = (path, options = {}) => window.DWGC2E_API.request(path, {
    ...options, anonymous:path.startsWith('/v1/auth/') && path !== '/v1/auth/logout'
  });
  const checkApiStatus = async () => {
    const status = $('#apiStatus');
    if (!status) return;
    try {
      const version = await request('/v1/version');
      status.className = 'api-status online';
      status.textContent = `服务连接正常${version.latest_version ? ' · v' + version.latest_version : ''}`;
    } catch {
      status.className = 'api-status offline';
      status.textContent = '服务暂时不可用，可稍后重试';
    }
  };
  const loadDashboard = async token => {
    const generation = sessionGeneration;
    const headers = { Authorization: `Bearer ${token}` };
    const [profile, subscription, usage, devices] = await Promise.all([
      request('/v1/profile', { headers }),
      request('/v1/subscription', { headers }),
      request('/v1/usage', { headers }),
      request('/v1/devices', { headers }).catch(() => null)
    ]);
    if (generation !== sessionGeneration) return;

    const displayName = profile.display_name || profile.account || profile.email || 'DWGC2E 用户';
    $("#profileName").textContent = displayName;
    $("#profileShortName") && ($("#profileShortName").textContent = displayName.split(/\s+/)[0]);
    const avatar = $("#profileAvatar"); if (avatar) avatar.textContent = displayName.trim().slice(0, 1).toUpperCase();
    try { const current = JSON.parse(sessionStorage.getItem(storageKey) || '{}'); current.profileName = displayName; sessionStorage.setItem(storageKey, JSON.stringify(current)); } catch {}
    $('#profileEmail').textContent = profile.account && profile.email && profile.account !== profile.email
      ? `账号：${profile.account} · ${profile.email}` : (profile.account || profile.email || '');
    $('#planName').textContent = subscription.plan_name || '未提供';
    const used = Number(usage.used), quota = Number(usage.monthly_quota);
    const validUsage = Number.isFinite(used) && used >= 0 && Number.isFinite(quota) && quota >= 0;
    const percent = validUsage && quota > 0 ? used / quota * 100 : 0;
    $('#usageUsed').textContent = validUsage ? used.toLocaleString() : '—';
    $('#usageQuota').textContent = validUsage ? quota.toLocaleString() : '—';
    const deviceItems = Array.isArray(devices) ? devices : (devices?.devices || devices?.items);
    const count = devices?.used_devices ?? (Array.isArray(deviceItems) ? deviceItems.length : null);
    const max = devices?.max_devices ?? subscription.max_devices;
    $('#deviceCount').textContent = count == null ? '暂不可用' : String(count) + (max != null ? ' / ' + max : '');
    $('#usagePercent').textContent = validUsage && quota > 0 ? percent.toLocaleString(undefined, { maximumFractionDigits: 1 }) + '%' : '—';
    $('#usageBar').style.width = Math.min(100, percent) + '%';
    $('#usageMeter').setAttribute('aria-valuenow', String(Math.min(100, percent)));
    $('#quotaNote').textContent = validUsage ? (quota > 0 ? '本月剩余 ' + Math.max(0, quota - used).toLocaleString() + ' 字符，可在客户端使用。' : '当前暂无可用额度，请查看套餐权益。') : '额度暂不可用，请刷新重试。';
    $('#dashboardMessage').textContent = '已同步 · ' + new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    $('#dashboardMessage').className = 'form-message';
    showDashboard();
  };

  const sendVerificationCode = async (purpose, email, button) => {
    if (!/^\S+@\S+\.\S+$/.test(email)) { setMessage('请先填写有效邮箱。', true); return; }
    if (codeTimers.has(button)) return;
    button.disabled = true;
    try {
      await request(purpose === 'register' ? '/v1/auth/register/request-code' : '/v1/auth/password/request-code', {
        method: 'POST', body: JSON.stringify({ email })
      });
      setMessage('验证码已发送，请检查邮箱（10 分钟内有效）。');
      let seconds = 60;
      button.textContent = `${seconds}s 后重试`;
      const timer = setInterval(() => {
        seconds -= 1;
        button.textContent = seconds ? `${seconds}s 后重试` : '发送验证码';
        if (!seconds) { clearInterval(timer); codeTimers.delete(button); button.disabled = false; }
      }, 1000);
      codeTimers.set(button, timer);
    } catch (error) { setMessage(error.message || '验证码发送失败。', true); button.disabled = false; }
  };

  $('#sendCode')?.addEventListener('click', () => sendVerificationCode('password_reset', form.elements.reset_email.value.trim(), $('#sendCode')));
  $('#sendRegisterCode')?.addEventListener('click', () => sendVerificationCode('register', form.elements.email.value.trim(), $('#sendRegisterCode')));
  document.querySelectorAll('[data-auth-mode]').forEach(button => button.addEventListener('click', () => { if (!authSubmitting) setMode(button.dataset.authMode); }));

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (authSubmitting) return;
    const data = Object.fromEntries(new FormData(form));
    if (mode === 'forgot') {
      if (!data.reset_email || !data.code || !data.new_password || data.new_password.length < 8) return setMessage('请填写邮箱、验证码和至少 8 位新密码。', true);
    } else if (!data.password || data.password.length < 8) return setMessage('密码至少需要 8 位。', true);
    const button = $('#authSubmit');
    authSubmitting = true;
    button.disabled = true;
    setMessage(mode === 'login' ? '正在登录…' : mode === 'register' ? '正在创建账号…' : '正在重置密码…');
    try {
      if (mode === 'forgot') {
        await request('/v1/auth/password/reset', { method: 'POST', body: JSON.stringify({ email: data.reset_email, code: data.code, new_password: data.new_password }) });
        setMode('login'); setMessage('密码已重置，请使用新密码登录。'); return;
      }
      if (mode === 'register') {
        if (!data.email || !data.register_code) return setMessage('请填写邮箱和邮箱验证码。', true);
        await request('/v1/auth/register', { method: 'POST', body: JSON.stringify({ account: data.email.trim(), email: data.email.trim(), password: data.password, display_name: data.display_name.trim() || data.email.trim(), verification_code: data.register_code }) });
      }
      const result = await request('/v1/auth/web/login', { method: 'POST', body: JSON.stringify({ account: mode === 'register' ? data.email.trim() : data.account.trim(), password: data.password }) });
      if (!result.token) throw new Error('登录响应缺少会话信息，请重试。');
      sessionGeneration++;
      try { localStorage.removeItem('dwgc2e.device-id'); } catch {}
      sessionStorage.setItem(storageKey, JSON.stringify({ token: result.token, expiresAt: result.expires_at, userId: result.user_id }));
      await loadDashboard(result.token);
      void checkApiStatus();
      if (returnTarget && returnTarget !== 'account.html') window.location.replace(returnTarget);
    } catch (error) { setMessage(error.name === 'AbortError' ? '服务器响应超时，请检查 API 部署状态后重试。' : (error.message || '请求失败，请稍后重试。'), true); }
    finally { button.disabled = false; authSubmitting = false; }
  });

  $('#logoutButton')?.addEventListener('click', async () => {
    const button = $('#logoutButton'); button.disabled = true;
    sessionGeneration++;
    try {
      await window.DWGC2E_API.auth.logout();
      sessionStorage.removeItem(storageKey); showAuth('已退出登录，APP 设备绑定不受影响。');
    } catch (error) {
      if (error.authExpired) { sessionStorage.removeItem(storageKey); showAuth('登录已失效。'); }
      else { $('#dashboardMessage').textContent = '服务端退出尚未确认，请检查网络后重试。'; }
    } finally { button.disabled = false; }
  });

  $('#refreshButton')?.addEventListener('click', async () => {
    let saved;
    try { saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null'); } catch { saved = null; }
    if (!saved?.token) return showAuth('登录状态已失效，请重新登录。');
    const button = $('#refreshButton');
    button.disabled = true;
    button.textContent = '同步中…';
    try { await loadDashboard(saved.token); }
    catch (error) { handleDashboardError(error); }
    finally { button.disabled = false; button.textContent = '↻ 刷新数据'; void checkApiStatus(); }
  });
  function handleDashboardError(error) {
    if (error.authExpired) { sessionStorage.removeItem(storageKey); showAuth('登录状态已失效，请重新登录。'); return; }
    showDashboard();
    $('#dashboardMessage').textContent = '同步失败，登录会话已保留。请点击刷新数据重试。';
    $('#dashboardMessage').className = 'form-message error';
  }
  // 首屏只依据本地会话决定显示：有效会话显示加载层，绝不先显示登录表单。
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
    const valid = !!(saved?.token && (!saved.expiresAt || new Date(saved.expiresAt) > new Date()));
    if (valid) {
      root.classList.add('has-session');
      body.classList.add('has-session', 'auth-loading');
      loadDashboard(saved.token).catch(handleDashboardError);
      void checkApiStatus();
    } else {
      sessionStorage.removeItem(storageKey);
      showAuth();
    }
  } catch {
    sessionStorage.removeItem(storageKey);
    showAuth();
  }
})();

