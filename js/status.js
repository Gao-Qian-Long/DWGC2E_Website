(() => {
 'use strict';
 const box=document.querySelector('#statusList'),msg=document.querySelector('#statusMessage'),button=document.querySelector('#retryStatus');if(!box||!msg||!button)return;
 const item=(name,state,text)=>{const row=document.createElement('div');row.className='status-row';const label=document.createElement('span');label.textContent=name;const value=document.createElement('strong');value.dataset.state=state;value.textContent='● '+text;row.append(label,value);box.append(row);};
 const run=async()=>{if(button.disabled)return;button.disabled=true;box.replaceChildren();item('网页资源','ok','已加载');item('API 与数据库','unknown','检查中');
 try{const r=await fetch((window.QLCAD_SITE?.apiBaseUrl||'/api')+'/v1/health',{cache:'no-store',signal:AbortSignal.timeout(7000)}),d=await r.json();if(!navigator.onLine||![200,503].includes(r.status)||d.api!=='operational'||!['operational','unavailable'].includes(d.database))throw Error();box.lastChild.remove();item('账户 API','ok','正常');item('数据库连接',d.database==='operational'?'ok':'bad',d.database==='operational'?'正常':'暂不可用');msg.textContent='本机检查时间：'+new Date().toLocaleString()+'。页面可见时每 60 秒复查；未检查支付通道或翻译上游，不代表全天监控。';msg.className='form-message';}
 catch{box.lastChild.remove();item('账户 API','unknown','无法确认');item('数据库连接','unknown','未知');msg.textContent='本机检查时间：'+new Date().toLocaleString()+'。健康检查失败，不能据此判断支付、翻译服务或账户登录状态。';msg.className='form-message error';}
 finally{button.disabled=false;}};
 button.addEventListener('click',run);document.addEventListener('visibilitychange',()=>{if(!document.hidden)run();});window.addEventListener('online',run);window.addEventListener('offline',()=>{box.replaceChildren();item('网页资源','ok','已加载');item('账户 API','unknown','网络离线');item('数据库连接','unknown','未知');});setInterval(()=>{if(!document.hidden)run();},60000);run();
})();
