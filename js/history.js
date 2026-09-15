(() => {
  'use strict';
  const session = (() => { try { return JSON.parse(sessionStorage.getItem('dwgc2e.session') || 'null'); } catch { return null; } })();
  if (!session?.token || (session.expiresAt && new Date(session.expiresAt) <= new Date())) { location.replace(`account.html?return=${encodeURIComponent('history.html')}`); return; }
  const list = document.querySelector('#historyList'), msg = document.querySelector('#historyMessage'), filter = document.querySelector('#historyFilter');
  if (!list || !msg || !filter) return;
  let rows = [], nextCursor=null, loading=false, loaded=false; const retry=document.querySelector('#retryHistory');const more=document.createElement('button');more.className='btn btn-ghost';more.textContent='加载更多';more.hidden=true;msg.after(more);
  const say = (text, error = false) => { msg.textContent = text || ''; msg.className = `form-message${error ? ' error' : ''}`; };
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const idOf = row => row.id || row.task_id || '';
  const safeDownload = value => { try { const url = new URL(String(value), location.href); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; } };
  const normalize = data => { const value = Array.isArray(data) ? data : (data?.history || data?.items || data?.tasks || []); return Array.isArray(value) ? value : []; };
  const render = () => {
    const query = filter.value.trim().toLowerCase();
    const data = rows.filter(row => [row.file_name, row.status, row.source_language, row.target_language, row.created_at].join(' ').toLowerCase().includes(query));
    list.innerHTML = data.length ? data.map(row => { const id = idOf(row), download = safeDownload(row.download_url || row.result_url); return `<tr><td>${esc(row.file_name || '未命名任务')}</td><td>${esc(row.status || '处理中')}</td><td>${esc(row.source_language || '自动')}</td><td>${esc(row.target_language || '—')}</td><td>${esc(row.created_at || '—')}</td><td>${id ? `<button class="btn btn-ghost btn-sm" data-detail="${esc(id)}">刷新</button>` : ''}${download ? `<a class="btn btn-primary btn-sm" href="${esc(download)}" target="_blank" rel="noopener noreferrer">下载</a>` : '<span>—</span>'}</td></tr>`; }).join('') : '<tr><td colspan="6" class="table-empty">'+(query?'没有匹配的翻译记录。':loaded?'暂无翻译记录。':'翻译记录暂未加载，请刷新重试。')+'</td></tr>';
  };
  list.addEventListener('click', async event => { const button = event.target.closest('[data-detail]'); if (!button) return; button.disabled = true; try { const row = rows.find(item => idOf(item) === button.dataset.detail); if (row) Object.assign(row, await window.DWGC2E_API.history.detail(button.dataset.detail)); render(); say('任务状态已刷新。'); } catch (error) { say(error.status === 404 ? '任务详情接口暂未开放。' : (error.message || '任务状态刷新失败。'), true); } finally { button.disabled = false; } });
  filter.addEventListener('input', render);
  async function load(append=false){if(loading)return;loading=true;more.disabled=true;retry.disabled=true;say('正在读取翻译记录…');try{const data=await window.DWGC2E_API.history.list(append?nextCursor:null);rows=append?[...rows,...normalize(data)]:normalize(data);loaded=true;nextCursor=data.nextCursor;more.hidden=!nextCursor;render();say(rows.length?'':'暂无翻译记录。');}catch(error){render();say(error.message||'翻译记录暂时无法读取。',true);}finally{loading=false;more.disabled=false;retry.disabled=false;}}
more.onclick=()=>load(true);retry.onclick=()=>load();load();
})();
