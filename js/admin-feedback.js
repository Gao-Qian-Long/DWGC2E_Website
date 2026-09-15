(() => {
  'use strict';
  const $ = selector => document.querySelector(selector), base = (window.DWGC2E_SITE || {}).apiBaseUrl || '/api';
  const categories = {payment:'支付与会员',translation:'翻译问题',installation:'安装问题',compatibility:'图纸兼容',suggestion:'功能建议',other:'其他'};
  let key = '', cursor = null, epoch = 0, busy = false, tickets = [];
  const el = (tag,text,cls) => { const node=document.createElement(tag); node.textContent=text; if(cls)node.className=cls; return node; };
  const say = (text,error=false) => { $('#adminMessage').textContent=text; $('#adminMessage').className='form-message'+(error?' error':''); };
  function clear() {
    epoch++; key=''; cursor=null; tickets=[]; busy=false; $('#adminKey').value=''; $('#tickets').replaceChildren();
    $('#adminSearch').value=''; $('#adminStatus').value='all'; $('#adminCount').textContent='';
    $('#adminGate').hidden=false; $('#adminWorkspace').hidden=true; $('#adminLogout').hidden=true; $('#adminMore').hidden=true; controls();
  }
  async function request(path,options={}) {
    const started=epoch, credential=key;
    const response=await fetch(base+path,{...options,headers:{'content-type':'application/json',authorization:'Bearer '+credential},cache:'no-store',signal:AbortSignal.timeout(12000)});
    const data=await response.json();
    if(started!==epoch||credential!==key) throw Error('管理会话已结束。');
    if(!response.ok) { const error=Error(response.status===401?'管理员验证失败：请确认密钥与 Cloudflare 一致，且修改密钥的版本已部署生效。':(data.message||'反馈暂时无法读取，请重试。')); error.status=response.status; throw error; }
    return data;
  }
  function controls() {
    $('#adminRefresh').disabled=busy; $('#adminMore').disabled=busy;
    $('#adminLogin button').disabled=busy;
    $('#tickets').querySelectorAll('button').forEach(button=>button.disabled=busy);
  }
  function render() {
    const query=$('#adminSearch').value.trim().toLowerCase(), status=$('#adminStatus').value;
    const shown=tickets.filter(t=>(status==='all'||t.status===status)&&[t.id,t.email,t.message,categories[t.category]||t.category].join(' ').toLowerCase().includes(query));
    $('#adminCount').textContent=`已加载 ${tickets.length} 条 · 当前显示 ${shown.length} 条${cursor?' · 下方可加载更多，筛选仅针对已加载内容':''}`;
    $('#tickets').replaceChildren();
    for(const ticket of shown) {
      const article=el('article','','ws-ticket');article.dataset.status=ticket.status;
      const header=el('header','');header.append(el('strong',ticket.status==='resolved'?'已处理':'待处理','ticket-status'),el('span',(categories[ticket.category]||ticket.category)+' · '+new Date(ticket.created_at).toLocaleString()));
      const button=el('button',ticket.status==='resolved'?'重新打开':'标为已处理','btn btn-ghost btn-sm');button.type='button';
      button.onclick=async()=>{
        if(busy)return; const generation=epoch; busy=true;controls();
        try { const status=ticket.status==='resolved'?'new':'resolved';await request('/v1/admin/feedback/'+encodeURIComponent(ticket.id),{method:'POST',body:JSON.stringify({status})}); if(generation!==epoch)return; ticket.status=status;render();say('反馈状态已更新。'); }
        catch(error) { if(generation===epoch) { if(error.status===401)clear();say(error.name==='TimeoutError'?'连接超时，请重试。':error instanceof TypeError?'无法连接反馈服务，请检查网络后重试。':error.message,true); } }
        finally { if(generation===epoch){busy=false;controls();} }
      };
      header.append(button);article.append(header,el('p','联系邮箱：'+ticket.email),el('pre',ticket.message));
      const footer=el('div','','ticket-footer');footer.append(el('small','编号 '+ticket.id+' · 来源 '+(ticket.page||'未记录')));
      const reply=el('a','通过邮件回复 ↗');reply.href='mailto:'+encodeURIComponent(ticket.email)+'?subject='+encodeURIComponent('DWGC2E 反馈回复 '+ticket.id);footer.append(reply);article.append(footer);$('#tickets').append(article);
    }
    if(!shown.length)$('#tickets').append(el('div',tickets.length?'没有符合当前筛选条件的反馈。':'还没有收到反馈。用户提交的问题会显示在这里。','portal-empty'));
    $('#adminMore').hidden=!cursor;controls();
  }
  async function load(append=false) {
    if(busy||!key)return; const generation=epoch;busy=true;controls();say(append?'正在加载更多反馈…':'正在读取反馈…');
    try { const data=await request('/v1/admin/feedback'+(append&&cursor?'?before='+encodeURIComponent(cursor):''));if(generation!==epoch)return;
      if(!Array.isArray(data.items))throw Error('返回数据不完整，请重试。');
      tickets=append?[...new Map([...tickets,...data.items].map(t=>[t.id,t])).values()]:data.items;cursor=data.nextCursor;
      $('#adminGate').hidden=true;$('#adminWorkspace').hidden=false;$('#adminLogout').hidden=false;render();say('');
    } catch(error) { if(generation===epoch) { if(error.status===401)clear();say(error.name==='TimeoutError'?'连接超时，请重试。':error instanceof TypeError?'无法连接反馈服务，请检查网络后重试。':error.message,true); } }
    finally { if(generation===epoch)busy=false;controls(); }
  }
  $('#adminLogin').onsubmit=event=>{
    event.preventDefault();if(busy)return;
    const candidate=$('#adminKey').value;
    if(candidate.trim()!==candidate){say('密钥前后含有空格，请检查后重新输入。',true);return;}
    if(candidate.length<32){say('管理员密钥至少需要 32 个字符，请使用已部署的 ADMIN_API_KEY。',true);return;}
    epoch++;key=candidate;$('#adminKey').value='';load();
  };
  $('#adminSearch').oninput=render;$('#adminStatus').onchange=render;
  $('#adminRefresh').onclick=()=>load();$('#adminMore').onclick=()=>load(true);
  $('#adminLogout').onclick=()=>{clear();controls();say('已退出管理，当前页面中的密钥和反馈内容已清除。');$('#adminKey').focus();};
  window.addEventListener('pagehide',()=>{clear();controls();say('');});
})();
