// Isolated UI regressions. All API/external requests are mocked; no production writes.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
let browser, server, origin;
before(async () => {
  server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, bytes) => {
      res.writeHead(err ? 404 : 200, {'content-type': ({'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'})[path.extname(file)] || 'application/octet-stream'});
      res.end(err ? 'Not found' : bytes);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({channel:'msedge', headless:true});
});
after(async () => { await browser?.close(); await new Promise(resolve => server.close(resolve)); });
const fixtures = {
  '/v1/health': {api:'operational',database:'operational'},
  '/v1/version': {latest_version:'2.1.0'},
  '/v1/profile': {user_id:'ui-test',display_name:'测试工程师',email:'ui@example.test'},
  '/v1/subscription': {plan_name:'Pro',max_devices:3},
  '/v1/usage': {used:120,monthly_quota:10000},
  '/v1/devices': {devices:[],max_devices:3},
  '/v1/auth/web/login': {token:'local-only',user_id:'ui-test',expires_at:'2099-01-01'},
  '/v1/auth/password/reset': {success:true},
  '/v1/auth/logout': {success:true},
  '/v1/terminology': {items:[]}
};
async function pageFor(t, file, options = {}) {
  const page = await browser.newPage({viewport:{width:options.width || 390,height:options.height || 844}, reducedMotion:'reduce'});
  page.setDefaultTimeout(4000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  t.after(async () => { await page.close(); assert.deepEqual(errors, []); });
  await page.addInitScript(({session, rows}) => {
    if (session) sessionStorage.setItem('dwgc2e.session',JSON.stringify({token:'local-only',userId:'ui-test',expiresAt:'2099-01-01'}));
    if (rows) localStorage.setItem('dwgc2e.glossary.ui-test',JSON.stringify(rows));
    window.storageBlocked = false;
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (window.storageBlocked && this === localStorage) throw new DOMException('Storage unavailable','QuotaExceededError');
      return write.call(this, key, value);
    };
  }, {session:options.session || false, rows:options.rows});
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const endpoint = url.pathname.slice(4);
    if (options.api && await options.api(endpoint, route)) return;
    return route.fulfill({json:fixtures[endpoint] || {items:[]}});
  });
  await page.goto(origin + '/' + file);
  return page;
}
const initialRows = [{id:'a',source:'bolt',target:'螺栓',note:''},{id:'b',source:'nut',target:'螺母',note:''}];
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('dwgc2e.glossary.ui-test') || '[]'));
async function add(page, source='washer') {
  await page.locator('#glossaryForm [name=source]').fill(source);
  await page.locator('#glossaryForm [name=target]').fill('垫圈');
  await page.locator('#saveGlossary').click();
}
async function login(page) {
  await page.locator('[name=account]').fill('ui@example.test');
  await page.locator('[name=password]').fill('12345678');
  await page.locator('#authSubmit').click();
}
test('failed glossary add preserves input, old rows and does not report success', async t => {
  const p = await pageFor(t,'terminology.html',{rows:initialRows});
  await p.locator('[data-check]').first().waitFor();
  await p.evaluate(() => window.storageBlocked = true);
  await add(p);
  assert.match(await p.locator('#glossaryMessage').textContent(), /未保存/);
  assert.equal(await p.locator('[name=source]').inputValue(),'washer');
  assert.equal(await p.locator('[data-check]').count(),2);
  assert.deepEqual(await stored(p),initialRows);
});
test('login with partial dashboard failure shows account, not login form', async t => {
  const p = await pageFor(t,'account.html',{api:async (endpoint, route) => {
    if (endpoint !== '/v1/subscription') return false;
    await route.fulfill({status:503,json:{message:'暂时不可用'}}); return true;
  }});
  await login(p);
  await p.locator('#accountPanel:visible').waitFor();
  assert.equal(await p.locator('#authPanel').isVisible(),false);
  assert.equal(await p.locator('#profileName').textContent(),'测试工程师');
  assert.match(await p.locator('#planName').textContent(),/暂不可用/);
  assert.equal(await p.locator('#usageUsed').textContent(),'120');
});
test('password reset synchronizes selected tab, keyboard stop and focus', async t => {
  const p = await pageFor(t,'account.html');
  await p.locator('[data-auth-mode=forgot]').click();
  await p.locator('[name=reset_email]').fill('ui@example.test');
  await p.locator('[name=code]').fill('123456');
  await p.locator('[name=new_password]').fill('12345678');
  await p.locator('#authSubmit').click();
  await p.waitForFunction(() => document.querySelector('[data-auth-mode=login]').getAttribute('aria-selected') === 'true');
  assert.deepEqual(await p.locator('[role=tab]').evaluateAll(es=>es.map(e=>e.tabIndex)),[0,-1,-1]);
  assert.equal(await p.locator('[name=account]').evaluate(e=>e===document.activeElement),true);
});
test('row selection updates all/partial state and search clears selections', async t => {
  const p = await pageFor(t,'terminology.html',{rows:initialRows});
  await p.locator('[data-check=a]').check();
  assert.equal(await p.locator('#selectAll').evaluate(e=>e.indeterminate),true);
  await p.locator('[data-check=b]').check();
  assert.equal(await p.locator('#selectAll').isChecked(),true);
  await p.locator('[data-check=a]').uncheck();
  assert.equal(await p.locator('#selectAll').evaluate(e=>e.indeterminate),true);
  await p.locator('#glossarySearch').fill('bolt');
  assert.equal(await p.locator('[data-check]:checked').count(),0);
  assert.equal(await p.locator('#selectAll').isChecked(),false);
  assert.equal(await p.locator('#selectAll').evaluate(e=>e.indeterminate),false);
});
for (const operation of ['add','edit','delete','bulk-delete','import','cloud']) {
  test(`glossary ${operation}: failed write, candidate export, leave warning and retry`, async t => {
    const p = await pageFor(t,'terminology.html',{rows:initialRows, api:async (endpoint,route) => {
      if (endpoint !== '/v1/terminology') return false;
      await route.fulfill({json:{items:[{id:'cloud',source:'washer',target:'垫圈'}]}}); return true;
    }});
    await p.locator('[data-check=a]').waitFor();
    await p.evaluate(() => window.storageBlocked = true);
    p.on('dialog', dialog => dialog.type() === 'beforeunload' ? dialog.dismiss() : dialog.accept());
    if (operation === 'add') await add(p);
    if (operation === 'edit') { await p.locator('[data-edit=a]').click(); await p.locator('[name=target]').fill('修改后'); await p.locator('#saveGlossary').click(); }
    if (operation === 'delete') await p.locator('[data-delete=a]').click();
    if (operation === 'bulk-delete') { await p.locator('#selectAll').check(); await p.locator('#deleteSelected').click(); }
    if (operation === 'import') await p.locator('#importGlossary').setInputFiles({name:'terms.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify([{source:'washer',target:'垫圈'}]))});
    if (operation === 'cloud') await p.locator('#syncGlossary').click();
    await p.locator('#retryGlossary:visible').waitFor();
    assert.match(await p.locator('#glossaryMessage').textContent(),/未保存/);
    assert.deepEqual(await stored(p),initialRows);
    assert.equal(await p.locator('[data-check]').count(),2);
    assert.equal(await p.locator('#saveGlossary').isDisabled(),true);
    const pendingDownload = p.waitForEvent('download');
    await p.locator('#exportPendingGlossary').click();
    const download = await pendingDownload;
    const exported = JSON.parse(fs.readFileSync(await download.path(),'utf8'));
    assert.equal(exported.length, operation === 'bulk-delete' ? 0 : operation === 'delete' ? 1 : operation === 'edit' ? 2 : 3);
    if (operation === 'edit') assert.equal(exported.find(r=>r.id==='a').target,'修改后');
    assert.equal(await p.evaluate(() => {
      const event = new Event('beforeunload',{cancelable:true}); window.dispatchEvent(event); return event.defaultPrevented;
    }),true);
    await p.evaluate(() => window.storageBlocked = false);
    await p.locator('#retryGlossary').click();
    assert.deepEqual(await stored(p),exported);
    assert.equal(await p.locator('#retryGlossary').isVisible(),false);
    assert.equal(await p.locator('#saveGlossary').isDisabled(),false);
    assert.equal(await p.evaluate(() => { const event = new Event('beforeunload',{cancelable:true}); window.dispatchEvent(event); return event.defaultPrevented; }),false);
  });
}
test('discarding failed edit keeps persisted data and user input', async t => {
  const p = await pageFor(t,'terminology.html',{rows:initialRows});
  await p.locator('[data-edit=a]').click();
  await p.evaluate(() => window.storageBlocked = true);
  await p.locator('[name=target]').fill('未保存译文'); await p.locator('#saveGlossary').click();
  p.once('dialog',d=>d.accept()); await p.locator('#discardPendingGlossary').click();
  assert.deepEqual(await stored(p),initialRows);
  assert.equal(await p.locator('[name=target]').inputValue(),'未保存译文');
  assert.equal(await p.locator('#saveGlossary').isEnabled(),true);
});
test('bulk delete respects filtering and cancellation', async t => {
  const p = await pageFor(t,'terminology.html',{rows:initialRows});
  await p.locator('#glossarySearch').fill('bolt'); await p.locator('#selectAll').check();
  p.once('dialog',d=>d.dismiss()); await p.locator('#deleteSelected').click();
  assert.deepEqual(await stored(p),initialRows);
  p.once('dialog',d=>d.accept()); await p.locator('#deleteSelected').click();
  assert.deepEqual(await stored(p),[initialRows[1]]);
  assert.equal(await p.locator('#selectAll').isChecked(),false);
});
test('account sections render independently, retain data on failure and recover', async t => {
  let phase = 'loading', releaseUsage;
  const p = await pageFor(t,'account.html',{session:true,api:async (endpoint,route) => {
    if (endpoint === '/v1/usage' && phase === 'loading') {
      await new Promise(resolve => releaseUsage=resolve);
      await route.fulfill({json:fixtures[endpoint]}); return true;
    }
    if (endpoint === '/v1/subscription' && phase === 'failure') { await route.abort('failed'); return true; }
    return false;
  }});
  await p.waitForFunction(() => document.querySelector('#planName').textContent === 'Pro');
  assert.match(await p.locator('#usageSyncStatus').textContent(),/正在加载/);
  phase = 'failure'; releaseUsage();
  await p.waitForFunction(() => document.querySelector('#dashboardMessage').textContent.startsWith('已同步'));
  await p.locator('#refreshButton').click();
  await p.waitForFunction(() => document.querySelector('#subscriptionSyncStatus').textContent.includes('更新失败'));
  assert.equal(await p.locator('#planName').textContent(),'Pro');
  assert.ok(await p.evaluate(()=>sessionStorage.getItem('dwgc2e.session')));
  phase = 'success'; await p.locator('#refreshButton').click();
  await p.waitForFunction(() => document.querySelector('#dashboardMessage').textContent.startsWith('已同步'));
  assert.equal(await p.locator('#refreshButton').isEnabled(),true);
});
test('first-load failure and invalid usage never invent free plan or zero quota', async t => {
  const p = await pageFor(t,'account.html',{session:true,api:async (endpoint,route) => {
    if (endpoint === '/v1/usage') { await route.fulfill({json:{used:null,monthly_quota:null}}); return true; }
    if (endpoint === '/v1/subscription') { await route.abort('failed'); return true; }
    return false;
  }});
  await p.waitForFunction(() => document.querySelector('#dashboardMessage').textContent.includes('同步失败'));
  assert.equal(await p.locator('#planName').textContent(),'暂不可用');
  assert.equal(await p.locator('#usageQuota').textContent(),'—');
  assert.equal(await p.locator('#usageMeter').getAttribute('aria-valuenow'),null);
});
test('expired session returns to login and cannot be reopened by delayed responses', async t => {
  let finish;
  const p = await pageFor(t,'account.html',{session:true,api:async (endpoint,route) => {
    if (endpoint === '/v1/profile') { await new Promise(r=>finish=r); await route.fulfill({json:fixtures[endpoint]}); return true; }
    if (endpoint === '/v1/subscription') { await route.fulfill({status:401,json:{error_code:'unauthenticated'}}); return true; }
    return false;
  }});
  await p.locator('#authPanel:visible').waitFor();
  finish();
  await p.waitForTimeout(100);
  assert.equal(await p.locator('#accountPanel').isVisible(),false);
  assert.equal(await p.evaluate(()=>sessionStorage.getItem('dwgc2e.session')),null);
});
test('logout ignores late successful dashboard responses', async t => {
  let finish, blocked = false;
  const p = await pageFor(t,'account.html',{session:true,api:async (endpoint,route) => {
    if (blocked && endpoint === '/v1/profile') { await new Promise(r=>finish=r); await route.fulfill({json:{...fixtures[endpoint],display_name:'迟到的旧用户'}}); return true; }
    return false;
  }});
  await p.waitForFunction(() => document.querySelector('#dashboardMessage').textContent.startsWith('已同步'));
  blocked = true; await p.locator('#refreshButton').click();
  await p.waitForFunction(() => document.querySelector('#profileSyncStatus').textContent.includes('正在加载'));
  await p.locator('#logoutButton').click(); await p.locator('#authPanel:visible').waitFor();
  finish(); await p.waitForTimeout(100);
  assert.equal(await p.locator('#accountPanel').isVisible(),false);
  assert.notEqual(await p.locator('#profileName').textContent(),'迟到的旧用户');
});
test('account return target does not wait for dashboard services', async t => {
  let dashboardCalls = 0;
  const p = await pageFor(t,'account.html?return=updates.html',{api:async (endpoint,route) => {
    if (['/v1/profile','/v1/subscription','/v1/usage','/v1/devices'].includes(endpoint)) { dashboardCalls++; await route.abort('failed'); return true; }
    return false;
  }});
  await login(p); await p.waitForURL('**/updates.html');
  assert.equal(dashboardCalls,0);
});
test('auth tabs support arrow keys and a single keyboard stop', async t => {
  const p = await pageFor(t,'account.html');
  await p.locator('[data-auth-mode=login]').focus(); await p.keyboard.press('ArrowRight');
  assert.deepEqual(await p.locator('[role=tab]').evaluateAll(es=>es.map(e=>e.tabIndex)),[-1,0,-1]);
  await p.keyboard.press('End');
  assert.equal(await p.locator('[data-auth-mode=forgot]').getAttribute('aria-selected'),'true');
  await p.keyboard.press('Home');
  assert.deepEqual(await p.locator('[role=tab]').evaluateAll(es=>es.map(e=>e.tabIndex)),[0,-1,-1]);
});
for (const width of [390,1440]) {
  test(`populated/error-state layout at ${width}px and short support window`, async t => {
    const out = process.env.AUDIT_OUTPUT;
    const p = await pageFor(t,'account.html',{session:true,width,api:async (endpoint,route) => {
      if (endpoint === '/v1/profile') { await route.fulfill({json:{...fixtures[endpoint],display_name:'长账户名称'.repeat(20),email:'long-address-'.repeat(15)+'@example.test'}}); return true; }
      if (endpoint === '/v1/subscription') { await route.fulfill({status:503,json:{message:'服务暂不可用'.repeat(30)}}); return true; }
      return false;
    }});
    await p.waitForFunction(() => document.querySelector('#dashboardMessage').textContent.includes('同步失败'));
    assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    if (out) { fs.mkdirSync(out,{recursive:true}); await p.screenshot({path:path.join(out,`account-error-${width}.png`),fullPage:true}); }
    const terms = await pageFor(t,'terminology.html',{width,rows:[...initialRows,{id:'long',source:'long-term-'.repeat(30),target:'长译文'.repeat(25),note:'长备注'.repeat(50)}]});
    await terms.locator('[data-check=long]').waitFor(); await terms.evaluate(()=>window.storageBlocked=true); await add(terms);
    assert.equal(await terms.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    if (out) await terms.screenshot({path:path.join(out,`terminology-unsaved-${width}.png`),fullPage:true});
    await p.setViewportSize({width,height:430}); await p.locator('.ws-support-button').click();
    await p.locator('#wsSupport button[type=submit]').scrollIntoViewIfNeeded();
    const bounds = await p.locator('#wsSupport').boundingBox();
    assert.ok(bounds.y>=0 && bounds.y+bounds.height<=430);
    assert.equal(await p.locator('#wsSupport button[type=submit]').isVisible(),true);
    if (out) await p.screenshot({path:path.join(out,`support-short-${width}.png`)});
  });
}
test('replacement session rejects old responses without clearing the new token', async t => {
  let finish, requested = false;
  const p = await pageFor(t,'account.html',{session:true,api:async (endpoint,route) => {
    if (endpoint === '/v1/profile') { requested=true; await new Promise(r=>finish=r); await route.fulfill({json:{...fixtures[endpoint],display_name:'旧账户迟到数据'}}); return true; }
    return false;
  }});
  await p.waitForFunction(() => document.querySelector('#planName').textContent === 'Pro');
  assert.ok(requested);
  await p.evaluate(()=>sessionStorage.setItem('dwgc2e.session',JSON.stringify({token:'replacement',expiresAt:'2099-01-01'})));
  finish(); await p.waitForTimeout(100);
  assert.notEqual(await p.locator('#profileName').textContent(),'旧账户迟到数据');
  assert.equal(await p.evaluate(()=>JSON.parse(sessionStorage.getItem('dwgc2e.session')).token),'replacement');
});
test('an older overlapping refresh expiring the session cannot leave a logged-in dashboard', async t => {
  let finishOld, finishNew, calls=0;
  const p = await pageFor(t,'account.html',{session:true,api:async (endpoint,route) => {
    if (endpoint !== '/v1/profile') return false;
    calls++;
    if (calls===1) { await new Promise(r=>finishOld=r); await route.fulfill({status:401,json:{error_code:'unauthenticated'}}); }
    else { await new Promise(r=>finishNew=r); await route.fulfill({json:fixtures[endpoint]}); }
    return true;
  }});
  await p.locator('#accountPanel:visible').waitFor();
  await p.locator('#refreshButton').click();
  await p.waitForTimeout(80);
  assert.equal(calls,2);
  finishOld();
  await p.waitForFunction(()=>!sessionStorage.getItem('dwgc2e.session'));
  finishNew(); await p.locator('#authPanel:visible').waitFor();
  assert.equal(await p.locator('#accountPanel').isVisible(),false);
});
