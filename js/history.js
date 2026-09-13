(() => {
  'use strict';
  const session=(()=>{try{return JSON.parse(sessionStorage.getItem('dwgc2e.session')||'null')}catch{return null}})();
  if(!session?.token||session.expiresAt&&new Date(session.expiresAt)<=new Date()){ location.replace('account.html?return='+encodeURIComponent(location.pathname.split('/').pop())); return; }
  const list=document.querySelector('#historyList'),msg=document.querySelector('#historyMessage'),filter=document.querySelector('#historyFilter'); let rows=[];
  const say=(t,e=false)=>{msg.textContent=t;msg.className='form-message'+(e?' error':'')};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const render=()=>{const q=filter.value.toLowerCase(),data=rows.filter(x=>[x.file_name,x.status,x.created_at].join(' ').toLowerCase().includes(q));list.innerHTML=data.length?data.map(x=>`<tr><td>${esc(x.file_name||'未命名任务')}</td><td>${esc(x.status||'处理中')}</td><td>${esc(x.source_language||'自动')}</td><td>${esc(x.target_language||'—')}</td><td>${esc(x.created_at||'—')}</td><td>${x.id||x.task_id?`<button class="btn btn-ghost btn-sm" data-detail="${esc(x.id||x.task_id)}">刷新</button>`:''}${x.download_url?`<a class="btn btn-primary btn-sm" href="${esc(x.download_url)}" target="_blank" rel="noopener">下载</a>`:'—'}</td></tr>`).join(''):'<tr><td colspan="6" class="table-empty">暂无翻译记录。</td></tr>'};
  const refreshActive=async()=>{const active=rows.filter(x=>['queued','processing'].includes(String(x.status||'').toLowerCase())&&(x.id||x.task_id));for(const item of active){try{Object.assign(item,await window.DWGC2E_API.history.detail(item.id||item.task_id))}catch{}}if(active.length)render()};
  list.addEventListener('click',async e=>{const b=e.target.closest('[data-detail]');if(!b)return;b.disabled=true;try{const d=await window.DWGC2E_API.history.detail(b.dataset.detail),item=rows.find(x=>(x.id||x.task_id)==b.dataset.detail);if(item)Object.assign(item,d);render();say('任务状态已刷新。')}catch(error){say(error.status===404?'任务详情接口暂未开放。':'任务状态刷新失败。',true)}finally{b.disabled=false}});filter.addEventListener('input',render);
  if(window.DWGC2E_API){setInterval(refreshActive,10000);window.DWGC2E_API.history.list().then(data=>{rows=Array.isArray(data)?data:(data.history||[]);render()}).catch(error=>{render();say(error.status===404?'翻译记录接口暂未开放，待 Worker 接口完成后显示。':'翻译记录暂时无法读取。',true)})}
})();
