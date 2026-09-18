// Scoped compatibility for cloud tools on the current production shell.
// The newer workspace auth-state module takes precedence when available.
(() => {
  'use strict';
  if(window.DWGC2E_AUTH)return;
  const read=()=>{try{return JSON.parse(sessionStorage.getItem('dwgc2e.session')||'null');}catch{return null;}};
  const initial=read()?.token;
  let redirecting=false;
  const main=document.querySelector('main');
  const active=()=>{
    const session=read();
    const valid=initial&&session?.token===initial&&(!session.expiresAt||Date.parse(session.expiresAt)>Date.now());
    if(!valid){if(main)main.hidden=true;if(!redirecting){redirecting=true;location.replace('account.html?return='+encodeURIComponent(location.pathname.split('/').pop()));}}
    return !!valid;
  };
  const failure=error=>{if(error?.authExpired||error?.code==='session_changed'||!active()){if(main)main.hidden=true;active();}};
  window.DWGC2E_CLOUD_SESSION=Object.freeze({active,failure,ready:()=>active(),showError:message=>{if(!active())return;const target=document.querySelector('#glossaryMessage, #historyMessage');if(target)target.textContent=message;}});
  for(const event of ['click','submit'])main?.addEventListener(event,e=>{if(!active()){e.preventDefault();e.stopImmediatePropagation();}},true);
  for(const event of ['focus','pageshow','storage'])window.addEventListener(event,active);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)active();});
  const sessionTimer=setInterval(()=>{if(!active())clearInterval(sessionTimer);},1000);
})();
