(async () => {
  'use strict';
  const auth=window.DWGC2E_AUTH||window.DWGC2E_CLOUD_SESSION; if(!auth.active())return;
  // Disable the form before awaiting identity; no native GET submission on load failure.
  document.querySelectorAll('#glossaryForm input, #glossaryForm button, #importGlossary, #deleteSelected, #syncGlossary').forEach(control=>{control.disabled=true;});
  let profile;
  try { profile = await window.DWGC2E_API.account.profile(); }
  catch(error) { auth.failure(error); auth.showError('术语库暂时无法读取，请重新加载。'); return; }
  if (!profile.user_id) { auth.showError('账户信息不完整，请重新加载。'); return; }
  if(!auth.active())return;auth.ready();
  const key = 'dwgc2e.glossary.' + profile.user_id;
  const $ = selector => document.querySelector(selector);
  const list = $('#glossaryList'), search = $('#glossarySearch'), form = $('#glossaryForm'), msg = $('#glossaryMessage'), selectAll = $('#selectAll');
  if (!list || !search || !form || !msg || !selectAll) return;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const read = () => { try { const value = JSON.parse(localStorage.getItem(key) || 'null'); return Array.isArray(value) ? value : []; } catch { return []; } };
  const say = (text, error = false) => { msg.textContent = text || ''; msg.className = `form-message${error ? ' error' : ''}`; };
  let localRows = read(), rows = [], revision = '', ready = false, editingId = '', pending = null, syncing = false;
  const localButton = document.createElement('button');
  localButton.type='button'; localButton.className='btn btn-ghost'; localButton.textContent='合并本机词条到云端'; localButton.hidden=!localRows.length;
  $('#syncGlossary').after(localButton);
  const recovery = document.createElement('div');
  recovery.hidden = true;
  recovery.innerHTML = '<button type="button" id="mergePendingGlossary" class="btn btn-primary btn-sm">对比最新云端并合并</button> <button type="button" id="retryGlossary" class="btn btn-primary btn-sm">重试保存</button> <button type="button" id="exportPendingGlossary" class="btn btn-ghost btn-sm">导出待保存备份</button> <button type="button" id="discardPendingGlossary" class="btn btn-ghost btn-sm">放弃本次未保存修改</button>';
  msg.after(recovery);
  const mutationControls = () => [...form.querySelectorAll('input, textarea, button'), ...document.querySelectorAll('[data-edit], [data-delete], #deleteSelected, #importGlossary, #syncGlossary')];
  const updateRecovery = () => {
    recovery.hidden = !pending;
    localButton.disabled=!!pending||syncing||!ready;
    $('#retryGlossary').disabled=syncing;
    $('#mergePendingGlossary').disabled=syncing;
    $('#discardPendingGlossary').disabled=syncing;
    mutationControls().forEach(control => { control.disabled = control.id === 'syncGlossary' ? syncing || !!pending : !!pending || syncing || !ready; });
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
  // Cloud is authoritative. Keep only the current revision and an unsaved draft;
  // failed/ambiguous writes must never be retried against a newer cloud revision.
  const commit = async transaction => {
    if (syncing || !ready || !auth.active()) return false;
    if(transaction.rows.length>1000){say('词库最多保存 1000 条；请减少新增词条后重试，未提交任何修改。',true);return false;}
    transaction.revision ??= revision;
    transaction.basis ??= rows.map(row=>({...row}));
    pending = transaction; syncing = true; updateRecovery();
    say('正在保存到云端…');
    try {
      const entries=transaction.rows.map(row=>{const copy={...row};if(!/^[a-f0-9-]{36}$/.test(copy.id||''))delete copy.id;return copy;});
      const saved=await window.DWGC2E_API.glossary.save(entries,transaction.revision);
      if(!Array.isArray(saved.entries)||typeof saved.revision!=='string')throw Error('云端保存结果无法确认，请读取最新词库核对。');
      if(!auth.active())return false;
      rows=saved.entries;revision=saved.revision;pending=null;
      if(transaction.migrateLocal){
        localRows=[];localButton.hidden=true;
        try{localStorage.removeItem(key);}catch{/* Cloud save succeeded; stale local copy is never auto-uploaded. */}
      }
      if(transaction.resetForm)resetForm();
      render();say('已保存到云端。'+(transaction.message||'')+'APP 下次读取云端词库即可获取最新内容。');return true;
    }catch(error){
      auth.failure(error);say(error.status===409?'未覆盖云端：词库已变化或词条冲突。可对比最新云端并选择合并；也可导出草稿或放弃本次修改。':(error.message||'云端保存失败，请重试或导出待保存内容。'),true);
      return false;
    }finally{syncing=false;updateRecovery();}
  };
  const exportRows = (data, filename) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    say(pending ? '已导出待保存内容，尚未确认云端保存。' : '当前云端词汇表已导出。', !!pending);
  };
  $('#mergePendingGlossary').onclick = async () => {
    if(syncing||!pending||!auth.active())return;
    const transaction=pending;syncing=true;updateRecovery();say('正在读取最新云端用于比较，尚未保存…');
    let merged=null, latest;
    try {
      latest=await window.DWGC2E_API.glossary.latest();
      if(!auth.active()||pending!==transaction)return;
      if(!Array.isArray(latest.entries)||typeof latest.revision!=='string')throw Error('云端内容无法确认，草稿未变。');
      const groups=window.DWGC2E_GLOSSARY_MERGE.plan(transaction.basis,transaction.rows,latest.entries);
      merged=await window.DWGC2E_GLOSSARY_MERGE_DIALOG(groups,()=>auth.active()&&pending===transaction);
      if(!auth.active()||pending!==transaction)return;
      if(!merged)say('已取消合并，原草稿仍保留。');
    }catch(error){auth.failure(error);say(error.message||'无法比较云端内容，原草稿仍保留。',true);}
    finally{syncing=false;updateRecovery();}
    if(merged&&auth.active()&&pending===transaction)await commit({...transaction,rows:merged,basis:latest.entries.map(row=>({...row})),revision:latest.revision});
  };

  $('#retryGlossary').onclick = () => { if (pending) commit(pending); };
  $('#exportPendingGlossary').onclick = () => { if (pending) exportRows(pending.rows, 'dwgc2e-glossary-unsaved.json'); };
  $('#discardPendingGlossary').onclick = async () => {
    if(syncing || !pending || !confirm('放弃本次待保存修改并读取云端最新词库？如需保留修改，请先导出。'))return;
    pending=null;resetForm();await loadCloud();
  };
  window.addEventListener('beforeunload',event=>{if(pending){event.preventDefault();event.returnValue='';}});
  form.addEventListener('submit', event => {
    event.preventDefault(); if (pending || syncing || !ready) return;
    const data = Object.fromEntries(new FormData(form));
    const source = String(data.source || '').trim(), target = String(data.target || '').trim(), note = String(data.note || '').trim();
    if (!source || !target) return say('请填写原文和译文。', true);
    if (rows.some(row => row.source.toLowerCase() === source.toLowerCase() && row.id !== editingId)) return say('原文术语已存在，请直接编辑已有词条。', true);
    const candidate = editingId ? rows.map(row => row.id === editingId ? {...row, source, target, note} : row) : [{id:`local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, source, target, note}, ...rows];
    commit({rows:candidate, resetForm:true, message:editingId ? '词条已更新。' : '词条已添加。'});
  });
  $('#cancelGlossary').onclick = () => { if (!pending) { resetForm(); render(); say('已取消编辑。'); } };
  list.addEventListener('click', event => {
    if (pending || syncing || !ready) return;
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
    if (pending || syncing || !ready) return;
    const ids = [...list.querySelectorAll('[data-check]:checked')].map(input => input.dataset.check);
    if (!ids.length) return say('请先选择要删除的词条。', true);
    if (!confirm(`确定删除选中的 ${ids.length} 条词汇吗？`)) return;
    commit({rows:rows.filter(row => !ids.includes(row.id)), resetForm:ids.includes(editingId), message:`已删除 ${ids.length} 条词汇。`});
  };
  $('#exportGlossary').onclick = () => exportRows(pending?.rows || rows, pending ? 'dwgc2e-glossary-unsaved.json' : 'dwgc2e-glossary.json');
  $('#importGlossary').addEventListener('change', event => {
    const input = event.target, file = input.files?.[0]; if (!file || pending || syncing || !ready) return;
    if(file.size>2*1024*1024){input.value='';return say('导入文件不能超过 2 MB；未保存任何修改。',true);}
    const reader = new FileReader();
    reader.onload = () => {
      try {
        if (pending || syncing || !ready) { say('请先处理当前保存操作，再重新选择导入文件。', true); return; }
        const raw = String(reader.result || ''), data = file.name.toLowerCase().endsWith('.csv') ? parseCsv(raw) : JSON.parse(raw);
        if (!Array.isArray(data)||data.length>1000||data.some(item=>!item||typeof item.source!=='string'||typeof item.target!=='string'||!item.source.trim()||!item.target.trim()||item.source.length>500||item.target.length>500||(item.note!==undefined&&(typeof item.note!=='string'||item.note.length>1000)))) throw Error();
        const imported = data.filter(item => item && item.source && item.target).map(item => ({id:`local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, source:String(item.source).trim(), target:String(item.target).trim(), note:String(item.note || '').trim()}));
        const existing = new Set(rows.map(row => row.source.toLowerCase()));
        const fresh = imported.filter(item => {const source=item.source.toLowerCase();if(existing.has(source))return false;existing.add(source);return true;});
        commit({rows:[...fresh, ...rows], message:`已导入 ${fresh.length} 条新词汇，重复项已跳过。`});
      } catch { say('导入失败：请检查 JSON/CSV 格式、原文译文、长度及1000条上限；未保存任何修改。', true); }
      finally { input.value = ''; }
    };
    reader.onerror = () => { input.value = ''; say('文件读取失败，请重新选择文件。', true); };
    reader.readAsText(file);
  });
  function parseCsv(raw) {
    const table=[];let row=[],cell='',quoted=false,closed=false;
    const pushCell=()=>{row.push(cell);cell='';closed=false;};
    const pushRow=()=>{pushCell();if(row.some(value=>value.trim()))table.push(row);row=[];};
    raw=raw.replace(/^\uFEFF/,'');
    for(let i=0;i<raw.length;i++){
      const c=raw[i];
      if(quoted){
        if(c==='"'){if(raw[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}
        else cell+=c;
      }else if(c===',')pushCell();
      else if(c==='\n'||c==='\r'){if(c==='\r'&&raw[i+1]==='\n')i++;pushRow();}
      else if(c==='"'){if(cell||closed)throw Error('invalid CSV');quoted=true;}
      else {if(closed&&!/\s/.test(c))throw Error('invalid CSV');if(!closed)cell+=c;}
    }
    if(quoted)throw Error('invalid CSV');pushRow();
    if(!table.length)return [];
    const header=table.shift().map(x=>x.trim().toLowerCase());
    if(!header.includes('source')||!header.includes('target'))throw Error('missing CSV header');
    return table.map(values=>({source:values[header.indexOf('source')]||'',target:values[header.indexOf('target')]||'',note:values[header.indexOf('note')]||''}));
  }
  async function loadCloud() {
    if(pending||syncing||!auth.active())return;
    if(ready && [...form.querySelectorAll('input')].some(input=>input.value.trim()) && !confirm('刷新将放弃表单中尚未保存的内容，是否继续？'))return;
    syncing=true;updateRecovery();say('正在读取云端最新词库…');
    try{
      const data=await window.DWGC2E_API.glossary.latest();
      if(!Array.isArray(data.entries)||typeof data.revision!=='string')throw Error('云端返回格式无效');
      if(!auth.active())return;
      rows=data.entries.map((row,i)=>({...row,id:row.id||'legacy-'+i}));revision=data.revision;ready=true;
      resetForm();render();say(localRows.length?'已读取云端最新词库。检测到旧版本本机词条，可点击“合并本机词条到云端”；不会自动覆盖云端。':'已读取云端最新词库。新增、修改、删除及导入均保存到云端。');
    }catch(error){ready=false;auth.failure(error);say(error.message||'云端读取失败，请重试；未覆盖任何云端内容。',true);}
    finally{syncing=false;updateRecovery();}
  }
  localButton.onclick=()=>{
    if(!ready||syncing||pending)return;
    if(localRows.some(row=>!row||typeof row.source!=='string'||typeof row.target!=='string'||!row.source.trim()||!row.target.trim()))return say('本机词条格式异常，已保留原数据，未上传。',true);
    const seen=new Set(rows.map(row=>row.source+'\0'+row.target));
    const additions=[];
    for(const row of localRows){if(!row||typeof row.source!=='string'||typeof row.target!=='string')continue;
      const pair=row.source.trim()+'\0'+row.target.trim();if(seen.has(pair))continue;seen.add(pair);
      additions.push({...row,id:'local-'+additions.length});}
    if(!confirm('将本机 '+additions.length+' 条新增词条合并到云端？云端已有词条保持不变。'))return;
    commit({rows:[...rows,...additions],migrateLocal:true});
  };
  $('#syncGlossary').addEventListener('click',()=>loadCloud());
  render();await loadCloud();
})();
