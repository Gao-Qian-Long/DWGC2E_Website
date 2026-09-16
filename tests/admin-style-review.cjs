// Isolated admin presentation and paid-tier expiry regression. No external network.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');let browser;
before(async()=>browser=await chromium.launch({channel:'msedge',headless:true}));after(async()=>browser.close());
for(const width of [390,1440])test('admin consistency, recovery and Max expiry '+width,async t=>{
 const ctx=await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Shanghai'});t.after(()=>ctx.close());const p=await ctx.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));let fail=false,posted;
 const user={id:'local',account:'review-only',email:'local@example.test',display_name:'长名称工程图纸测试'.repeat(8),plan_name:'pro',membership:'active',expires_at:'2099-01-01T00:00:00Z',used:10,monthly_quota:1000,task_count:1,version:'v1'};
 await ctx.route('**/*',async r=>{const u=new URL(r.request().url());if(u.hostname!=='review.local')return r.abort();if(u.pathname.startsWith('/api/')){
  if(u.pathname.endsWith('/session'))return r.fulfill({json:{authenticated:true}});
  if(r.request().method()==='POST'){posted=r.request().postDataJSON();return r.fulfill({status:503,json:{message:'隔离测试：保存失败，输入应保留'}});}
  if(fail)return r.fulfill({status:503,json:{message:'暂不可用，请重新读取。'.repeat(15)}});
  let data={items:[{id:'fixture',message:'长反馈内容'.repeat(80),status:'new',account:user.account}],hasMore:false};
  if(u.pathname.endsWith('/settings'))data={items:['release','content','controls'].map(section=>({section,version:'v1',value:{latest_version:'2.1.1',download_url:'https://example.test/local.zip',device_wait_days:20,announcement:'长公告'.repeat(40)}}))};
  if(u.pathname.endsWith('/plans'))data={plans:['free','pro','max','go'].map(id=>({id,name:id,price_cents:2,quota:1000,duration_days:30,enabled:true,version:'v1'})),history:[]};
  if(u.pathname.includes('/users'))data=u.pathname.endsWith('/local')?{user,usage:[],history:[],addons:[],compensations:[],month:'2026-09'}:{summary:{total:1,members:1,used:10,tasks:1},items:[user],total:1,page:1,month:'2026-09',asOf:'2026-09-16'};
  return r.fulfill({json:data});
 }const f=path.resolve(root,'.'+u.pathname);if(!f.startsWith(root+path.sep)||!fs.existsSync(f))return r.abort();return r.fulfill({contentType:({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'})[path.extname(f)]||'application/octet-stream',body:fs.readFileSync(f)});});
 const modules=['users','plans','orders','devices','usage','release','content','controls','feedback','audit'];
 for(const module of modules){await p.goto('https://review.local/admin-'+module+'.html');await p.locator('#userWorkspace:visible').waitFor();await p.waitForFunction(()=>![...document.querySelectorAll('#userMessage,#opsMessage,#planMessage')].some(e=>e.textContent.includes('正在读取')));await p.evaluate(()=>document.fonts.ready);
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,module);
  const bad=await p.locator('.admin-module-nav a,.admin-session-bar,.ops-form input:not([type=checkbox]),.ops-form textarea,.ops-form select,.plan-config input:not([type=checkbox])').evaluateAll(es=>es.filter(e=>e.getClientRects().length&&parseFloat(getComputedStyle(e).fontSize)<15).map(e=>e.outerHTML));assert.deepEqual(bad,[],module);
  assert.equal(await p.locator('.admin-module-nav a[aria-current=page]').count(),1);
  const fields=await p.locator('.ops-form textarea,.plan-config input:not([type=checkbox])').evaluateAll(es=>es.map(e=>({radius:getComputedStyle(e).borderRadius,bg:getComputedStyle(e).backgroundColor})));for(const field of fields){assert.equal(field.radius,'2px');assert.equal(field.bg,'rgb(255, 252, 245)');}
  if(process.env.AUDIT_OUTPUT){fs.mkdirSync(process.env.AUDIT_OUTPUT,{recursive:true});await p.screenshot({path:path.join(process.env.AUDIT_OUTPUT,`review-${module}-${width}.png`),fullPage:true});}
 }
 await p.goto('https://review.local/admin-release.html');await p.locator('[name=latest_version]').waitFor();fail=true;await p.locator('#opsRefresh').click();await p.waitForFunction(()=>document.querySelector('#opsMessage').textContent.includes('暂不可用'));assert.equal(await p.locator('#opsRefresh').isEnabled(),true);assert.equal(await p.locator('[name=latest_version]').inputValue(),'2.1.1');assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);fail=false;await p.locator('#opsRefresh').click();await p.waitForFunction(()=>document.querySelector('#opsMessage').textContent==='');
 await p.goto('https://review.local/admin-users.html');await p.getByRole('button',{name:'查看详情'}).click();await p.locator('#detailContent:visible').waitFor();await p.locator('#editPlan').selectOption('max');await p.locator('#editExpiry').fill('2099-02-01T08:00');await p.locator('#editReason').fill('本地校验付费会员日期');p.once('dialog',d=>d.accept());await p.locator('#saveMembership').click();await p.waitForTimeout(400);assert.ok(posted,JSON.stringify({errors,message:await p.locator('#detailMessage').textContent(),valid:await p.locator('#membershipForm').evaluate(e=>e.checkValidity())}));assert.equal(posted.plan_name,'max');assert.equal(posted.expires_at,'2099-02-01T00:00:00.000Z');assert.equal(await p.locator('#editExpiry').inputValue(),'2099-02-01T08:00');assert.deepEqual(errors,[]);
});
