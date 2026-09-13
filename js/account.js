(() => {
  const site = window.DWGC2E_SITE || {};
  const api = String(site.apiBaseUrl || '').replace(/\/$/, '');
  const storageKey = 'dwgc2e.session';
  const $ = selector => document.querySelector(selector);
  const form = $('#accountForm');
  if (!form || !api) return;
  let mode = 'login';
  let codeTimer;
  const setMessage = (text, error = false) => { const el = $('#formMessage'); el.textContent = text || ''; el.className = `form-message${error ? ' error' : ''}`; };
  const setMode = next => {
    mode = next;
    document.querySelectorAll('[data-auth-mode]').forEach(button => button.classList.toggle('active', button.dataset.authMode === mode));
    document.querySelectorAll('.register-only').forEach(el => { el.hidden = mode !== 'register'; });
    document.querySelectorAll('.forgot-only').forEach(el => { el.hidden = mode !== 'forgot'; });
    $('#authSubmit').textContent = mode === 'login' ? '登录' : mode === 'register' ? '创建账号' : '重置密码';
    setMessage('');
  };
  const request = async (path, options = {}) => {
    const response = await fetch(`${api}${path}`, { ...options, headers: { 'content-type': 'application/json', ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || data.error_code || `请求失败（${response.status}）`);
    return data;
  };
  const loadDashboard = async token => {
    const headers = { Authorization: `Bearer ${token}` };
    const [profile, subscription, usage, devices] = await Promise.all([
      request('/v1/profile', { headers }), request('/v1/subscription', { headers }), request('/v1/usage', { headers }), request('/v1/devices/bind', { method: 'POST', headers, body: '{}' })
    ]);
    $('#profileName').textContent = profile.display_name || 'DWGC2E 用户'; $('#profileEmail').textContent = profile.email || '';
    $('#planName').textContent = subscription.plan_name || '免费版'; $('#usageUsed').textContent = Number(usage.used || 0).toLocaleString(); $('#usageQuota').textContent = Number(usage.monthly_quota || 0).toLocaleString(); $('#deviceCount').textContent = `${devices.used_devices || 0} / ${devices.max_devices || 3}`;
    $('#usageBar').style.width = `${usage.monthly_quota ? Math.min(100, usage.used / usage.monthly_quota * 100) : 0}%`;
    $('#authPanel').hidden = true; $('#accountPanel').hidden = false; $('#accountStatus').textContent = '账户信息已同步。';
  };
  document.querySelectorAll('[data-auth-mode]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.authMode)));
  $('#sendCode').addEventListener('click', async () => {
    const email = form.elements.email.value.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) return setMessage('请先填写有效邮箱。', true);
    const button = $('#sendCode'); button.disabled = true;
    try { await request('/v1/auth/password/request-code', { method: 'POST', body: JSON.stringify({ email }) }); setMessage('验证码已发送，请检查邮箱（10 分钟内有效）。'); let seconds = 60; button.textContent = `${seconds}s 后重试`; codeTimer = setInterval(() => { seconds -= 1; button.textContent = seconds ? `${seconds}s 后重试` : '发送验证码'; if (!seconds) { clearInterval(codeTimer); button.disabled = false; } }, 1000); } catch (error) { setMessage(error.message || '验证码发送失败。', true); button.disabled = false; }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault(); const data = Object.fromEntries(new FormData(form));
    if (mode === 'forgot') { if (!data.email || !data.code || data.new_password.length < 8) return setMessage('请填写邮箱、验证码和至少 8 位新密码。', true); }
    else if (data.password.length < 8) return setMessage('密码至少需要 8 位。', true);
    const button = $('#authSubmit'); button.disabled = true; setMessage(mode === 'login' ? '正在登录…' : mode === 'register' ? '正在创建账号…' : '正在重置密码…');
    try {
      if (mode === 'forgot') { await request('/v1/auth/password/reset', { method: 'POST', body: JSON.stringify({ email: data.email, code: data.code, new_password: data.new_password }) }); setMode('login'); return setMessage('密码已重置，请使用新密码登录。'); }
      if (mode === 'register') await request('/v1/auth/register', { method: 'POST', body: JSON.stringify(data) });
      const result = await request('/v1/auth/login', { method: 'POST', body: JSON.stringify({ account: data.account, password: data.password, device_id: `web-${crypto.randomUUID()}`, device_name: data.device_name || '网页端' }) });
      sessionStorage.setItem(storageKey, JSON.stringify({ token: result.token, expiresAt: result.expires_at })); await loadDashboard(result.token);
    } catch (error) { setMessage(error.message || '请求失败，请稍后重试。', true); } finally { button.disabled = false; }
  });
  $('#logoutButton').addEventListener('click', () => { sessionStorage.removeItem(storageKey); $('#accountPanel').hidden = true; $('#authPanel').hidden = false; $('#accountStatus').textContent = '已退出登录。'; setMode('login'); });
  setMode('login');
  try { const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null'); if (saved?.token && (!saved.expiresAt || new Date(saved.expiresAt) > new Date())) loadDashboard(saved.token).catch(() => sessionStorage.removeItem(storageKey)); else sessionStorage.removeItem(storageKey); } catch { sessionStorage.removeItem(storageKey); }
})();
