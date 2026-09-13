(() => {
  const message = document.querySelector('#portalMessage');
  const say = (text, error = false) => { if (message) { message.textContent = text; message.className = `form-message${error ? ' error' : ''}`; } };
  document.querySelectorAll('[data-integration-action]').forEach(button => button.addEventListener('click', () => say(button.dataset.integrationAction)));
  const list = document.querySelector('#deviceList');
  if (list && window.DWGC2E_API) window.DWGC2E_API.account.devices().then(data => {
    list.innerHTML = `<div class="device-row"><div><strong>当前浏览器</strong><span>已绑定设备 ${data.used_devices || 0} / ${data.max_devices || 3}</span></div><em>使用中</em></div>`;
  }).catch(error => { list.innerHTML = '<div class="portal-empty">设备列表接口尚未开放，当前只能查看账户中心的设备数量。</div>'; say(error.message || '设备信息暂时无法读取', true); });
  const form = document.querySelector('#profileForm');
  if (form && window.DWGC2E_API) {
    window.DWGC2E_API.account.profile().then(data => { form.elements.display_name.value = data.display_name || ''; form.elements.email.value = data.email || ''; }).catch(() => say('账户信息暂时无法读取。', true));
    form.addEventListener('submit', async event => { event.preventDefault(); try { await window.DWGC2E_API.profileManagement.update(Object.fromEntries(new FormData(form))); say('资料修改接口尚未开放，已保留表单结构。'); } catch (error) { say(error.message || '资料修改接口尚未开放。', true); } });
  }
})();
