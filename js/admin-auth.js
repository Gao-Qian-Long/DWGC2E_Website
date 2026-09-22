(() => {
 'use strict';const base=(window.QLCAD_SITE||{}).apiBaseUrl||'/api';
 const channel=typeof BroadcastChannel==='function'?new BroadcastChannel('dwgc2e.admin-session'):null;
 async function session(method='GET',key,username){const response=await fetch(base+'/v1/admin/session',{method,credentials:'same-origin',cache:'no-store',headers:key?{authorization:'Bearer '+key,'content-type':'application/json'}:{},...(key?{body:JSON.stringify({username})}:{}),signal:AbortSignal.timeout(15000)});const data=await response.json();if(!response.ok){const error=Error(data.message||'后台登录暂不可用');error.status=response.status;throw error;}return data;}
 window.QLCAD_ADMIN_AUTH={check:()=>session(),login:(key,username)=>session('POST',key,username),logout:async()=>{await session('DELETE');channel?.postMessage('logout');window.dispatchEvent(new Event('admin-logout'));}};
 channel?.addEventListener('message',e=>{if(e.data==='logout')window.dispatchEvent(new Event('admin-logout'));});
})();
