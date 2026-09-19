/* AI routing operations module. Secrets are deliberately kept out of storage, URLs and logs. */
(() => {
  'use strict';
  const auth = window.DWGC2E_ADMIN_AUTH;
  const base = (window.DWGC2E_SITE || {}).apiBaseUrl || '/api';
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
  const text = (tag, value, className) => { const element = document.createElement(tag); element.textContent = value == null ? '' : String(value); if (className) element.className = className; return element; };
  const setMessage = (id, message = '', error = false) => { const element = $(id); element.textContent = message; element.className = 'form-message' + (error ? ' error' : ''); };
  const describe = error => error?.name === 'AbortError' ? '请求超时，请重试。若保存请求可能已经提交，请先刷新核对当前配置。' : error instanceof TypeError ? '网络连接失败，请检查网络后重试。' : error?.message || '后台操作失败，请重试。';
  const safeJson = value => { try { return JSON.parse(value); } catch { return null; } };

  let providers = [], policy = null, history = { profiles: [], changes: [] }, editingId = null, loading = false, revision = 0;
  let reasonResolver = null;

  function clearSensitiveFields() { $('providerApiKey').value = ''; $('providerSecretName').value = ''; }
  function setBusy(value) {
    loading = value;
    ['providerRefresh','providerNew','policyRefresh','historyRefresh','providerSave','policyPublish'].forEach(id => { if ($(id)) $(id).disabled = value; });
    $('userLogout').disabled = false;
  }
  function showWorkspace() { $('adminChecking').hidden = true; $('userGate').hidden = true; $('userWorkspace').hidden = false; $('userLogout').hidden = false; }
  function hideWorkspace(message = '') { $('userWorkspace').hidden = true; $('userGate').hidden = false; $('userLogout').hidden = true; clearSensitiveFields(); if (message) setMessage('userMessage', message); }

  function providerHealth(provider) {
    const health = provider.health || {};
    if (!provider.enabled) return ['已停用', 'disabled'];
    if (!provider.has_credential) return ['缺少凭据', 'warning'];
    if (health.cooldown_until && new Date(health.cooldown_until).getTime() > Date.now()) return ['冷却中', 'warning'];
    if (Number(health.consecutive_failures || 0) > 0) return [`有失败 ${health.consecutive_failures} 次`, 'warning'];
    return ['可用', 'active'];
  }
  function renderProviders() {
    const root = $('providerList'); root.replaceChildren();
    if (!providers.length) { root.append(text('p', '还没有配置模型服务。请新增一个 Provider 后再发布服务端策略。', 'portal-empty')); return; }
    const header = document.createElement('div'); header.className = 'ai-provider-header';
    ['模型服务','路由','健康状态','最近指标','操作'].forEach(label => header.append(text('span', label)));
    root.append(header);
    for (const provider of providers) {
      const row = document.createElement('article'); row.className = 'ai-provider-row'; row.dataset.providerId = provider.id;
      const identity = document.createElement('div'); identity.className = 'ai-provider-identity';
      identity.append(text('strong', provider.name));
      identity.append(text('small', `${provider.model} · ${provider.base_url}`, 'ai-provider-endpoint'));
      identity.append(text('small', provider.has_credential ? `凭据：${provider.credential_source === 'worker_secret' ? 'Worker Secret' : '加密存储'}` : '凭据：未配置', 'ai-provider-meta'));
      row.append(identity);
      const routing = document.createElement('div'); routing.className = 'ai-provider-routing';
      routing.append(text('span', `优先级 ${provider.priority}`)); routing.append(text('span', `权重 ${provider.weight}`)); routing.append(text('span', `超时 ${number(provider.timeout_ms)} ms`));
      row.append(routing);
      const status = providerHealth(provider); const health = document.createElement('div'); health.className = 'ai-provider-health'; health.append(text('span', status[0], `ai-health-badge ${status[1]}`)); health.append(text('small', `连续失败：${provider.health?.consecutive_failures || 0}`)); if (provider.health?.last_error_code) health.append(text('small', `错误：${provider.health.last_error_code}`)); row.append(health);
      const metrics = document.createElement('div'); metrics.className = 'ai-provider-metrics'; metrics.append(text('small', `成功：${date(provider.health?.last_success_at)}`)); metrics.append(text('small', `延迟：${provider.health?.last_latency_ms == null ? '未记录' : `${provider.health.last_latency_ms} ms`}`)); metrics.append(text('small', `版本：${provider.revision}`)); row.append(metrics);
      const actions = document.createElement('div'); actions.className = 'ai-provider-actions';
      const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'btn btn-ghost'; edit.textContent = '编辑'; edit.onclick = () => openEditor(provider); actions.append(edit);
      const test = document.createElement('button'); test.type = 'button'; test.className = 'btn btn-ghost'; test.textContent = '测试'; test.disabled = !provider.enabled || !provider.has_credential; test.onclick = () => testProvider(provider); actions.append(test);
      const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'btn btn-ghost'; toggle.textContent = provider.enabled ? '停用' : '启用'; toggle.onclick = () => toggleProvider(provider); actions.append(toggle);
      row.append(actions); root.append(row);
    }
  }
  function formValue(id) { return $(id).value.trim(); }
  function populateEditor(provider = null) {
    editingId = provider?.id || null; $('providerEditor').hidden = false; $('providerEditorTitle').textContent = provider ? `编辑模型服务 · ${provider.name}` : '新增模型服务'; setMessage('providerEditorMessage');
    $('providerName').value = provider?.name || ''; $('providerBaseUrl').value = provider?.base_url || ''; $('providerModel').value = provider?.model || ''; $('providerEnabled').checked = provider ? !!provider.enabled : true;
    $('providerPriority').value = provider?.priority ?? 100; $('providerWeight').value = provider?.weight ?? 100; $('providerTimeout').value = provider?.timeout_ms ?? 90000; $('providerFailures').value = provider?.max_failures ?? 3; $('providerCooldown').value = provider?.cooldown_seconds ?? 60; $('providerTemperature').value = provider?.temperature ?? 0.1;
    $('providerReason').value = ''; $('providerClearCredential').checked = false; clearSensitiveFields();
    $('credentialState').textContent = provider ? (provider.has_credential ? `当前已有凭据（${provider.credential_source === 'worker_secret' ? 'Worker Secret' : '加密存储'}）。如不填写新凭据，将保留当前凭据。` : '当前没有凭据，请配置 API Key 或 Worker Secret 名称。') : '新增 Provider 需要配置 API Key 或 Worker Secret 名称，两者只能选择一个。';
    $('providerName').focus();
  }
  function closeEditor() { editingId = null; $('providerEditor').hidden = true; clearSensitiveFields(); }
  function buildProviderPayload() {
    const payload = { name: formValue('providerName'), base_url: formValue('providerBaseUrl'), model: formValue('providerModel'), enabled: $('providerEnabled').checked, priority: Number($('providerPriority').value), weight: Number($('providerWeight').value), timeout_ms: Number($('providerTimeout').value), max_failures: Number($('providerFailures').value), cooldown_seconds: Number($('providerCooldown').value), temperature: Number($('providerTemperature').value), reason: formValue('providerReason') };
    const apiKey = $('providerApiKey').value; const secretName = formValue('providerSecretName');
    if (apiKey) payload.api_key = apiKey; if (secretName) payload.secret_name = secretName; if ($('providerClearCredential').checked) payload.clear_credential = true;
    if (editingId) payload.revision = providers.find(item => item.id === editingId)?.revision;
    return payload;
  }
  async function saveProvider(event) {
    event.preventDefault(); if (loading) return; const form = $('providerForm'); if (!form.checkValidity()) { form.reportValidity(); return; }
    const payload = buildProviderPayload(); if (payload.api_key && payload.secret_name || payload.api_key && payload.clear_credential || payload.secret_name && payload.clear_credential) { setMessage('providerEditorMessage', 'API Key、Worker Secret 和清除凭据只能选择一个。', true); return; }
    setBusy(true); setMessage('providerEditorMessage', '正在保存模型服务…');
    try { const result = await api(editingId ? `/v1/admin/ai/providers/${encodeURIComponent(editingId)}` : '/v1/admin/ai/providers', { method: editingId ? 'PUT' : 'POST', body: JSON.stringify(payload) }); clearSensitiveFields(); setMessage('providerEditorMessage', '保存成功，密钥输入已清除。'); await loadAll(); closeEditor(); setMessage('providerMessage', `已保存模型服务“${result.name || payload.name}”。`); }
    catch (error) { clearSensitiveFields(); setMessage('providerEditorMessage', describe(error), true); }
    finally { setBusy(false); }
  }
  async function testProvider(provider) {
    if (loading) return; setBusy(true); setMessage('providerMessage', `正在测试“${provider.name}”，请稍候…`);
    try { const result = await api(`/v1/admin/ai/providers/${encodeURIComponent(provider.id)}/test`, { method: 'POST', body: '{}' }); setMessage('providerMessage', `“${provider.name}”连接成功，延迟 ${result.latency_ms ?? '—'} ms，服务端上下文 ${result.context_version || '未返回'}。`); await loadProviders(); }
    catch (error) { setMessage('providerMessage', describe(error), true); }
    finally { setBusy(false); }
  }
  function askReason(title, description) {
    return new Promise(resolve => { reasonResolver = resolve; $('reasonTitle').textContent = title; $('reasonDescription').textContent = description; $('reasonInput').value = ''; $('reasonDialog').showModal(); $('reasonInput').focus(); });
  }
  $('reasonForm').addEventListener('submit', event => { event.preventDefault(); const confirmed = event.submitter?.value === 'confirm' && $('reasonForm').checkValidity(); const value = confirmed ? $('reasonInput').value.trim() : ''; $('reasonDialog').close(); reasonResolver?.(value); reasonResolver = null; });
  async function toggleProvider(provider) {
    const reason = await askReason(provider.enabled ? '停用模型服务' : '启用模型服务', `将${provider.enabled ? '停用' : '启用'}“${provider.name}”。请填写原因。`); if (!reason || loading) return;
    setBusy(true); setMessage('providerMessage', '正在保存状态…');
    try { await api(`/v1/admin/ai/providers/${encodeURIComponent(provider.id)}`, { method: 'PUT', body: JSON.stringify({ name: provider.name, base_url: provider.base_url, model: provider.model, enabled: !provider.enabled, weight: provider.weight, priority: provider.priority, timeout_ms: provider.timeout_ms, max_failures: provider.max_failures, cooldown_seconds: provider.cooldown_seconds, temperature: provider.temperature, revision: provider.revision, reason }) }); await loadProviders(); setMessage('providerMessage', 'Provider 状态已更新。'); }
    catch (error) { setMessage('providerMessage', describe(error), true); }
    finally { setBusy(false); }
  }
  async function loadProviders() { const data = await api('/v1/admin/ai/providers'); providers = Array.isArray(data.items) ? data.items : []; renderProviders(); $('metricProviders').textContent = number(providers.length); $('metricHealthy').textContent = number(providers.filter(item => item.enabled && item.has_credential && providerHealth(item)[1] !== 'warning').length); }
  function renderPolicy() {
    const current = $('currentPolicy'); current.replaceChildren(); if (!policy?.policy) { current.append(text('p', '当前尚未发布服务端策略。', 'portal-empty')); return; }
    const grid = document.createElement('div'); grid.className = 'ai-policy-facts'; [['版本', policy.policy.version], ['名称', policy.policy.name], ['发布时间', date(policy.policy.created_at)], ['状态', policy.profile?.active ? '当前生效' : '历史版本']].forEach(([label, value]) => { const item = document.createElement('div'); item.append(text('small', label)); item.append(text('strong', value)); grid.append(item); }); current.append(grid);
    $('metricContext').textContent = policy.policy.version || '—'; $('metricUpdated').textContent = date(policy.policy.created_at);
  }
  function renderHistory() {
    const profilesRoot = $('profileHistory'); profilesRoot.replaceChildren(); if (!history.profiles?.length) profilesRoot.append(text('p', '暂无策略历史。', 'portal-empty')); else for (const profile of history.profiles) { const row = document.createElement('article'); row.className = 'ai-history-item'; const info = document.createElement('div'); info.append(text('strong', profile.name || profile.context_version)); info.append(text('small', `${profile.context_version} · ${date(profile.updated_at || profile.created_at)}`)); if (profile.active) info.append(text('span', '当前生效', 'ai-health-badge active')); row.append(info); const button = document.createElement('button'); button.type = 'button'; button.className = 'btn btn-ghost'; button.textContent = profile.active ? '当前版本' : '回滚到此版本'; button.disabled = !!profile.active; button.onclick = () => rollbackProfile(profile); row.append(button); profilesRoot.append(row); }
    const changes = $('changeHistory'); changes.replaceChildren(); if (!history.changes?.length) changes.append(text('p', '暂无操作记录。', 'portal-empty')); else for (const change of history.changes.slice(0, 50)) { const row = document.createElement('article'); row.className = 'ai-change-item'; row.append(text('strong', `${change.kind || '配置操作'} · ${change.target_id || '—'}`)); row.append(text('small', `${date(change.created_at)} · 操作人 ${change.actor || '—'}`)); row.append(text('p', change.reason || '未填写原因')); const after = safeJson(change.after_json); if (after?.context_version) row.append(text('small', `上下文版本：${after.context_version}`)); changes.append(row); }
  }
  async function loadPolicy() { policy = await api('/v1/admin/ai/policy'); renderPolicy(); const current = policy?.policy; if (current) { $('policyName').value = current.name || ''; $('policyVersion').value = current.version || ''; $('policyPrompt').value = current.system_prompt || ''; } }
  async function loadHistory() { history = await api('/v1/admin/ai/history'); renderHistory(); }
  async function loadAll() { if (loading) return; const generation = ++revision; setBusy(true); setMessage('userMessage', ''); setMessage('providerMessage', '正在读取 AI 配置…'); try { await Promise.all([loadProviders(), loadPolicy(), loadHistory()]); if (generation === revision) setMessage('providerMessage', ''); } catch (error) { if (generation === revision) setMessage('providerMessage', describe(error), true); } finally { setBusy(false); } }
  async function publishPolicy(event) {
    event.preventDefault(); const form = $('policyForm'); if (!form.checkValidity()) { form.reportValidity(); return; } if (loading) return; const active = policy?.profile?.id;
    setBusy(true); setMessage('policyMessage', '正在发布服务端策略…'); const payload = { name: formValue('policyName'), context_version: formValue('policyVersion'), system_prompt: $('policyPrompt').value, reason: formValue('policyReason') }; if (active) payload.expected_active_profile_id = active;
    try { await api('/v1/admin/ai/publish', { method: 'POST', body: JSON.stringify(payload) }); $('policyReason').value = ''; await loadAll(); setMessage('policyMessage', '服务端策略已发布，APP 将在下一次任务中使用新版本。'); }
    catch (error) { setMessage('policyMessage', describe(error), true); }
    finally { setBusy(false); }
  }
  async function rollbackProfile(profile) { const reason = await askReason('回滚服务端策略', `将恢复“${profile.name || profile.context_version}”。请填写原因。`); if (!reason || loading) return; setBusy(true); setMessage('historyMessage', '正在回滚策略…'); try { await api('/v1/admin/ai/rollback', { method: 'POST', body: JSON.stringify({ profile_id: profile.id, reason, expected_active_profile_id: policy?.profile?.id }) }); await loadAll(); setMessage('historyMessage', '策略已回滚。'); } catch (error) { setMessage('historyMessage', describe(error), true); } finally { setBusy(false); } }
  function resetWorkspace() { providers = []; policy = null; history = { profiles: [], changes: [] }; closeEditor(); clearSensitiveFields(); $('providerList').replaceChildren(); $('profileHistory').replaceChildren(); $('changeHistory').replaceChildren(); $('userWorkspace').hidden = true; $('userLogout').hidden = true; $('userGate').hidden = false; }
  async function restoreSession() { $('adminChecking').hidden = false; try { await auth.check(); showWorkspace(); await loadAll(); } catch (error) { hideWorkspace(error.status === 401 ? '请登录后台；有效会话内切换页面和刷新无需重输密钥。' : '暂时无法检查后台登录状态，请重试。'); } finally { $('adminChecking').hidden = true; } }

  $('userLogin').addEventListener('submit', async event => { event.preventDefault(); if (loading) return; const key = $('userKey').value; const username = $('userName').value.trim(); if (!key || !username) return; setBusy(true); setMessage('userMessage', '正在验证后台登录…'); try { await auth.login(key, username); $('userKey').value = ''; showWorkspace(); await loadAll(); } catch (error) { $('userKey').value = ''; setMessage('userMessage', describe(error), true); } finally { setBusy(false); } });
  $('userLogout').addEventListener('click', async () => { try { await auth.logout(); } finally { resetWorkspace(); setMessage('userMessage', '后台会话已退出，请重新登录。'); } });
  $('providerNew').addEventListener('click', () => populateEditor()); $('providerCancel').addEventListener('click', closeEditor); $('providerForm').addEventListener('submit', saveProvider); $('providerClearFields').addEventListener('click', clearSensitiveFields); $('providerRefresh').addEventListener('click', loadAll); $('policyRefresh').addEventListener('click', loadAll); $('historyRefresh').addEventListener('click', loadAll); $('policyForm').addEventListener('submit', publishPolicy); $('policyClear').addEventListener('click', () => { $('policyPrompt').value = ''; $('policyReason').value = ''; });
  window.addEventListener('admin-logout', () => { resetWorkspace(); setMessage('userMessage', '后台会话已退出，请重新登录。'); });
  window.addEventListener('beforeunload', () => clearSensitiveFields());
  restoreSession();
})();
