/* Targeted user notifications: audience selection, delivery and read receipts. */
(() => {
  'use strict';
  const auth = window.QLCAD_ADMIN_AUTH;
  const base = (window.QLCAD_SITE || {}).apiBaseUrl || '/api';
  const $ = id => document.getElementById(id);
  const api = (path, options = {}) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    return fetch(base + path, { ...options, cache: 'no-store', credentials: 'same-origin', signal: controller.signal, headers: { 'content-type': 'application/json', ...(options.headers || {}) } })
      .then(async response => {
        let data = null;
        try { data = await response.json(); } catch { throw new Error('服务返回格式不完整，请重试。'); }
        if (!response.ok) { const error = new Error(data?.message || '后台请求失败'); error.status = response.status; error.data = data; throw error; }
        return data;
      })
      .finally(() => clearTimeout(timer));
  };
  const date = value => {
    if (!value) return '未记录';
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }) + '（北京时间）' : '时间格式异常';
  };
  const number = value => new Intl.NumberFormat('zh-CN').format(Number(value) || 0);
  // datetime-local needs a local wall-clock string; the editor must show what it is about to save,
  // otherwise re-saving an untouched form would silently clear the existing expiry.
  const localInput = value => { if (!value) return ''; const d = new Date(value); return Number.isFinite(d.getTime()) ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19) : ''; };
  const text = (tag, value, className) => { const element = document.createElement(tag); element.textContent = value == null ? '' : String(value); if (className) element.className = className; return element; };
  const setMessage = (id, message = '', error = false) => { const element = $(id); element.textContent = message; element.className = 'form-message' + (error ? ' error' : ''); };
  const describe = error => error?.name === 'AbortError' ? '请求超时，请重试。若发布请求可能已经提交，请先刷新列表核对。' : error instanceof TypeError ? '网络连接失败，请检查网络后重试。' : error?.message || '后台操作失败，请重试。';
  // request_id must be a uuid; randomUUID needs a secure context, so keep a getRandomValues fallback.
  const uuid = () => {
    if (typeof crypto === 'undefined') throw new Error('当前浏览器不支持安全随机数，请使用现代浏览器打开后台。');
    if (crypto.randomUUID) return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40; bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  };

  const TITLE_MAX = 120, BODY_MAX = 2000, REASON_MAX = 500, AUDIENCE_MAX = 500;
  let items = [], listPage = 1, listHasMore = false, listBusy = false;
  const selection = new Map();
  let targets = [], targetPage = 1, targetHasMore = false, targetQuery = '', targetBusy = false;
  let sendAttempt = null, sending = false, loading = false, epoch = 1;
  let reasonResolver = null;
  let roster = { notificationId: null, filter: 'all', page: 1, run: 0 };

  function setBusy(value) {
    loading = value;
    ['notifyRefresh', 'targetSearchButton', 'notifySend', 'selectionClear', 'targetPrev', 'targetNext', 'listPrev', 'listNext'].forEach(id => { if ($(id)) $(id).disabled = value; });
    $('userLogout').disabled = false;
  }
  function showWorkspace() { $('adminChecking').hidden = true; $('userGate').hidden = true; $('userWorkspace').hidden = false; $('userLogout').hidden = false; }
  function hideWorkspace(message = '') { $('userWorkspace').hidden = true; $('userGate').hidden = false; $('userLogout').hidden = true; if (message) setMessage('userMessage', message); }
  function resetWorkspace() {
    epoch++; items = []; listPage = 1; listHasMore = false; targets = []; targetPage = 1; targetHasMore = false; targetQuery = ''; selection.clear(); sendAttempt = null; roster = { notificationId: null, filter: 'all', page: 1, run: 0 };
    $('notificationList').replaceChildren(); $('targetList').replaceChildren(); $('selectionList').replaceChildren(); $('metrics').querySelectorAll('strong').forEach(node => { node.textContent = '—'; });
    $('targetForm').reset(); $('notifyForm').reset(); $('userWorkspace').hidden = true; $('userLogout').hidden = true; $('userGate').hidden = false;
    renderSelection();
  }

  function renderMetrics() {
    const recipients = items.reduce((total, item) => total + (Number(item.recipient_count) || 0), 0);
    const unread = items.reduce((total, item) => total + Math.max(0, (Number(item.recipient_count) || 0) - (Number(item.read_count) || 0)), 0);
    const withdrawn = items.filter(item => item.withdrawn_at).length;
    $('metricTotal').textContent = number(items.length);
    $('metricRecipients').textContent = number(recipients);
    $('metricUnread').textContent = number(unread);
    $('metricWithdrawn').textContent = number(withdrawn);
  }

  function selectionLabel(user) { return user.display_name || user.account || user.email || user.id; }
  function renderSelection() {
    const root = $('selectionList'); root.replaceChildren();
    $('selectionSummary').textContent = selection.size ? `已选择 ${selection.size} 位收件人（上限 ${AUDIENCE_MAX} 位，发送前请再核对一次）。` : '尚未选择收件人。请先搜索并勾选上方列表。';
    $('notifySend').disabled = loading || sending || selection.size === 0;
    if (!selection.size) return;
    for (const user of selection.values()) {
      const chip = text('span', '', 'nt-chip');
      chip.append(text('span', selectionLabel(user)));
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '移除 ×'; remove.setAttribute('aria-label', `移除收件人 ${selectionLabel(user)}`);
      remove.onclick = () => { selection.delete(user.id); renderTargets(); renderSelection(); };
      chip.append(remove); root.append(chip);
    }
  }
  function toggleSelection(user, checked) {
    if (checked) {
      if (selection.size >= AUDIENCE_MAX) { setMessage('targetMessage', `一次最多发送给 ${AUDIENCE_MAX} 位收件人，请分批发送。`, true); return false; }
      selection.set(user.id, user);
    } else selection.delete(user.id);
    setMessage('targetMessage', ''); renderSelection(); return true;
  }

  function renderTargets() {
    const root = $('targetList'); root.replaceChildren();
    $('targetPage').textContent = targetQuery ? `第 ${targetPage} 页 · 匹配“${targetQuery}”` : `第 ${targetPage} 页`;
    $('targetCount').textContent = targets.length ? `本页 ${targets.length} 位账户` : '';
    if (!targets.length) { root.append(text('p', targetQuery ? '没有匹配的账户。请改用账号、邮箱或完整用户编号再试。' : '输入账号、邮箱、昵称或完整用户编号后搜索。', 'portal-empty')); }
    for (const user of targets) {
      const row = document.createElement('label'); row.className = 'nt-target'; row.dataset.userId = user.id;
      const box = document.createElement('input'); box.type = 'checkbox'; box.checked = selection.has(user.id);
      box.setAttribute('aria-label', `选择收件人 ${selectionLabel(user)}`);
      box.onchange = () => { if (!toggleSelection(user, box.checked)) box.checked = false; };
      const label = selectionLabel(user);
      // 同一信息只出现一次：账号即昵称或邮箱时不再重复展示。
      const account = user.account && user.account !== label ? user.account : '';
      const email = user.email && user.email !== label && user.email !== account ? user.email : '';
      const identity = document.createElement('div'); identity.append(text('strong', label));
      if (account) identity.append(text('small', account));
      const contact = document.createElement('div');
      if (email) contact.append(text('small', email));
      else if (!user.email) contact.append(text('small', '未填写邮箱'));
      const identityId = document.createElement('div'); identityId.className = 'nt-id'; identityId.title = user.id;
      identityId.append(text('small', '用户编号'));
      const idValue = text('small', user.id); idValue.className = 'nt-id-value';
      identityId.append(idValue);
      row.append(box, identity, contact, identityId); root.append(row);
    }
    $('targetPrev').disabled = loading || targetPage <= 1;
    $('targetNext').disabled = loading || !targetHasMore;
  }

  function recipientBadge(readAt) {
    const badge = text('span', readAt ? '已读' : '未读', `ai-health-badge ${readAt ? 'active' : 'disabled'}`);
    return badge;
  }
  function renderRoster(container, data) {
    const body = container.querySelector('.nt-recipients-body'); body.replaceChildren();
    const list = Array.isArray(data?.items) ? data.items : [];
    container.querySelector('.nt-recipients-count').textContent = data ? `已读 ${number(data.read_count)} · 未读 ${number(data.unread_count)} · 共 ${number(data.total)} 位` : '';
    if (!list.length) { body.append(text('p', '该筛选条件下没有收件人记录。', 'portal-empty')); }
    for (const entry of list) {
      const row = document.createElement('article'); row.className = 'user-row';
      const identity = document.createElement('div'); identity.append(text('strong', entry.display_name || entry.account || entry.user_id), text('p', entry.account || '未设置账号'));
      const contact = document.createElement('div'); contact.append(text('p', entry.email || '未填写邮箱'));
      const identityId = document.createElement('div'); identityId.append(text('small', entry.user_id));
      const read = document.createElement('div'); read.append(recipientBadge(entry.read_at), text('small', entry.read_at ? `读于 ${date(entry.read_at)}` : '尚未读取'));
      row.append(identity, contact, identityId, read); body.append(row);
    }
    const pager = container.querySelector('.nt-recipients-pager'); pager.replaceChildren();
    const prev = document.createElement('button'); prev.type = 'button'; prev.className = 'btn btn-ghost'; prev.textContent = '上一页'; prev.disabled = roster.page <= 1;
    const next = document.createElement('button'); next.type = 'button'; next.className = 'btn btn-ghost'; next.textContent = '下一页'; next.disabled = !data?.hasMore;
    prev.onclick = () => loadRoster(container, roster.notificationId, roster.filter, roster.page - 1);
    next.onclick = () => loadRoster(container, roster.notificationId, roster.filter, roster.page + 1);
    pager.append(prev, text('span', `第 ${roster.page} 页`), next);
  }
  async function loadRoster(container, id, filter, page) {
    const run = ++roster.run; roster = { notificationId: id, filter, page, run };
    const message = container.querySelector('.nt-recipients-message');
    message.textContent = '正在读取已读/未读名单…';
    container.querySelectorAll('.ops-tabs button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.filter === filter)));
    try {
      const data = await api(`/v1/admin/notifications/${encodeURIComponent(id)}/recipients?filter=${encodeURIComponent(filter)}&page=${page}`);
      if (run !== roster.run) return;
      message.textContent = ''; renderRoster(container, data);
    } catch (error) { if (run === roster.run) { message.textContent = describe(error); message.className = 'form-message error'; } }
  }

  function renderNotifications() {
    const root = $('notificationList'); root.replaceChildren();
    $('listPage').textContent = `第 ${listPage} 页`;
    if (!items.length) root.append(text('p', '还没有已发布的通知。在上方选择收件人后发送第一条。', 'portal-empty'));
    for (const item of items) {
      const article = document.createElement('article'); article.className = 'ops-record'; article.dataset.notificationId = item.id;
      const heading = document.createElement('h3'); heading.append(text('span', item.title || '（无标题）'));
      if (item.withdrawn_at) heading.append(text('span', '已撤回', 'ai-health-badge disabled'));
      article.append(heading);
      const meta = text('p', '', 'nt-meta');
      meta.append(text('span', `发布 ${date(item.created_at)}`));
      meta.append(text('span', item.expires_at ? `有效期至 ${date(item.expires_at)}` : '长期有效'));
      meta.append(text('span', `收件人 ${number(item.recipient_count)}`));
      meta.append(text('span', `已读 ${number(item.read_count)}`));
      if (item.withdrawn_at) meta.append(text('span', `撤回于 ${date(item.withdrawn_at)}`));
      article.append(meta);
      article.append(text('p', item.body || '', 'nt-body'));
      const actions = document.createElement('div'); actions.className = 'form-actions';
      const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'btn btn-ghost'; toggle.textContent = '查看已读/未读名单'; toggle.setAttribute('aria-expanded', 'false');
      const panel = document.createElement('div'); panel.className = 'nt-recipients'; panel.hidden = true;
      const tabs = document.createElement('div'); tabs.className = 'ops-tabs';
      for (const [filter, label] of [['all', '全部收件人'], ['read', '已读'], ['unread', '未读']]) {
        const tab = document.createElement('button'); tab.type = 'button'; tab.className = 'btn btn-ghost'; tab.dataset.filter = filter; tab.textContent = label; tab.setAttribute('aria-pressed', 'false');
        tab.onclick = () => loadRoster(panel, item.id, filter, 1); tabs.append(tab);
      }
      const count = text('p', '', 'nt-recipients-count field-hint');
      const message = text('p', '', 'form-message nt-recipients-message'); message.setAttribute('role', 'status'); message.setAttribute('aria-live', 'polite');
      const bodyBox = text('div', '', 'nt-recipients-body');
      const pager = text('div', '', 'ops-pagination nt-recipients-pager');
      panel.append(tabs, count, message, bodyBox, pager);
      toggle.onclick = () => {
        const open = panel.hidden; panel.hidden = !open; toggle.setAttribute('aria-expanded', String(open));
        if (open) loadRoster(panel, item.id, 'all', 1);
      };
      actions.append(toggle);
      if (!item.withdrawn_at) {
        const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'btn btn-ghost'; edit.textContent = '编辑正文';
        edit.onclick = () => openEditor(article, item); actions.append(edit);
        const withdraw = document.createElement('button'); withdraw.type = 'button'; withdraw.className = 'btn btn-ghost nt-danger';
        withdraw.textContent = '撤回通知';
        withdraw.onclick = async () => {
          const reason = await askReason('撤回定向通知', `将撤回“${item.title}”。撤回后客户端不再展示该通知，已读回执与投递记录继续保留。请填写撤回原因。`);
          if (!reason || loading) return;
          setBusy(true); setMessage('listMessage', '正在撤回通知…');
          try {
            const result = await api(`/v1/admin/notifications/${encodeURIComponent(item.id)}/withdraw`, { method: 'POST', body: JSON.stringify({ reason }) });
            await loadList(listPage);
            setMessage('listMessage', result?.already_withdrawn ? `“${item.title}”此前已经撤回，本次未重复生效。` : `已撤回“${item.title}”，客户端将不再展示该通知。`);
          }
          catch (error) { setMessage('listMessage', describe(error), true); }
          finally { setBusy(false); }
        };
        actions.append(withdraw);
      }
      article.append(actions, panel); root.append(article);
    }
    $('listPrev').disabled = loading || listPage <= 1;
    $('listNext').disabled = loading || !listHasMore;
  }

  function openEditor(article, item) {
    let editor = article.querySelector('.nt-editor');
    if (editor) { editor.hidden = !editor.hidden; return; }
    editor = document.createElement('form'); editor.className = 'ai-form nt-editor';
    const titleLabel = text('label', '通知标题'); const title = document.createElement('input'); title.type = 'text'; title.required = true; title.maxLength = TITLE_MAX; title.spellcheck = false; title.value = item.title || ''; titleLabel.append(title);
    const bodyLabel = text('label', '通知正文'); const body = document.createElement('textarea'); body.rows = 6; body.required = true; body.maxLength = BODY_MAX; body.spellcheck = false; body.value = item.body || ''; bodyLabel.append(body);
    const expiryLabel = text('label', '有效期（可选）'); const expiry = document.createElement('input'); expiry.type = 'datetime-local'; expiry.step = '1'; expiry.spellcheck = false; expiry.value = localInput(item.expires_at); expiryLabel.append(expiry);
    const reasonLabel = text('label', '修改原因'); const reason = document.createElement('input'); reason.type = 'text'; reason.required = true; reason.minLength = 1; reason.maxLength = REASON_MAX; reason.spellcheck = false; reasonLabel.append(reason);
    const message = text('p', '', 'form-message'); message.setAttribute('role', 'status');
    const actions = document.createElement('div'); actions.className = 'form-actions';
    const save = document.createElement('button'); save.type = 'submit'; save.className = 'btn btn-primary'; save.textContent = '保存正文修改';
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'btn btn-ghost'; cancel.textContent = '取消修改'; cancel.onclick = () => { editor.hidden = true; };
    actions.append(save, cancel);
    editor.append(titleLabel, bodyLabel, expiryLabel, reasonLabel, message, actions);
    editor.onsubmit = async event => {
      event.preventDefault();
      if (loading || !editor.checkValidity()) { editor.reportValidity(); return; }
      setBusy(true); message.textContent = '正在保存修改…'; message.className = 'form-message';
      try {
        await api(`/v1/admin/notifications/${encodeURIComponent(item.id)}`, { method: 'POST', body: JSON.stringify({ title: title.value.trim(), body: body.value.trim(), expires_at: expiry.value ? new Date(expiry.value).toISOString() : null, revision: item.revision, reason: reason.value.trim() }) });
        await loadList(listPage); setMessage('listMessage', `已更新“${item.title}”，收件人已读状态不变。`);
      } catch (error) { message.textContent = describe(error); message.className = 'form-message error'; }
      finally { setBusy(false); }
    };
    article.append(editor);
  }

  async function loadList(page = 1) {
    if (loading) return; const generation = epoch;
    setBusy(true); setMessage('listMessage', '正在读取已发布通知…');
    try {
      const data = await api(`/v1/admin/notifications?page=${page}`);
      if (generation !== epoch) return;
      items = Array.isArray(data?.items) ? data.items : []; listPage = Number(data?.page) || page; listHasMore = Boolean(data?.hasMore);
      renderNotifications(); renderMetrics(); setMessage('listMessage', '');
    } catch (error) { if (generation === epoch) setMessage('listMessage', describe(error), true); }
    finally { if (generation === epoch) setBusy(false); }
  }

  async function searchTargets(page = 1) {
    if (loading) return; const generation = epoch;
    targetQuery = $('targetSearch').value.trim(); targetPage = page;
    setBusy(true); setMessage('targetMessage', '正在查询用户…');
    try {
      const query = new URLSearchParams({ q: targetQuery, page: String(page) });
      const data = await api('/v1/admin/users?' + query);
      if (generation !== epoch) return;
      targets = Array.isArray(data?.items) ? data.items : []; targetHasMore = Boolean(data?.hasMore); targetPage = Number(data?.page) || page;
      renderTargets(); setMessage('targetMessage', '');
    } catch (error) { if (generation === epoch) { targets = []; targetHasMore = false; renderTargets(); setMessage('targetMessage', describe(error), true); } }
    finally { if (generation === epoch) { setBusy(false); renderSelection(); } }
  }

  async function sendNotification(event) {
    event.preventDefault();
    if (loading || sending) return;
    const form = $('notifyForm'); if (!form.checkValidity()) { form.reportValidity(); return; }
    if (!selection.size) { setMessage('notifyMessage', '请先选择至少一位收件人。', true); return; }
    const title = $('notifyTitle').value.trim(), body = $('notifyBody').value.trim(), reason = $('notifyReason').value.trim();
    const raw = $('notifyExpiry').value;
    // The contract requires expires_at to be strictly in the future; catching it here avoids a 400.
    if (raw && !(new Date(raw).getTime() > Date.now())) { setMessage('notifyMessage', '有效期必须晚于当前时间，或留空表示长期有效。', true); $('notifyExpiry').focus(); return; }
    const expires = raw ? new Date(raw).toISOString() : null;
    const detail = { title, body, user_ids: Array.from(selection.keys()), expires_at: expires, reason };
    const signature = JSON.stringify(detail);
    // Reusing the request id makes an uncertain retry idempotent instead of sending twice.
    if (sendAttempt?.signature !== signature) sendAttempt = { signature, request_id: uuid() };
    sending = true; setBusy(true); setMessage('notifyMessage', `正在向 ${selection.size} 位收件人发布通知…`);
    try {
      const result = await api('/v1/admin/notifications', { method: 'POST', body: JSON.stringify({ ...detail, request_id: sendAttempt.request_id }) });
      const created = result?.notification || {};
      sendAttempt = null; selection.clear(); form.reset(); renderSelection(); renderTargets();
      await loadList(1);
      setMessage('notifyMessage', result?.replayed ? `该请求此前已提交，通知“${title}”未重复发送。` : `已发布“${created.title || title}”，收件人 ${number(created.recipient_count ?? detail.user_ids.length)} 位。`);
    } catch (error) { setMessage('notifyMessage', describe(error) + ' 相同内容重试会复用同一请求编号，不会重复发送；修改内容后会生成新编号，视为全新发布。', true); }
    finally { sending = false; setBusy(false); renderSelection(); }
  }

  function askReason(title, description) {
    return new Promise(resolve => { reasonResolver = resolve; $('reasonTitle').textContent = title; $('reasonDescription').textContent = description; $('reasonInput').value = ''; $('reasonDialog').showModal(); $('reasonInput').focus(); });
  }
  $('reasonForm').addEventListener('submit', event => { event.preventDefault(); const confirmed = event.submitter?.value === 'confirm' && $('reasonForm').checkValidity(); const value = confirmed ? $('reasonInput').value.trim() : ''; $('reasonDialog').close(); reasonResolver?.(value); reasonResolver = null; });

  async function restoreSession() {
    $('adminChecking').hidden = false;
    try { await auth.check(); showWorkspace(); await loadList(1); }
    catch (error) { hideWorkspace(error.status === 401 ? '请登录后台；有效会话内切换页面和刷新无需重输密钥。' : '暂时无法检查后台登录状态，请重试。'); }
    finally { $('adminChecking').hidden = true; }
  }

  $('targetForm').addEventListener('submit', event => { event.preventDefault(); searchTargets(1); });
  $('targetPrev').addEventListener('click', () => searchTargets(Math.max(1, targetPage - 1)));
  $('targetNext').addEventListener('click', () => searchTargets(targetPage + 1));
  $('selectionClear').addEventListener('click', () => { selection.clear(); renderTargets(); renderSelection(); });
  $('selectPage').addEventListener('click', () => { for (const user of targets) { if (selection.size >= AUDIENCE_MAX) { setMessage('targetMessage', `一次最多发送给 ${AUDIENCE_MAX} 位收件人，本页未能全部选中。`, true); break; } selection.set(user.id, user); } renderTargets(); renderSelection(); });
  $('notifyForm').addEventListener('submit', sendNotification);
  $('notifyRefresh').addEventListener('click', () => loadList(listPage));
  $('listPrev').addEventListener('click', () => loadList(Math.max(1, listPage - 1)));
  $('listNext').addEventListener('click', () => loadList(listPage + 1));
  $('userLogin').addEventListener('submit', async event => {
    event.preventDefault(); if (loading) return;
    const key = $('userKey').value, username = $('userName').value.trim();
    if (key.trim() !== key || key.length < 32) { setMessage('userMessage', '请输入已部署的管理员密钥（至少 32 个字符，不能含首尾空格）。', true); return; }
    if (!key || !username) return;
    setBusy(true); setMessage('userMessage', '正在验证后台登录…');
    try { await auth.login(key, username); $('userKey').value = ''; showWorkspace(); await loadList(1); }
    catch (error) { $('userKey').value = ''; setMessage('userMessage', describe(error), true); }
    finally { setBusy(false); }
  });
  $('userLogout').addEventListener('click', async () => { try { await auth.logout(); } finally { resetWorkspace(); setMessage('userMessage', '后台会话已退出，请重新登录。'); } });
  window.addEventListener('admin-logout', () => { resetWorkspace(); setMessage('userMessage', '后台会话已退出，请重新登录。'); });
  restoreSession();
})();
