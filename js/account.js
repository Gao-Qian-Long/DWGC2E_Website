(() => {
  'use strict';

  const site = window.QLCAD_SITE || {};
  const api = String(site.apiBaseUrl || '').replace(/\/$/, '');
  const storageKey = 'dwgc2e.session';
  const query = new URLSearchParams(location.search);
  const returnTarget = window.QLCAD_AUTH.safeReturn(query.get('return') || query.get('returnTo'));
  const requestedAuthMode = ['login','register','forgot'].includes(query.get('mode')) ? query.get('mode') : 'login';
  const $ = selector => document.querySelector(selector);
  const form = $('#accountForm');
  const root = document.documentElement;
  const body = document.body;
  const authPanel = $('#authPanel');
  const accountPanel = $('#accountPanel');
  const loading = $('#accountLoading');

  if (!form || !api || !authPanel || !accountPanel) return;

  let mode = 'login';
  let initialAuthMode = requestedAuthMode;
  let sessionGeneration = 0;
  let authSubmitting = false;
  const codeTimers = new Map();

  const clearEntryState = () => {
    root.classList.remove('has-session');
    body.classList.remove('has-session', 'auth-loading');
    if (loading) loading.hidden = true;
  };

  const showAuth = message => {
    sessionGeneration++;
    clearEntryState();
    accountPanel.hidden = true;
    authPanel.hidden = false;
    setMode(initialAuthMode);
    initialAuthMode = 'login';
    if (message) setMessage(message);
    if (returnTarget) { const name={billing:'套餐与订单',profile:'资料与安全',devices:'设备管理',history:'翻译记录',terminology:'术语库'}[returnTarget.split('.')[0]] || '原页面'; $('#accountStatus').textContent='登录后返回'+name+'。'; }
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
      button.tabIndex = button.dataset.authMode === mode ? 0 : -1;
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

  const request = (path, options = {}) => window.QLCAD_API.request(path, {
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
  const readSession = () => { try { return JSON.parse(sessionStorage.getItem(storageKey) || 'null'); } catch { return null; } };
  let dashboardToken = '', dashboardRequest = 0;
  let loaded = {};
  const sections = {
    profile: {anchor:'#profileEmail', label:'账户资料'},
    subscription: {anchor:'#planName', label:'会员信息'},
    usage: {anchor:'#quotaNote', label:'额度'},
    devices: {anchor:'#deviceCount', label:'设备'}
  };
  for (const [name, section] of Object.entries(sections)) {
    const status = document.createElement('small');
    status.id = name + 'SyncStatus';
    status.setAttribute('role', 'status');
    status.className = 'form-message';
    $(section.anchor).after(status);
    section.status = status;
  }
  const placeholder = (name, text) => {
    if (name === 'profile') { $('#profileName').textContent = text; $('#profileEmail').textContent = ''; $('#profileAvatar').textContent = '—'; }
    if (name === 'subscription') $('#planName').textContent = text;
    if (name === 'devices') $('#deviceCount').textContent = text;
    if (name === 'usage') {
      $('#usageUsed').textContent = '—'; $('#usageQuota').textContent = '—'; $('#usagePercent').textContent = '—';
      $('#quotaNote').textContent = text; $('#usageBar').style.width = '0%'; $('#usageMeter').removeAttribute('aria-valuenow');
    }
  };
  const applySection = (name, data, token) => {
    if (!data || typeof data !== 'object') throw Error('返回数据无效');
    if (name === 'profile') {
      const displayName = data.display_name || data.account || data.email;
      if (!displayName) throw Error('账户资料不完整');
      $('#profileName').textContent = displayName;
      if ($('#profileShortName')) $('#profileShortName').textContent = displayName.split(/\s+/)[0];
      $('#profileAvatar').textContent = displayName.trim().slice(0, 1).toUpperCase();
      $('#profileEmail').textContent = data.account && data.email && data.account !== data.email ? `账号：${data.account} · ${data.email}` : (data.account || data.email || '');
      try {
        const current = readSession();
        if (current?.token === token) {
          current.profileName = displayName;
          const email = typeof data.email === 'string' && data.email.includes('@')
            ? data.email
            : typeof data.account === 'string' && data.account.includes('@') ? data.account : '';
          if (email) current.profileEmail = email;
          else delete current.profileEmail;
          sessionStorage.setItem(storageKey, JSON.stringify(current));
          window.dispatchEvent(new Event('dwgc2e:profile-updated'));
        }
      } catch {}
    } else if (name === 'subscription') {
      if (!data.plan_name) throw Error('会员信息不完整');
      $('#planName').textContent = data.plan_name;
    } else if (name === 'usage') {
      const used = Number(data.used), quota = Number(data.monthly_quota);
      if (data.used == null || data.monthly_quota == null || !Number.isFinite(used) || used < 0 || !Number.isFinite(quota) || quota < 0) throw Error('额度信息不完整');
      const percent = quota > 0 ? used / quota * 100 : 0;
      $('#usageUsed').textContent = used.toLocaleString(); $('#usageQuota').textContent = quota.toLocaleString();
      $('#usagePercent').textContent = quota > 0 ? percent.toLocaleString(undefined, {maximumFractionDigits:1}) + '%' : '—';
      $('#usageBar').style.width = Math.min(100, percent) + '%';
      $('#usageMeter').setAttribute('aria-valuenow', String(Math.min(100, percent)));
      $('#quotaNote').textContent = quota > 0 ? '本月剩余 ' + Math.max(0, quota - used).toLocaleString() + ' 字符，可在客户端使用。' : '当前暂无可用额度，请查看套餐权益。';
    } else {
      const items = Array.isArray(data) ? data : (data.devices || data.items);
      const count = data.used_devices ?? (Array.isArray(items) ? items.length : null);
      if (count == null) throw Error('设备信息不完整');
      $('#deviceCount').textContent = String(count) + (data.max_devices != null ? ' / ' + data.max_devices : '');
    }
  };
  const loadDashboard = async token => {
    const generation = sessionGeneration, requestId = ++dashboardRequest;
    const active = () => generation === sessionGeneration && requestId === dashboardRequest;
    const current = () => active() && readSession()?.token === token;
    if (!current()) return false;
    if (dashboardToken !== token) { dashboardToken = token; loaded = {}; }
    showDashboard();
    $('#dashboardMessage').textContent = '正在同步账户信息…';
    $('#dashboardMessage').className = 'form-message';
    const failures = [];
    await Promise.all(Object.entries(sections).map(async ([name, section]) => {
      if (!loaded[name]) placeholder(name, '加载中…');
      section.status.textContent = '正在加载' + section.label + '…';
      section.status.className = 'form-message';
      try {
        const data = await request('/v1/' + name, {headers:{Authorization:`Bearer ${token}`}});
        if (!current()) return;
        applySection(name, data, token);
        loaded[name] = true;
        section.status.textContent = section.label + '已同步';
      } catch (error) {
        if (!active()) return;
        // The adapter removes only the expired matching token. A late response
        // must never log out a newer account or reopen an old dashboard.
        if ((error.authExpired && (!readSession()?.token || readSession()?.token === token)) || (error.code === 'session_changed' && !readSession()?.token)) {
          sessionStorage.removeItem(storageKey); showAuth('登录状态已失效，请重新登录。'); return;
        }
        if (!current()) return;
        failures.push(section.label);
        if (!loaded[name]) placeholder(name, '暂不可用');
        section.status.textContent = section.label + (loaded[name] ? '更新失败，保留上次数据，请刷新重试。' : '暂不可用，请刷新重试。');
        section.status.className = 'form-message error';
      }
    }));
    if (!current()) return false;
    $('#dashboardMessage').textContent = failures.length ? failures.join('、') + '同步失败，登录会话已保留。请点击刷新数据重试。' : '已同步 · ' + new Date().toLocaleTimeString('zh-CN', {hour:'2-digit', minute:'2-digit'});
    $('#dashboardMessage').className = 'form-message' + (failures.length ? ' error' : '');
    return true;
  };

  const captchaStates = new Map();
  for (const [name, purpose, visibility] of [['email', 'register', 'register-only'], ['reset_email', 'password_reset', 'forgot-only']]) {
    const input = form.elements[name];
    const suggestions = document.createElement('datalist');
    suggestions.id = name + '-suffixes'; input.setAttribute('list', suggestions.id); input.after(suggestions);
    const updateSuggestions = () => {
      const value = input.value.trim(), at = value.indexOf('@');
      const local = at < 0 ? value : value.slice(0, at), suffix = at < 0 ? '' : value.slice(at + 1).toLowerCase();
      suggestions.replaceChildren();
      if (!local || /\s/.test(local)) return;
      for (const domain of ['qq.com', '163.com', '126.com', 'outlook.com', 'gmail.com']) {
        if (!domain.startsWith(suffix)) continue;
        const option = document.createElement('option'); option.value = local + '@' + domain; suggestions.append(option);
      }
    };
    input.addEventListener('input', () => { updateSuggestions(); captchaStates.delete(purpose); image.removeAttribute('src'); entry.value = ''; });
    const box = document.createElement('div'); box.className = visibility + ' code-row';
    const label = document.createElement('label'); label.textContent = '图片数字验证码';
    const entry = document.createElement('input'); entry.inputMode = 'numeric'; entry.maxLength = 5; entry.autocomplete = 'off'; entry.placeholder = '5 位数字'; entry.setAttribute('aria-label', '图片数字验证码'); label.append(entry);
    const image = document.createElement('img'); image.alt = '数字验证码图片'; image.width = 170; image.height = 52;
    const refresh = document.createElement('button'); refresh.type = 'button'; refresh.className = 'btn btn-secondary'; refresh.textContent = '获取 / 换一张';
    const right = document.createElement('div'); right.append(image, refresh); box.append(label, right); input.closest('label').after(box);
    refresh.addEventListener('click', async () => {
      const email = input.value.trim();
      if (!/^\S+@\S+\.\S+$/.test(email)) { setMessage('请先填写有效邮箱。', true); input.focus(); return; }
      refresh.disabled = true; captchaStates.delete(purpose); entry.value = '';
      try {
        const result = await request('/v1/auth/captcha', {method:'POST',body:JSON.stringify({email,purpose})});
        if (input.value.trim() !== email) return;
        const captchaImage = String(result.image || ''); if (!/^data:image\//.test(captchaImage) && !/^https:\/\//.test(captchaImage)) throw new Error('验证码图片格式异常，请刷新重试。'); image.src = captchaImage; captchaStates.set(purpose, {id:result.captcha_id, email, entry}); entry.focus();
      } catch(error) { image.removeAttribute('src'); setMessage(error.message || '验证码加载失败，请重试。', true); }
      finally { refresh.disabled = false; }
    });
  }

  const sendVerificationCode = async (purpose, email, button) => {
    if (!/^\S+@\S+\.\S+$/.test(email)) { setMessage('请先填写有效邮箱。', true); return; }
    if (codeTimers.has(button)) return;
    const challenge = captchaStates.get(purpose);
    if (!challenge || challenge.email !== email || !/^\d{5}$/.test(challenge.entry.value)) { setMessage('请先获取图片并填写 5 位数字验证码。', true); return; }
    button.disabled = true;
    try {
      await request(purpose === 'register' ? '/v1/auth/register/request-code' : '/v1/auth/password/request-code', {
        method: 'POST', body: JSON.stringify({ email, captcha_id: challenge.id, captcha_code: challenge.entry.value })
      });
      captchaStates.delete(purpose);
      setMessage('邮件已提交发送（验证码 10 分钟内有效）。请检查收件箱及垃圾邮件；未收到时不要连续点击发送。');
      let seconds = 60;
      button.textContent = `${seconds}s 后重试`;
      const timer = setInterval(() => {
        seconds -= 1;
        button.textContent = seconds ? `${seconds}s 后重试` : '发送验证码';
        if (!seconds) { clearInterval(timer); codeTimers.delete(button); button.disabled = false; }
      }, 1000);
      codeTimers.set(button, timer);
    } catch (error) { captchaStates.delete(purpose); setMessage((error.message || '验证码发送失败。') + ' 请刷新图片验证码后重试。', true); button.disabled = false; }
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
        setMode('login'); setMessage('密码已重置，请使用新密码登录。'); form.elements.account.focus(); return;
      }
      if (mode === 'register') {
        if (!data.email || !data.register_code) return setMessage('请填写邮箱和邮箱验证码。', true);
        await request('/v1/auth/register', { method: 'POST', body: JSON.stringify({ account: data.email.trim(), email: data.email.trim(), password: data.password, display_name: data.display_name.trim() || data.email.trim(), verification_code: data.register_code }) });
      }
      const result = await request('/v1/auth/web/login', { method: 'POST', body: JSON.stringify({ account: mode === 'register' ? data.email.trim() : data.account.trim(), password: data.password }) });
      if (!result.token) throw new Error('登录响应缺少会话信息，请重试。');
      sessionGeneration++;
      dashboardToken = '';
      try { localStorage.removeItem('dwgc2e.device-id'); } catch {}
      sessionStorage.setItem(storageKey, JSON.stringify({ token: result.token, expiresAt: result.expires_at, userId: result.user_id }));
      if (returnTarget && returnTarget !== 'account.html' && readSession()?.token === result.token) {
        window.location.replace(returnTarget); return;
      }
      await loadDashboard(result.token);
      void checkApiStatus();
    } catch (error) { setMessage(error.name === 'AbortError' ? '服务器响应超时，请检查 API 部署状态后重试。' : (error.message || '请求失败，请稍后重试。'), true); }
    finally { button.disabled = false; authSubmitting = false; }
  });

  // A purchase intent (plan, channel, idempotency key, order number) persists in localStorage
  // across tabs and restarts. It is meaningless without a session, so it never outlives logout.
  const clearLocalAccountState = () => {
    try { for (const key of Object.keys(localStorage)) if (key.startsWith('dwgc2e.payment.pending.')) localStorage.removeItem(key); } catch {}
    try { localStorage.removeItem('dwgc2e.device-id'); } catch {}
    sessionStorage.removeItem(storageKey);
  };

  $('#logoutButton')?.addEventListener('click', async () => {
    const button = $('#logoutButton'); button.disabled = true;
    sessionGeneration++;
    try {
      await window.QLCAD_API.auth.logout();
      clearLocalAccountState(); showAuth('已退出登录，APP 设备绑定不受影响。');
    } catch (error) {
      if (error.authExpired) { clearLocalAccountState(); showAuth('登录已失效。'); }
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
  // A restored or idle dashboard must not keep exposing the previous account.
  const validateDisplayedSession = () => {
    if (accountPanel.hidden) return;
    const current = readSession();
    if (!current?.token || current.token !== dashboardToken || (current.expiresAt && !(Date.parse(current.expiresAt) > Date.now()))) {
      showAuth('登录状态已变化，请重新登录或刷新页面。');
    }
  };
  for (const event of ['focus', 'pageshow', 'storage']) window.addEventListener(event, validateDisplayedSession);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) validateDisplayedSession(); });
  setInterval(validateDisplayedSession, 1000);
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
