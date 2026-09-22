/* Shared route gate: local session availability is not proof of server authorization. */
(() => {
  'use strict';
  const pages = {billing:'套餐与订单',profile:'资料与安全',devices:'设备管理',history:'翻译记录',terminology:'术语库'};
  const read = () => { try { return JSON.parse(sessionStorage.getItem('dwgc2e.session') || 'null'); } catch { return null; } };
  const valid = s => !!(typeof s?.token === 'string' && s.token && (!s.expiresAt || Date.parse(s.expiresAt) > Date.now()));
  function safeReturn(value) {
    if (typeof value !== 'string' || !value || /[\\\x00-\x20]/.test(value)) return '';
    try { const u = new URL(value, location.origin+'/'); const match = u.pathname.match(/^\/(plans|billing|profile|devices|history|terminology|index|updates|contact|privacy|terms|status|translate)(?:\.html)?$/);
      return u.origin === location.origin && !u.username && !u.password && match ? match[1]+'.html'+u.search+u.hash : '';
    } catch { return ''; }
  }
  const route = location.pathname.split('/').pop().replace(/\.html$/, '');
  const title = pages[route];
  const session = read(), token = valid(session) ? session.token : '';
  let state = 'AUTH_CHECKING', gate, content;
  const loginHref = () => 'account.html?return='+encodeURIComponent(safeReturn(location.pathname+location.search+location.hash) || route+'.html');
  function setState(next, message) {
    state=next; document.documentElement.dataset.authState=next;
    if (!gate) return;
    const showGate = ['AUTH_CHECKING','UNAUTHENTICATED','AUTHENTICATED_LOADING'].includes(next);
    gate.hidden=!showGate; content.hidden=showGate;
    const anonymous=next==='UNAUTHENTICATED';
    gate.querySelector('p').textContent=message || (anonymous ? '登录后可查看'+title+'，登录成功后将自动返回此页面。' : '正在加载'+title+'…');
    gate.querySelector('a').hidden=!anonymous;
    if(anonymous){gate.querySelector('a').href=loginHref();gate.querySelector('a').textContent='登录并继续';}
    content.inert=showGate;
  }
  function active() {
    const current=read();
    if (!token || !valid(current) || token!==current.token || state==='UNAUTHENTICATED') { if(title)setState('UNAUTHENTICATED'); return false; }
    return true;
  }
  function requireLogin(message) { if (title)setState('UNAUTHENTICATED',message); }
  if(title) {
    content=document.querySelector('main');
    gate=document.createElement('section');gate.className='auth-route-gate portal-card';gate.setAttribute('aria-live','polite');
    const h=document.createElement('h1');h.textContent=title;
    const p=document.createElement('p');const link=document.createElement('a');link.className='btn btn-primary portal-login-link';link.href=loginHref();link.textContent='登录并继续';
    gate.append(h,p,link);content.before(gate);
    setState(token?'AUTHENTICATED_LOADING':'UNAUTHENTICATED');
    const inspect=()=>{if(!active())requireLogin('请先登录后继续查看'+title+'。');};
    window.addEventListener('storage',inspect);window.addEventListener('pageshow',inspect);window.addEventListener('focus',inspect);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)inspect();});
    content.addEventListener('click',e=>{if(!active()){e.preventDefault();e.stopImmediatePropagation();}},true);
    if(session?.expiresAt&&token){let timer;const schedule=()=>{clearTimeout(timer);if(!active())return;timer=setTimeout(()=>{inspect();if(active())schedule();},Math.min(2147483647,Math.max(1,Date.parse(session.expiresAt)-Date.now()+5)));};schedule();window.addEventListener('pagehide',()=>clearTimeout(timer));window.addEventListener('pageshow',schedule);}
  }
  window.QLCAD_AUTH=Object.freeze({read,valid:()=>valid(read()),safeReturn,active,requireLogin,
    ready:()=>{if(active())setState('AUTHENTICATED_READY');},error:()=>{if(active())setState('AUTHENTICATED_ERROR');},
    failure:error=>{if(error?.authExpired||error?.code==='session_changed'||!valid(read()))requireLogin();},
    showError:message=>{if(!active())return;setState('AUTHENTICATED_ERROR');content.hidden=true;gate.hidden=false;gate.querySelector('p').textContent=message;const a=gate.querySelector('a');a.hidden=false;a.href=location.pathname+location.search;a.textContent='重新加载';},
    get state(){return state;}
  });
})();
