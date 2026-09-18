(() => {
 'use strict';
 const site=window.DWGC2E_SITE||{},$$=s=>[...document.querySelectorAll(s)];
 const safe=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}};
 const text=(tag,value)=>{const el=document.createElement(tag);el.textContent=value;return el;};
 async function refresh(){try{
  const response=await fetch((site.apiBaseUrl||'/api')+'/v1/site',{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!response.ok)return;const {release,content,controls}=await response.json();if(!release||!content||!controls)return;
  if(release.latest_version)$$('[data-version]').forEach(el=>el.textContent=release.latest_version);
  // A successful managed response is authoritative, including an explicitly empty URL.
  if(typeof release.download_url==='string')$$('[data-download]').forEach(el=>{
   if(safe(release.download_url)){el.href=release.download_url;el.target='_blank';el.rel='noopener noreferrer';el.removeAttribute('aria-disabled');}
   else{el.removeAttribute('href');el.removeAttribute('target');el.removeAttribute('rel');el.setAttribute('aria-disabled','true');}
  });
  // The homepage hero is fixed product copy, not managed announcement content.
  document.getElementById('siteAnnouncement')?.remove();
  if(content.announcement||controls.maintenance){const bar=document.createElement('aside');bar.id='siteAnnouncement';bar.className='site-announcement';bar.setAttribute('role','status');if(controls.maintenance)bar.append(text('strong','翻译服务维护中：新翻译请求暂时关闭，账户和已有订单仍可查看。'));if(content.announcement)bar.append(text('p',content.announcement));const main=document.querySelector('main');if(main)main.prepend(bar);else document.body.prepend(bar);}
  const host=document.querySelector('#download .container')||document.querySelector('.client-copy')||document.querySelector('#releaseList');if(host){document.getElementById('managedRelease')?.remove();const box=document.createElement('div');box.id='managedRelease';box.className='managed-release';if(release.release_notes){const d=document.createElement('details');d.append(text('summary','版本 '+release.latest_version+' 更新说明'),text('p',release.release_notes));box.append(d);}if(release.backup_download_url&&safe(release.backup_download_url)){const a=text('a','备用下载地址 ↗');a.href=release.backup_download_url;a.target='_blank';a.rel='noopener noreferrer';box.append(a);}host.append(box);}
  if(/\/(?:index|help|contact)(?:\.html)?\/?$/.test(location.pathname)||location.pathname==='/'){document.getElementById('managedHelp')?.remove();if(content.help_text||content.contact_email||content.tutorial_url){const section=document.createElement('section');section.id='managedHelp';section.className='managed-help container';section.append(text('h2','使用帮助与联系'));if(content.help_text)section.append(text('p',content.help_text));if(content.contact_email&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(content.contact_email)){const a=text('a','客服邮箱：'+content.contact_email);a.href='mailto:'+content.contact_email;section.append(a);}if(content.tutorial_url&&safe(content.tutorial_url)){const a=text('a','查看使用教程 ↗');a.href=content.tutorial_url;a.target='_blank';a.rel='noopener noreferrer';section.append(a);}const main=document.querySelector('main');if(main)main.append(section);}}
  $$('[data-device-rule]').forEach(el=>el.textContent='设备绑定超过 '+controls.device_wait_days+' 天后才能解绑并更换设备。');
 }catch{/* Keep existing download and content when configuration cannot be read. */}}
 refresh();window.addEventListener('pageshow',e=>{if(e.persisted)refresh();});
})();
