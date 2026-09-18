(() => {
  'use strict';
  const api = window.DWGC2E_API;
  const readSession = () => { try { return JSON.parse(sessionStorage.getItem('dwgc2e.session') || 'null'); } catch { return null; } };
  const session = readSession();
  const valid = () => { const current = readSession(); return !!(session?.token && current?.token === session.token && (!current.expiresAt || Date.parse(current.expiresAt) > Date.now())); };
  const profile = document.querySelector('#profileForm'), password = document.querySelector('#passwordForm'), list = document.querySelector('#deviceList');
  const retryProfile = document.querySelector('#retryProfile'), retryDevices = document.querySelector('#retryDevices');
  const say = (text, error = false) => { const node = document.querySelector('#portalMessage'); if (node) { node.textContent = text; node.className = 'form-message' + (error ? ' error' : ''); } };
  let ended = false;
  function requireLogin(text = '登录已失效，请重新登录后继续。') {
    ended = true; window.DWGC2E_AUTH.requireLogin(text);
    if (list) list.replaceChildren();
    profile?.reset(); password?.reset();
    document.querySelectorAll("main input,main button,main select,main textarea").forEach(el=>el.disabled=true);
  }
  const active = () => { if (ended) return false; if (!valid()) { requireLogin(); return false; } return true; };
  if (!valid()) { requireLogin('请先登录后再管理你的账户。'); return; }
  for (const event of ['focus', 'pageshow', 'storage']) window.addEventListener(event, active);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) active(); });
  const sessionTimer = setInterval(() => { if (!active()) clearInterval(sessionTimer); }, 1000);
  let profileBusy = false, profileReady = false;
  async function loadProfile() {
    if (profileBusy || !active()) return;
    if (profileReady && profile.elements.display_name.value !== profile.dataset.savedName && !confirm('重新读取将放弃尚未保存的显示名称，是否继续？')) return;
    profileBusy = true; retryProfile.disabled = true; profile.elements.display_name.disabled = true;
    const submit = profile.querySelector('[type=submit]'); submit.disabled = true; say('正在读取账户资料…');
    try {
      const data = await api.account.profile(); if (!active()) return;
      profile.elements.display_name.value = data?.display_name || '';
      profile.dataset.savedName = profile.elements.display_name.value;
      profile.elements.email.value = data?.email || data?.account || '';
      profile.elements.display_name.placeholder = '输入显示名称'; profileReady = true; window.DWGC2E_AUTH.ready(); say('');
    } catch (error) { if (active()) { window.DWGC2E_AUTH.error(); profile.elements.display_name.placeholder='暂不可用'; say('资料暂时无法读取，请点击「重新读取」重试。' + (profileReady ? ' 已保留之前的资料。' : ''), true); } }
    finally { profileBusy = false; if (!ended) { retryProfile.disabled = false; profile.elements.display_name.disabled = !profileReady; submit.disabled = !profileReady; } }
  }
  if (profile) {
    retryProfile.onclick = loadProfile;
    profile.onsubmit = async event => {
      event.preventDefault(); if (profileBusy || !profileReady || !active()) return;
      const name = profile.elements.display_name.value.trim();
      if (!name) { say('显示名称不能只包含空格。', true); profile.elements.display_name.focus(); return; }
      profileBusy = true; const button = profile.querySelector('[type=submit]'); button.disabled = true; retryProfile.disabled = true; profile.elements.display_name.disabled = true; say('正在保存资料…');
      try { const result = await api.profileManagement.update({display_name:name}); if (!active()) return; profile.elements.display_name.value = result.display_name || name; profile.dataset.savedName = profile.elements.display_name.value; say('资料已保存。'); }
      catch (error) { if (active()) say(error.message || '资料保存失败，输入已保留，请重试。', true); }
      finally { profileBusy = false; if (!ended) { button.disabled = false; retryProfile.disabled = false; profile.elements.display_name.disabled = false; } }
    };
    loadProfile();
  }
  let passwordBusy = false;
  if (password) password.onsubmit = async event => {
    event.preventDefault(); if (passwordBusy || !active()) return;
    const message = document.querySelector('#passwordMessage');
    if (password.elements.new_password.value !== password.elements.confirm_password.value) { message.textContent = '两次输入的新密码不一致，请重新确认。'; message.className = 'form-message error'; password.elements.confirm_password.focus(); return; }
    passwordBusy = true; const button = password.querySelector('[type=submit]'); button.disabled = true; message.textContent = '正在更新密码…'; message.className = 'form-message';
    const body = Object.fromEntries(new FormData(password));
    try { await api.profileManagement.changePassword(body); if (!active()) return; sessionStorage.removeItem('dwgc2e.session'); requireLogin('密码已更新，请使用新密码重新登录。'); message.textContent = '密码已更新，所有旧登录会话已失效。'; document.querySelector('.portal-login-link')?.focus(); }
    catch (error) { if (active()) { message.textContent = error.message || '密码修改失败，请重试。'; message.className = 'form-message error'; } }
    finally { passwordBusy = false; if (!ended) button.disabled = false; }
  };
  let devicesBusy = false, devicesReady = false;
  async function loadDevices() {
    if (devicesBusy || !active()) return;
    devicesBusy = true; retryDevices.disabled = true; say('正在读取设备…');
    try { const data = await api.deviceManagement.list(); if (!active()) return;
      const rows = Array.isArray(data) ? data : (data?.devices || data?.items || []); list.replaceChildren();
      for (const device of rows) {
        const row = document.createElement('div'); row.className = 'device-row';
        const info = document.createElement('div'), title = document.createElement('strong'), meta = document.createElement('span');
        title.textContent = device.device_name || device.name || '未命名设备'; meta.textContent = (device.platform || 'Windows') + ' · ' + (device.last_seen || device.last_seen_at || '已绑定'); info.append(title,meta); row.append(info);
        const id = device.device_id || device.id;
        if (id) { const button = document.createElement('button'); button.type = 'button'; button.className = 'btn btn-ghost btn-sm'; const locked = device.can_revoke !== true; button.textContent = locked ? '尚未到可解绑时间' : '解除绑定'; button.disabled = locked; button.dataset.revoke = id; if(locked) meta.textContent += ' · ' + (device.unbind_available_at ? new Date(device.unbind_available_at).toLocaleString() + ' 后可解绑' : '暂不可解绑，请刷新或联系管理员');
          button.onclick = async () => { if (!active() || !confirm('解除后，这台 APP 的登录将失效。确定继续吗？')) return; button.disabled = true;
            try { await api.deviceManagement.revoke(id); if (!active()) return; row.remove(); emptyDevices(); say('APP 绑定已解除，设备名额已释放。'); }
            catch (error) { if (active()) { button.disabled = false; say(error.message || '解绑失败，请重试。',true); } }
          }; row.append(button); }
        list.append(row);
      }
      devicesReady = true; window.DWGC2E_AUTH.ready(); emptyDevices(); say('设备列表已更新。');
    } catch (error) { if (active()) { window.DWGC2E_AUTH.error(); if (!devicesReady) { list.textContent = '设备列表暂不可用。'; } say('设备读取失败，请点击「刷新设备」重试。' + (devicesReady ? ' 已保留之前的列表。' : ''), true); } }
    finally { devicesBusy = false; if (!ended) retryDevices.disabled = false; }
  }
  function emptyDevices() { if (!list.children.length) { const empty = document.createElement('div'); empty.className = 'portal-empty'; empty.textContent = '还没有已绑定设备。在 Windows 客户端登录后，设备会显示在这里。'; list.append(empty); } }
  if (list) { retryDevices.onclick = loadDevices; loadDevices(); }
})();
