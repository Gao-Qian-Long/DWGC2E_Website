/* Shared accessibility enhancements. No account, payment or storage contract changes. */
(() => {
  'use strict';
  // Keyboard users need a way past the navigation on every page. Injecting it here covers the
  // secondary pages without editing a dozen HTML files; index.html already ships its own.
  const main = document.querySelector('main');
  if (main && !document.querySelector('.skip-link')) {
    if (!main.id) main.id = 'main-content';
    main.tabIndex = -1;
    const skip = document.createElement('a');
    skip.className = 'skip-link';
    skip.href = '#' + main.id;
    skip.textContent = '跳到正文';
    document.body.prepend(skip);
  }
  const mobile = document.querySelector('.mobile-nav');
  const menu = document.querySelector('.menu-btn');
  if (mobile && menu) {
    const outside = [...document.querySelectorAll('main, footer')];
    mobile.id = 'mobile-navigation';
    menu.setAttribute('aria-controls', mobile.id);
    const sync = () => {
      const open = menu.getAttribute('aria-expanded') === 'true';
      mobile.inert = !open;
      // While the menu is open the page behind it must leave the tab order too, otherwise a
      // keyboard user walks out of the menu into content hidden underneath it.
      outside.forEach(section => { section.inert = open; });
      menu.setAttribute('aria-label', open ? '关闭菜单' : '打开菜单');
      if (open) mobile.querySelector('a,button')?.focus();
    };
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
