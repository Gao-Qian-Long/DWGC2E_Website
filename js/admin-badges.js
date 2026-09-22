// Admin nav badge: pending-feedback indicator shared by every admin module page.
// While an admin session is live, scans the operations feedback list (max 4 pages x 25 rows)
// for workflow_status === 'new' and shows the count on the "用户反馈" nav link. The count is
// cached in sessionStorage (90s) so switching between admin modules paints the badge instantly
// without waiting for the network. admin-users.js calls QLCAD_ADMIN_BADGES.refresh() right
// after a feedback note is saved so the badge clears without waiting for the next poll.
(() => {
 'use strict';
 const KEY = 'dwgc2e.admin.feedbackBadge';
 const base = (window.QLCAD_SITE || {}).apiBaseUrl || '/api';
 const link = document.querySelector('.admin-module-nav a[href="admin-feedback.html"]');
 if (!link) return;
 let timer = null, running = false;
 const paint = count => {
  let badge = link.querySelector('.admin-nav-badge');
  if (!count) { badge?.remove(); link.removeAttribute('data-pending-feedback'); return; }
  if (!badge) {
   badge = document.createElement('span');
   badge.className = 'admin-nav-badge';
   badge.setAttribute('aria-label', '待处理反馈条数');
   link.append(badge);
  }
  badge.textContent = count > 99 ? '99+' : String(count);
  link.setAttribute('data-pending-feedback', String(count));
 };
 try {
  const cached = JSON.parse(sessionStorage.getItem(KEY) || '');
  if (cached && Date.now() - cached.ts < 90000) paint(cached.count);
 } catch { /* no valid cache */ }
 async function refresh() {
  if (running) return;
  running = true;
  try {
   // No separate session pre-check: a 401 from the feedback route itself means logged out.
   let count = 0, page = 1, hasMore = true;
   while (page <= 4 && hasMore && count < 100) {
    const res = await fetch(base + '/v1/admin/operations/feedback?page=' + page, {
     credentials: 'same-origin', cache: 'no-store', headers: { accept: 'application/json' },
     signal: AbortSignal.timeout(15000)
    });
    if (res.status === 401) { paint(0); return; }
    if (!res.ok) break;
    const data = await res.json();
    count += (Array.isArray(data.items) ? data.items : []).filter(item => item.workflow_status === 'new').length;
    hasMore = !!data.hasMore;
    page += 1;
   }
   paint(count);
   try { sessionStorage.setItem(KEY, JSON.stringify({ count, ts: Date.now() })); } catch { /* private mode */ }
  } catch { /* keep the last painted badge; the next cycle retries */ }
  finally { running = false; }
 }
 window.QLCAD_ADMIN_BADGES = { refresh };
 refresh();
 timer = setInterval(() => { if (!document.hidden) refresh(); }, 120000);
 window.addEventListener('admin-logout', () => {
  clearInterval(timer);
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
  paint(0);
 });
})();
