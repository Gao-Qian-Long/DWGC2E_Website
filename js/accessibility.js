/* Shared accessibility enhancements. No account, payment or storage contract changes. */
(() => {
  'use strict';
  const mobile = document.querySelector('.mobile-nav');
  const menu = document.querySelector('.menu-btn');
  if (mobile && menu) {
    mobile.id = 'mobile-navigation';
    menu.setAttribute('aria-controls', mobile.id);
    const sync = () => { const open = menu.getAttribute('aria-expanded') === 'true'; mobile.inert = !open; menu.setAttribute('aria-label', open ? '关闭菜单' : '打开菜单'); };
    sync(); new MutationObserver(sync).observe(menu, {attributes:true, attributeFilter:['aria-expanded']});
    document.addEventListener('keydown', event => {
      if(event.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') { menu.click(); menu.focus(); }
    });
    matchMedia('(min-width:851px)').addEventListener('change', e => {if(e.matches && menu.getAttribute('aria-expanded')==='true')menu.click();});
  }
  document.querySelectorAll('[role="tablist"]').forEach(list => {
    const tabs = [...list.querySelectorAll('[role="tab"]')];
    const syncTabs = () => tabs.forEach(t => { t.tabIndex = t.getAttribute('aria-selected') === 'true' ? 0 : -1; });
    syncTabs();
    list.addEventListener('click', syncTabs);
    list.addEventListener('keydown', e => {
      const current = tabs.indexOf(document.activeElement);
      if (current < 0 || !['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) return;
      e.preventDefault();
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (current + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      tabs[next].click(); tabs[next].focus(); syncTabs();
    });
  });
  document.querySelectorAll('svg:not([role]):not([aria-label])').forEach(svg => svg.setAttribute('aria-hidden','true'));
  document.querySelectorAll('.table-scroll').forEach(table => {table.tabIndex=0;table.setAttribute('role','region');table.setAttribute('aria-label','可横向滚动的数据表格');});
  const search = document.querySelector('#historyFilter'); if(search)search.setAttribute('aria-label','搜索翻译记录');
})();
