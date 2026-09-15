(() => {
 'use strict';
 const $=s=>document.querySelector(s),base=(window.DWGC2E_SITE||{}).apiBaseUrl||'/api';
 let key='',cursor=null,epoch=0,busy=false;
 const el=(tag,text)=>{const node=document.createElement(tag);node.textContent=text;return node;};
 function clear(){epoch++;key='';cursor=null;$('#adminKey').value='';$('#tickets').replaceChildren();$('#adminLogin').hidden=false;$('#adminLogout').hidden=true;$('#adminMore').hidden=true;}
 async function request(path,options={}){
  const started=epoch,credential=key;
  const response=await fetch(base+path,{...options,headers:{'content-type':'application/json',authorization:'Bearer '+credential},cache:'no-store',signal:AbortSignal.timeout(12000)});
  const data=await response.json();
  if(started!==epoch||credential!==key)throw Error('管理会话已结束。');
  if(!response.ok)throw Error(data.message||'请求失败');
  return data;
 }
 async function load(append=false){
  const data=await request('/v1/admin/feedback'+(append&&cursor?'?before='+encodeURIComponent(cursor):''));
  if(!append)$('#tickets').replaceChildren();
  for(const ticket of data.items){
   const article=el('article','');article.className='ws-ticket';const header=el('header','');
   header.append(el('strong',ticket.status==='resolved'?'已处理':'待处理'),el('span',ticket.category+' · '+new Date(ticket.created_at).toLocaleString()));
   const button=el('button',ticket.status==='resolved'?'重新打开':'标为已处理');
   button.onclick=async()=>{button.disabled=true;try{await request('/v1/admin/feedback/'+encodeURIComponent(ticket.id),{method:'POST',body:JSON.stringify({status:ticket.status==='resolved'?'new':'resolved'})});await load();}catch(error){$('#adminMessage').textContent=error.message;}finally{button.disabled=false;}};
   header.append(button);article.append(header,el('p','邮箱：'+ticket.email),el('pre',ticket.message),el('small','编号 '+ticket.id+' · 来源 '+ticket.page));
   const reply=el('a','通过邮件回复');reply.href='mailto:'+encodeURIComponent(ticket.email)+'?subject='+encodeURIComponent('DWGC2E 反馈回复 '+ticket.id);article.append(document.createElement('br'),reply);$('#tickets').append(article);
  }
  cursor=data.nextCursor;$('#adminMore').hidden=!cursor;$('#adminMessage').textContent=data.items.length?'反馈已加载':'暂无反馈';$('#adminLogin').hidden=true;$('#adminLogout').hidden=false;
 }
 $('#adminLogin').onsubmit=async event=>{event.preventDefault();if(busy)return;busy=true;epoch++;key=$('#adminKey').value;$('#adminKey').value='';const button=$('#adminLogin button');button.disabled=true;try{await load();}catch(error){clear();$('#adminMessage').textContent=error.message;}finally{busy=false;button.disabled=false;}};
 $('#adminMore').onclick=async()=>{if(busy)return;busy=true;$('#adminMore').disabled=true;try{await load(true);}catch(error){$('#adminMessage').textContent=error.message;}finally{busy=false;$('#adminMore').disabled=false;}};
 $('#adminLogout').onclick=()=>{clear();$('#adminMessage').textContent='已退出';};
 window.addEventListener('pagehide',clear);
})();
