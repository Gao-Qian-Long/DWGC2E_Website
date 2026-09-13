(() => {
  'use strict';
  const session = (() => { try { return JSON.parse(sessionStorage.getItem('dwgc2e.session') || 'null'); } catch { return null; } })();
  const tokenValid = !!(session?.token && (!session.expiresAt || new Date(session.expiresAt) > new Date()));
  const message = document.querySelector('#portalMessage');
  const say = (text, error = false) => { if (message) { message.textContent = text || ''; message.className = `form-message${error ? ' error' : ''}`; } };
  const goLogin = () => window.location.replace(`account.html?return=${encodeURIComponent(location.pathname.split('/').pop() || 'account.html')}`);
  if (!tokenValid) {
    say('请先登录后再访问此页面。', true);
    document.querySelectorAll('button[type="submit"], [data-integration-action], [data-revoke]').forEach(button => { button.disabled = true; });
    const card = document.querySelector('.portal-card');
    if (card && !card.querySelector('.portal-login-link')) { const link = document.createElement('a'); link.className = 'btn btn-primary portal-login-link'; link.href = 'account.html'; link.textContent = '前往登录'; card.append(link); }
    return;
  }
  document.querySelectorAll('[data-integration-action]').forEach(button => button.addEventListener('click', async () => {
    say('正在连接服务…'); button.disabled = true;
    try { await window.DWGC2E_API.billing.checkout({ plan_id: button.dataset.planId || button.dataset.integrationAction }); say('支付接口已返回，请按页面提示继续。'); }
    catch (error) { say(error.status === 404 ? '套餐支付接口暂未开放，当前不会产生订单。' : (error.message || '暂时无法创建订单。'), true); }
    finally { button.disabled = false; }
  }));
  const list = document.querySelector('#deviceList');
  if (list && window.DWGC2E_API) window.DWGC2E_API.deviceManagement.list().then(data => {
    const devices = Array.isArray(data) ? data : (data.devices || []);
    list.innerHTML = devices.length ? devices.map(device => `<div class="device-row"><div><strong>${device.device_name || device.name || '未命名设备'}</strong><span>${device.platform || 'Windows'} · ${device.last_seen_at || '已绑定'}</span></div><button class="btn btn-ghost btn-sm" data-revoke="${String(device.device_id || device.id || '').replace(/"/g, '&quot;')}">解除绑定</button></div>`).join('') : '<div class="portal-empty">暂无已绑定设备。</div>';
    list.querySelectorAll('[data-revoke]').forEach(button => button.addEventListener('click', async () => { if (!confirm('确定解除这台设备吗？')) return; button.disabled = true; try { await window.DWGC2E_API.deviceManagement.revoke(button.dataset.revoke); button.closest('.device-row').remove(); say('设备已解除绑定。'); } catch (error) { button.disabled = false; say(error.status === 404 ? '设备解绑接口暂未开放。' : (error.message || '设备解绑失败。'), true); } }));
  }).catch(() => { list.innerHTML = '<div class="portal-empty">设备列表接口暂未开放，请先在账户中心查看设备数量。</div>'; say('设备列表接口暂未开放。', true); });
  const form = document.querySelector('#profileForm');
  if (form && window.DWGC2E_API) {
    window.DWGC2E_API.account.profile().then(data => { form.elements.display_name.value = data.display_name || ''; form.elements.email.value = data.email || data.account || ''; }).catch(() => say('账户信息暂时无法读取。', true));
    form.addEventListener('submit', async event => { event.preventDefault(); const button = form.querySelector('button[type=submit]'); button.disabled = true; try { await window.DWGC2E_API.profileManagement.update(Object.fromEntries(new FormData(form))); say('资料已保存。'); } catch (error) { say(error.status === 404 ? '资料保存接口暂未开放，尚未保存任何修改。' : (error.message || '资料保存失败。'), true); } finally { button.disabled = false; } });
  }
  const passwordForm = document.querySelector('#passwordForm');
  if (passwordForm && window.DWGC2E_API) passwordForm.addEventListener('submit', async event => { event.preventDefault(); const msg = document.querySelector('#passwordMessage'); const button = passwordForm.querySelector('button[type=submit]'); if (passwordForm.new_password.value.length < 8 || passwordForm.new_password.value !== passwordForm.confirm_password.value) { msg.textContent = '请确认两次输入一致，且新密码至少 8 位。'; msg.className = 'form-message error'; return; } button.disabled = true; try { await window.DWGC2E_API.profileManagement.changePassword(Object.fromEntries(new FormData(passwordForm))); msg.textContent = '密码已修改，请重新登录。'; msg.className = 'form-message'; } catch (error) { msg.textContent = error.status === 404 ? '密码修改接口暂未开放。' : (error.message || '密码修改失败。'); msg.className = 'form-message error'; } finally { button.disabled = false; } });
})();
