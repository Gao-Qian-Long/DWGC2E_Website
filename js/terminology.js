(async () => {
  'use strict';
  let profile;
  try { profile = await window.DWGC2E_API.account.profile(); }
  catch { location.replace('account.html?return=terminology.html'); return; }
  if (!profile.user_id) { location.replace('account.html?return=terminology.html'); return; }
  const key = 'dwgc2e.glossary.' + profile.user_id;
  const $ = selector => document.querySelector(selector);
  const list = $('#glossaryList'), search = $('#glossarySearch'), form = $('#glossaryForm'), msg = $('#glossaryMessage'), selectAll = $('#selectAll');
  if (!list || !search || !form || !msg || !selectAll) return;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const read = () => { try { const value = JSON.parse(localStorage.getItem(key) || 'null'); return Array.isArray(value) ? value : []; } catch { return []; } };
  const say = (text, error = false) => { msg.textContent = text || ''; msg.className = `form-message${error ? ' error' : ''}`; };
  let rows = read(), editingId = '', pending = null, syncing = false;
  const recovery = document.createElement('div');
  recovery.hidden = true;
  recovery.innerHTML = '<button type="button" id="retryGlossary" class="btn btn-primary btn-sm">重试保存</button> <button type="button" id="exportPendingGlossary" class="btn btn-ghost btn-sm">导出待保存备份</button> <button type="button" id="discardPendingGlossary" class="btn btn-ghost btn-sm">放弃本次未保存修改</button>';
  msg.after(recovery);
  const mutationControls = () => [...form.querySelectorAll('input, textarea, button'), ...document.querySelectorAll('[data-edit], [data-delete], #deleteSelected, #importGlossary, #syncGlossary')];
  const updateRecovery = () => {
    recovery.hidden = !pending;
    mutationControls().forEach(control => { control.disabled = !!pending || (control.id === 'syncGlossary' && syncing); });
  };
  const syncSelection = () => {
    const checks = [...list.querySelectorAll('[data-check]')];
    const count = checks.filter(input => input.checked).length;
    selectAll.checked = checks.length > 0 && count === checks.length;
    selectAll.indeterminate = count > 0 && count < checks.length;
  };
  const visibleRows = () => { const query = search.value.trim().toLowerCase(); return rows.filter(row => [row.source, row.target, row.note].join(' ').toLowerCase().includes(query)); };
  const render = () => {
    const shown = visibleRows();
    list.innerHTML = shown.length ? shown.map(row => `<tr><td><input type="checkbox" data-check="${esc(row.id)}" aria-label="选择 ${esc(row.source)}"></td><td>${esc(row.source)}</td><td>${esc(row.target)}</td><td>${esc(row.note || '—')}</td><td><button type="button" class="btn btn-ghost btn-sm" data-edit="${esc(row.id)}">编辑</button> <button type="button" class="btn btn-ghost btn-sm" data-delete="${esc(row.id)}">删除</button></td></tr>`).join('') : '<tr><td colspan="5" class="table-empty">暂无匹配词条。</td></tr>';
    $('#glossaryCount').textContent = `显示 ${shown.length} / 共 ${rows.length} 条`;
    syncSelection();
    updateRecovery();
  };
  const resetForm = () => { editingId = ''; form.reset(); $('#saveGlossary').textContent = '添加词条'; $('#cancelGlossary').hidden = true; };
  // A transaction owns its candidate until saved or explicitly discarded. Never mutate
  // the displayed/persisted rows, or clear the user's input, before storage succeeds.
  const commit = transaction => {
    try { localStorage.setItem(key, JSON.stringify(transaction.rows)); }
    catch {
      pending = transaction;
      updateRecovery();
      $('#retryGlossary').focus();
      say('未保存：浏览器存储不可用或空间不足。请重试或导出备份；刷新或离开会丢失本次未保存修改。', true);
      return false;
    }
    rows = transaction.rows;
    pending = null;
    if (transaction.resetForm) resetForm();
    render();
    say(transaction.message);
    return true;
  };
  const exportRows = (data, filename) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    say(pending ? '已生成待保存备份。本机仍未保存，请完成下载并保留文件。' : '词汇表已导出。', !!pending);
  };
  $('#retryGlossary').onclick = () => { if (pending) commit(pending); };
  $('#exportPendingGlossary').onclick = () => { if (pending) exportRows(pending.rows, 'dwgc2e-glossary-unsaved.json'); };
  $('#discardPendingGlossary').onclick = () => {
    if (!pending || !confirm('放弃本次未保存修改？本机已保存的词库不会改变。')) return;
    pending = null; updateRecovery(); say('已放弃待保存操作；表单输入仍保留，可继续编辑。');
  };
  window.addEventListener('beforeunload', event => { if (pending) { event.preventDefault(); event.returnValue = ''; } });
  form.addEventListener('submit', event => {
    event.preventDefault(); if (pending) return;
    const data = Object.fromEntries(new FormData(form));
    const source = String(data.source || '').trim(), target = String(data.target || '').trim(), note = String(data.note || '').trim();
    if (!source || !target) return say('请填写原文和译文。', true);
    if (rows.some(row => row.source.toLowerCase() === source.toLowerCase() && row.id !== editingId)) return say('原文术语已存在，请直接编辑已有词条。', true);
    const candidate = editingId ? rows.map(row => row.id === editingId ? {...row, source, target, note} : row) : [{id:`local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, source, target, note}, ...rows];
    commit({rows:candidate, resetForm:true, message:editingId ? '词条已更新并保存到本机。' : '词条已保存到本机。'});
  });
  $('#cancelGlossary').onclick = () => { if (!pending) { resetForm(); render(); say('已取消编辑。'); } };
  list.addEventListener('click', event => {
    if (pending) return;
    const edit = event.target.closest('[data-edit]');
    if (edit) {
      const row = rows.find(item => item.id === edit.dataset.edit);
      if (row) { editingId = row.id; form.elements.source.value = row.source; form.elements.target.value = row.target; form.elements.note.value = row.note || ''; $('#saveGlossary').textContent = '保存修改'; $('#cancelGlossary').hidden = false; form.elements.source.focus(); say('正在编辑词条。'); }
      return;
    }
    const remove = event.target.closest('[data-delete]');
    if (!remove || !confirm('确定删除这条词汇吗？')) return;
    commit({rows:rows.filter(row => row.id !== remove.dataset.delete), resetForm:editingId === remove.dataset.delete, message:'词条已删除。'});
  });
  search.addEventListener('input', render);
  list.addEventListener('change', event => { if (event.target.matches('[data-check]')) syncSelection(); });
  selectAll.addEventListener('change', () => { list.querySelectorAll('[data-check]').forEach(input => { input.checked = selectAll.checked; }); syncSelection(); });
  $('#deleteSelected').onclick = () => {
    if (pending) return;
    const ids = [...list.querySelectorAll('[data-check]:checked')].map(input => input.dataset.check);
    if (!ids.length) return say('请先选择要删除的词条。', true);
    if (!confirm(`确定删除选中的 ${ids.length} 条词汇吗？`)) return;
    commit({rows:rows.filter(row => !ids.includes(row.id)), resetForm:ids.includes(editingId), message:`已删除 ${ids.length} 条词汇。`});
  };
  $('#exportGlossary').onclick = () => exportRows(pending?.rows || rows, pending ? 'dwgc2e-glossary-unsaved.json' : 'dwgc2e-glossary.json');
  $('#importGlossary').addEventListener('change', event => {
    const input = event.target, file = input.files?.[0]; if (!file || pending) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        if (pending) { say('请先处理当前未保存修改，再重新选择导入文件。', true); return; }
        const raw = String(reader.result || ''), data = file.name.toLowerCase().endsWith('.csv') ? parseCsv(raw) : JSON.parse(raw);
        if (!Array.isArray(data)) throw Error();
        const imported = data.filter(item => item && item.source && item.target).map(item => ({id:`local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, source:String(item.source).trim(), target:String(item.target).trim(), note:String(item.note || '').trim()}));
        const existing = new Set(rows.map(row => row.source.toLowerCase()));
        const fresh = imported.filter(item => !existing.has(item.source.toLowerCase()));
        commit({rows:[...fresh, ...rows], message:`已导入 ${fresh.length} 条新词汇，重复项已跳过。`});
      } catch { say('导入失败，请选择有效的 JSON 或 CSV 词汇表。', true); }
      finally { input.value = ''; }
    };
    reader.onerror = () => { input.value = ''; say('文件读取失败，请重新选择文件。', true); };
    reader.readAsText(file);
  });
  function parseCsv(raw) {
    const lines = raw.split(/\r?\n/).filter(line => line.trim()); if (!lines.length) return [];
    const cells = line => { const result = [], regex = /("(?:[^"]|"")*"|[^,]*)/g; let match; while ((match = regex.exec(line)) && match[0] !== '') { let value = match[1] || ''; if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1).replace(/""/g, '"'); result.push(value.trim()); if (line[regex.lastIndex] === ',') regex.lastIndex++; else break; } return result; };
    const header = cells(lines.shift()).map(value => value.toLowerCase());
    return lines.map(line => { const values = cells(line); return {source:values[header.indexOf('source')] || values[0], target:values[header.indexOf('target')] || values[1], note:values[header.indexOf('note')] || values[2] || ''}; });
  }
  $('#syncGlossary').addEventListener('click', async () => {
    if (pending || syncing) return;
    syncing = true;
    const button = $('#syncGlossary'); button.disabled = true; say('正在读取云端词库…');
    try {
      const data = await window.DWGC2E_API.terminology.list();
      if (pending) { say('请先处理当前未保存修改，再重新读取云端词库。', true); return; }
      const cloud = Array.isArray(data) ? data : (data?.items || data?.terminology || data?.glossaries || []);
      if (!Array.isArray(cloud)) throw Error('云端返回格式无效');
      const existing = new Set(rows.map(row => `${row.source.toLowerCase()}\u0000${row.target.toLowerCase()}`));
      const additions = cloud.filter(item => item?.source && item?.target && !existing.has(`${String(item.source).toLowerCase()}\u0000${String(item.target).toLowerCase()}`)).map(item => ({id:String(item.id || `cloud-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`), source:String(item.source), target:String(item.target), note:String(item.note || '')}));
      commit({rows:[...additions, ...rows], message:`云端已连接，新增合并 ${additions.length} 条词汇。`});
    } catch (error) { say(error.status === 404 ? '云端词库接口暂未开放，当前词条仍保存在本机。' : (error.message || '云端同步失败。'), true); }
    finally { syncing = false; button.disabled = !!pending; }
  });
  render();
})();
