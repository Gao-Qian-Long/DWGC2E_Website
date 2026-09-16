(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const base = (window.DWGC2E_SITE || {}).apiBaseUrl || '/api';
  const number = n => new Intl.NumberFormat('zh-CN').format(Number(n) || 0);
  const date = value => value ? new Date(value).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }) : '未设置';
  const node = (tag, text, className) => { const el = document.createElement(tag); el.textContent = text; if (className) el.className = className; return el; };
  let key = '', epoch = 0, listRun = 0, detailRun = 0, page = 1, total = 0;
  let listBusy = false, detailBusy = false, saving = false, current = null, selectedId = null, attempt = null;
  const controllers = new Set();
  const tell = (selector, text, error = false) => { $(selector).textContent = text; $(selector).className = 'form-message' + (error ? ' error' : ''); };
  const describe = error => error.name === 'AbortError' ? '请求超时或已中断，请重试。保存请求可能已提交，请重新读取数据核对结果。' : error instanceof TypeError ? '网络连接失败，请检查网络后重试；已输入的内容保留。' : error.message;
  function controls() {
    $('#userLogin button').disabled = listBusy;
    $('#userRefresh').disabled = listBusy;
    $('#userFilters button').disabled = listBusy;
    $('#userPrev').disabled = listBusy || page <= 1;
    $('#userNext').disabled = listBusy || page * 25 >= total;
    $('#saveMembership').disabled = saving || detailBusy || !current;
    $('#detailReload').disabled = saving || detailBusy;
    for (const id of ['editPlan', 'editReason']) $('#' + id).disabled = saving || detailBusy;
    $('#editExpiry').disabled = saving || detailBusy || $('#editPlan').value !== 'pro';
    // Logout and close always remain available, including during a slow request.
  }
  function clear() {
    epoch++; listRun++; detailRun++;
    for (const controller of controllers) controller.abort(); controllers.clear();
    key = ''; current = null; selectedId = null; attempt = null; page = 1; total = 0;
    listBusy = false; detailBusy = false; saving = false;
    $('#userKey').value = ''; $('#userSearch').value = ''; $('#memberFilter').value = 'all';
    $('#membershipForm').reset(); $('#userGate').hidden = false; $('#userWorkspace').hidden = true;
    $('#detailContent').hidden = true; $('#userDetail').close(); $('#detailTitle').textContent = '用户详情';
    for (const id of ['userList','userIdentity','detailFacts','usageHistory','changeHistory']) $('#' + id).replaceChildren();
    for (const id of ['asOf','resultCount','userPage','detailMessage']) $('#' + id).textContent = '';
    for (const id of ['metricTotal','metricMembers','metricUsed','metricTasks']) $('#' + id).textContent = '—';
    controls();
  }
  async function request(path, options = {}) {
    const controller = new AbortController(), generation = epoch;
    controllers.add(controller); const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(base + path, { ...options, cache: 'no-store', signal: controller.signal, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key } });
      let data; try { data = await response.json(); } catch { throw Error('服务返回格式不完整，请重试。'); }
      if (generation !== epoch) throw Error('stale');
      if (response.status === 401) { clear(); tell('#userMessage', '管理员验证失效，请重新输入密钥。', true); throw Error('stale'); }
      if (!response.ok) { const error = Error(data.message || '请求失败，请重试。'); error.status = response.status; throw error; }
      return data;
    } finally { clearTimeout(timer); controllers.delete(controller); }
  }
  function badge(user) {
    return node('span', user.membership === 'active' ? '有效 Pro' : user.membership === 'expired' ? 'Pro 已到期' : '免费账户', 'member-badge ' + (['active','expired'].includes(user.membership) ? user.membership : 'free'));
  }
  function renderList(data) {
    if (!Array.isArray(data.items) || !data.summary || !Number.isFinite(data.total)) throw Error('返回数据不完整，请重试。');
    total = data.total; page = data.page;
    for (const [id, field] of [['metricTotal','total'],['metricMembers','members'],['metricUsed','used'],['metricTasks','tasks']]) $('#' + id).textContent = number(data.summary[field]);
    $('#resultCount').textContent = `${number(total)} 位用户 · ${data.month} UTC`;
    $('#asOf').textContent = '数据更新于 ' + date(data.asOf);
    $('#userPage').textContent = `第 ${page} / ${Math.max(1, Math.ceil(total / 25))} 页`;
    const list = $('#userList'); list.replaceChildren();
    if (!data.items.length) list.append(node('p', '没有符合条件的用户。', 'portal-empty'));
    for (const user of data.items) {
      const row = node('article', '', 'user-row'), identity = node('div', '', 'row-identity');
      identity.append(node('strong', user.display_name || user.account), node('p', user.account + ' · ' + (user.email || '未填写邮箱')), node('small', user.id));
      const membership = node('div', '', 'row-membership');
      membership.append(badge(user), node('p', user.plan_name === 'pro' ? user.expires_at ? '到期 ' + date(user.expires_at) : '历史账户 · 未设置到期时间' : '免费账户'));
      const usage = node('div', '', 'row-usage');
      usage.append(node('strong', `${number(user.used)} / ${number(user.monthly_quota)}`), node('p', `本月字符 · ${number(user.task_count)} 个任务`));
      const meter = node('div', '', 'usage-meter'), fill = node('span', '');
      fill.style.width = Math.min(100, Math.max(0, 100 * user.used / user.monthly_quota)) + '%'; meter.append(fill); usage.append(meter);
      const button = node('button', '查看详情', 'btn btn-ghost'); button.type = 'button'; button.onclick = () => openDetail(user.id);
      row.append(identity, membership, usage, button); list.append(row);
    }
  }
  async function load(targetPage = page) {
    if (listBusy || !key) return;
    const generation = epoch, run = ++listRun; listBusy = true; controls();
    tell('#userMessage', '正在读取用户数据…'); $('#userList').setAttribute('aria-busy', 'true');
    try {
      const query = new URLSearchParams({ q: $('#userSearch').value.trim(), status: $('#memberFilter').value, page: String(targetPage) });
      const data = await request('/v1/admin/users?' + query);
      if (generation !== epoch || run !== listRun) return;
      renderList(data); $('#userGate').hidden = true; $('#userWorkspace').hidden = false; tell('#userMessage', '');
    } catch (error) { if (generation === epoch && run === listRun) tell('#userMessage', describe(error) + ' 现有数据未更新。', true); }
    finally { if (generation === epoch && run === listRun) { listBusy = false; $('#userList').removeAttribute('aria-busy'); controls(); } }
  }
  const localValue = value => {
    if (!value) return '';
    const d = new Date(value), pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };
  function renderDetail(data) {
    if (!data.user || !Array.isArray(data.usage) || !Array.isArray(data.history)) throw Error('用户详情不完整，请重试。');
    const user = data.user; current = data;
    $('#detailTitle').textContent = user.display_name || user.account;
    $('#userIdentity').replaceChildren(node('strong', user.account), node('p', user.email || '未填写邮箱'), node('p', '用户编号 ' + user.id), node('p', '注册于 ' + date(user.created_at)));
    $('#detailFacts').replaceChildren();
    for (const [label, value] of [['会员状态',user.membership === 'active' ? '有效 Pro' : user.membership === 'expired' ? '已到期 Pro' : '免费账户'],['本月已用',number(user.used) + ' / ' + number(user.monthly_quota) + ' 字符'],['本月任务',number(user.task_count) + ' 个'],['会员到期',date(user.expires_at)]]) {
      const fact = node('div', ''); fact.append(node('small', label), node('strong', value)); $('#detailFacts').append(fact);
    }
    $('#editPlan').value = user.plan_name === 'pro' ? 'pro' : 'free'; $('#editExpiry').value = localValue(user.expires_at); $('#editReason').value = '';
    $('#localTimezone').textContent = Intl.DateTimeFormat().resolvedOptions().timeZone;
    $('#usageHistory').replaceChildren();
    for (const usage of data.usage) { const item = node('div', '', 'history-item'); item.append(node('strong', usage.year_month + ' · UTC'), node('p', `${number(usage.chars_used)} 字符 · ${number(usage.task_count)} 个任务`)); $('#usageHistory').append(item); }
    if (!data.usage.length) $('#usageHistory').append(node('p', '暂无用量记录。', 'field-hint'));
    $('#changeHistory').replaceChildren();
    for (const change of data.history) {
      let before = null; try { before = JSON.parse(change.before_snapshot); } catch { /* display an explicit unknown historical value */ }
      const old = before ? `${before[0]} · ${date(before[2])}` : '无会员记录';
      const after = change.plan_name === 'pro' ? 'Pro · ' + date(change.expires_at) : '免费账户';
      const item = node('div', '', 'history-item');
      item.append(node('strong', date(change.created_at)), node('p', old + ' → ' + after), node('p', '原因：' + change.reason), node('p', '管理员指纹 ' + change.actor + ' · 记录 ' + change.id)); $('#changeHistory').append(item);
    }
    if (!data.history.length) $('#changeHistory').append(node('p', '暂无人工调整记录。付款续费不在此列表中。', 'field-hint'));
    $('#detailContent').hidden = false;
  }
  async function openDetail(id, saved = false) {
    const generation = epoch, run = ++detailRun; selectedId = id;
    const same = current?.user.id === id;
    if (!same) { current = null; attempt = null; $('#detailContent').hidden = true; $('#detailTitle').textContent = '用户详情'; }
    if (!$('#userDetail').open) $('#userDetail').showModal();
    detailBusy = true; controls(); tell('#detailMessage', '正在读取用户详情…');
    try {
      const data = await request('/v1/admin/users/' + encodeURIComponent(id));
      if (generation !== epoch || run !== detailRun) return;
      renderDetail(data); attempt = null;
      tell('#detailMessage', saved ? '会员修改已保存，以下为重新读取的生效数据。' : '');
    } catch (error) { if (generation === epoch && run === detailRun) tell('#detailMessage', (saved ? '修改已保存，但详情刷新失败。' : '') + describe(error), true); }
    finally { if (generation === epoch && run === detailRun) { detailBusy = false; controls(); } }
  }
  $('#userLogin').onsubmit = event => {
    event.preventDefault(); if (listBusy) return;
    const candidate = $('#userKey').value;
    if (candidate.trim() !== candidate || candidate.length < 32) { tell('#userMessage', '请输入已部署的管理员密钥（至少 32 个字符，不能含首尾空格）。', true); return; }
    epoch++; key = candidate; $('#userKey').value = ''; load(1);
  };
  $('#userFilters').onsubmit = event => { event.preventDefault(); load(1); };
  $('#memberFilter').onchange = () => load(1);
  $('#userRefresh').onclick = () => load();
  $('#userLogout').onclick = () => { clear(); tell('#userMessage', '已退出管理，当前页面中的密钥和用户数据已清除。'); $('#userKey').focus(); };
  $('#userPrev').onclick = () => load(page - 1); $('#userNext').onclick = () => load(page + 1);
  $('#detailClose').onclick = () => $('#userDetail').close();
  $('#userDetail').addEventListener('close', () => { detailRun++; detailBusy = false; current = null; selectedId = null; attempt = null; $('#detailContent').hidden = true; controls(); });
  $('#detailReload').onclick = () => { if (selectedId && (!$('#editReason').value.trim() || confirm('重新加载会清除尚未保存的输入，是否继续？'))) openDetail(selectedId); };
  $('#editPlan').onchange = controls;
  $('#membershipForm').onsubmit = async event => {
    event.preventDefault(); if (saving || detailBusy || !current) return;
    const user = current.user, generation = epoch, run = detailRun;
    const plan = $('#editPlan').value, reason = $('#editReason').value.trim(), raw = $('#editExpiry').value;
    if (reason.length < 5) { tell('#detailMessage', '请填写至少 5 个字的修改原因。', true); return; }
    if (plan !== 'free' && (!raw || !Number.isFinite(new Date(raw).getTime()))) { tell('#detailMessage', '请填写有效的会员到期时间。', true); $('#editExpiry').focus(); return; }
    const expiry = ['pro', 'max'].includes(plan) ? new Date(raw).toISOString() : null;
    const changes = { plan_name: plan, expires_at: expiry, reason, version: user.version };
    const signature = JSON.stringify(changes);
    if (!attempt || attempt.signature !== signature) attempt = { signature, body: { ...changes, request_id: crypto.randomUUID() } };
    const warning = plan === 'free' || (expiry && Date.parse(expiry) <= Date.now()) ? '\n注意：此操作将立即关闭有效会员权益。' : user.expires_at && Date.parse(expiry) < Date.parse(user.expires_at) ? '\n注意：此操作将缩短现有会员期限。' : '';
    if (!confirm(`确认修改用户 ${user.account}（${user.email || user.id}）？\n原状态：${user.plan_name}，到期 ${date(user.expires_at)}\n新状态：${plan === 'pro' ? 'Pro，到期 ' + date(expiry) : '免费账户'}${warning}\n原因：${reason}\n已用字符和支付记录保持不变。`)) return;
    saving = true; controls(); tell('#detailMessage', '正在保存，请勿重复提交…');
    try {
      await request('/v1/admin/users/' + encodeURIComponent(user.id) + '/membership', { method: 'POST', body: JSON.stringify(attempt.body) });
      if (generation !== epoch) return;
      tell('#userMessage', '用户 ' + user.account + ' 的会员修改已保存。');
      if (run === detailRun && $('#userDetail').open) await openDetail(user.id, true);
      await load();
    } catch (error) {
      if (generation === epoch && run === detailRun) tell('#detailMessage', describe(error), true);
      else if (generation === epoch) tell('#userMessage', '会员保存请求未能确认结果，请重新打开用户详情核对。', true);
    } finally { if (generation === epoch) { saving = false; controls(); } }
  };
  window.addEventListener('pagehide', () => { clear(); tell('#userMessage', ''); });
  controls();
})();
