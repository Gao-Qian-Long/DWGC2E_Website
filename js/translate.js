(() => {
  'use strict';
  const session = (() => { try { return JSON.parse(sessionStorage.getItem('dwgc2e.session') || 'null'); } catch { return null; } })();
  if (!session?.token || (session.expiresAt && new Date(session.expiresAt) <= new Date())) { location.replace(`account.html?return=${encodeURIComponent(location.pathname.split('/').pop() || 'translate.html')}`); return; }
  const form = document.querySelector('#translateForm'), files = document.querySelector('#files'), list = document.querySelector('#fileList'), msg = document.querySelector('#translateMessage'), glossary = form?.elements.glossary_id;
  if (!form || !files || !list || !msg) return;
  let selected = [];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const say = (text, error = false) => { msg.textContent = text || ''; msg.className = `form-message${error ? ' error' : ''}`; };
  const render = () => { list.innerHTML = selected.length ? selected.map((file, index) => `<li><span>${esc(file.name)}</span><small>${(file.size / 1024).toFixed(1)} KB</small><button type="button" class="btn btn-ghost btn-sm" data-remove="${index}">移除</button></li>`).join('') : '<li class="file-empty">尚未选择 DWG / DXF 文件</li>'; };
  files.addEventListener('change', () => {
    const incoming = [...files.files].filter(file => /\.(dwg|dxf)$/i.test(file.name));
    const rejected = files.files.length - incoming.length;
    const seen = new Set(selected.map(file => `${file.name}:${file.size}:${file.lastModified}`));
    selected = [...selected, ...incoming.filter(file => !seen.has(`${file.name}:${file.size}:${file.lastModified}`))];
    files.value = '';
    say(rejected ? '仅支持 DWG 或 DXF 文件，其他文件已忽略。' : `${selected.length} 个文件已加入任务。`, !!rejected);
    render();
  });
  list.addEventListener('click', event => { const button = event.target.closest('[data-remove]'); if (!button) return; selected.splice(Number(button.dataset.remove), 1); render(); say('已移除文件。'); });
  const localGlossaries = () => { try { const rows = JSON.parse(localStorage.getItem('dwgc2e.glossary') || '[]'); return Array.isArray(rows) ? rows : []; } catch { return []; } };
  if (glossary) {
    const local = localGlossaries(); if (local.length) { const option = document.createElement('option'); option.value = 'local'; option.textContent = `浏览器本地词库（${local.length} 条）`; glossary.append(option); }
    window.DWGC2E_API?.terminology.list().then(data => { const rows = Array.isArray(data) ? data : (data?.items || data?.terminology || []); if (Array.isArray(rows) && rows.length) { const option = document.createElement('option'); option.value = 'cloud'; option.textContent = `云端词库（${rows.length} 条）`; glossary.append(option); } }).catch(() => {});
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!selected.length) return say('请先选择至少一个 DWG 或 DXF 文件。', true);
    if (selected.some(file => file.size > 50 * 1024 * 1024)) return say('单个文件不能超过 50 MB，请重新选择。', true);
    const button = form.querySelector('button[type="submit"]'); button.disabled = true; say('正在上传文件并创建翻译任务…');
    try { const data = new FormData(); selected.forEach(file => data.append('files', file, file.name)); data.append('source_language', form.source_language.value); data.append('target_language', form.target_language.value); if (glossary?.value && glossary.value !== 'local' && glossary.value !== 'cloud') data.append('glossary_id', glossary.value); const result = await window.DWGC2E_API.translation.create(data); const taskId = result?.task_id || result?.id; say(taskId ? `任务已创建（${taskId}），可在翻译记录中查看。` : '任务已提交，可在翻译记录中查看。'); selected = []; files.value = ''; render(); } catch (error) { say(error.status === 404 ? '翻译任务接口暂未开放；请先完成 Worker 接口部署。' : (error.message || '任务创建失败。'), true); } finally { button.disabled = false; }
  });
  render();
})();
