const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const root=path.resolve(__dirname,'..');let server,browser,origin;
before(async()=>{server=http.createServer((req,res)=>{const file=path.join(root,new URL(req.url,'http://local').pathname);fs.readFile(file,(e,b)=>{res.writeHead(e?404:200,{'content-type':({'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream'});res.end(e?'missing':b)})});await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({channel:'msedge',headless:true})});after(async()=>{await browser.close();await new Promise(r=>server.close(r))});
for(const width of [390,1440])test('user admin full interaction '+width,async t=>{
 const p=await browser.newPage({viewport:{width,height:900},timezoneId:'Asia/Shanghai'});t.after(()=>p.close());const errors=[];p.on('pageerror',e=>errors.push(e.message));
 let user={is_active:1,is_super:0,account_version:'[1,null,0,0]',underlying_plan_name:'pro',underlying_expires_at:'2099-01-01T00:00:00.000Z',id:'u1',account:'engineer',email:'engineer@example.test',display_name:'工程图纸翻译测试用户'.repeat(4),created_at:'2026-01-01T00:00:00Z',plan_name:'pro',membership:'active',expires_at:'2099-01-01T00:00:00.000Z',used:123456,monthly_quota:1000000,task_count:36,version:'v1'},history=[],fail=false,writes=0,requests=[],authenticated=false;
 await p.route('**/*',async r=>{const u=new URL(r.request().url());if(u.origin!==origin)return r.abort();if(!u.pathname.startsWith('/api/'))return r.continue();if(u.pathname==='/api/v1/admin/session'){const method=r.request().method();if(method==='POST'){assert.match(r.request().headers().authorization,/Bearer mock-admin/);authenticated=true;}if(method==='DELETE')authenticated=false;return r.fulfill({status:authenticated||method==='DELETE'?200:401,json:{authenticated}});}assert.equal(r.request().headers().authorization,undefined);if(!authenticated)return r.fulfill({status:401,json:{authenticated:false}});requests.push(u.href);
 if(r.request().method()==='POST'){writes++;if(fail)return r.fulfill({status:503,json:{message:'模拟保存失败，请重新读取确认'}});const d=r.request().postDataJSON();assert.equal(d.expires_at,'2099-02-01T00:00:00.000Z');user={...user,expires_at:d.expires_at,underlying_expires_at:d.expires_at,version:'v2'};history=[{...d,id:d.request_id,actor:'key:mock',created_at:new Date().toISOString(),before_snapshot:'["pro",null,"2099-01-01T00:00:00Z",0,"v1"]'}];return r.fulfill({json:{success:true}})}
 if(u.pathname.endsWith('/u1'))return r.fulfill({json:{user,usage:[{year_month:'2026-09',chars_used:123456,task_count:36}],history}});
 return r.fulfill({json:{summary:{total:1,members:1,used:123456,tasks:36},items:[user],total:1,page:1,pageSize:25,month:'2026-09',asOf:new Date().toISOString()}})
 });
 await p.goto(origin+'/admin-users.html');await p.locator('#userKey').fill('mock-admin-key-'.repeat(4));await p.locator('#userLogin button').click();await p.locator('#userWorkspace:visible').waitFor();assert.equal(await p.locator('#userNext').isDisabled(),true);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
 const out=process.env.AUDIT_OUTPUT||path.join(root,'artifacts','admin-users');fs.mkdirSync(out,{recursive:true});await p.screenshot({path:path.join(out,'users-'+width+'.png'),fullPage:true});
 await p.getByRole('button',{name:'查看详情'}).click();await p.locator('#detailContent:visible').waitFor();assert.equal(await p.locator('#editExpiry').inputValue(),'2099-01-01T08:00');await p.locator('#editExpiry').fill('2099-02-01T08:00');await p.locator('#editReason').fill('客服核实后给予补偿会员');
 p.once('dialog',d=>d.dismiss());await p.locator('#saveMembership').click();assert.equal(writes,0);
 fail=true;p.once('dialog',d=>d.accept());await p.locator('#saveMembership').click();await p.waitForFunction(()=>document.querySelector('#detailMessage').textContent.includes('模拟保存失败'));assert.equal(await p.locator('#editReason').inputValue(),'客服核实后给予补偿会员');
 fail=false;p.once('dialog',d=>d.accept());await p.locator('#saveMembership').click();await p.waitForFunction(()=>document.querySelector('#detailMessage').textContent.includes('会员修改已保存'));assert.equal(writes,2);await p.screenshot({path:path.join(out,'detail-'+width+'.png'),fullPage:true});assert.equal(await p.locator('#userDetail').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);
 await p.locator('#detailClose').click();await p.locator('#userSearch').fill('工程师');await p.locator('#userFilters button').click();await p.waitForFunction(()=>!document.querySelector('#userRefresh').disabled);assert.ok(requests.some(x=>new URL(x).searchParams.get('q')==='工程师'));await p.locator('#userLogout').click();await p.locator('#userGate:visible').waitFor();assert.equal(await p.locator('#userWorkspace').isVisible(),false);assert.equal(await p.locator('#userList').textContent(),'');assert.deepEqual(errors,[]);
});


test('user detail protects and clears unsaved membership drafts',async t=>{
 const p=await browser.newPage({viewport:{width:900,height:780},timezoneId:'Asia/Shanghai'});t.after(()=>p.close());
 const errors=[];p.on('pageerror',e=>errors.push(e.message));
 let authenticated=false,detailReads=0,dialogMode='dismiss',dialogs=0;
 const user={is_active:1,is_super:0,account_version:'[1,null,0,0]',underlying_plan_name:'pro',underlying_expires_at:'2099-01-01T00:00:00.000Z',id:'u1',account:'engineer',email:'engineer@example.test',display_name:'工程师',created_at:'2026-01-01T00:00:00Z',plan_name:'pro',membership:'active',expires_at:'2099-01-01T00:00:00.000Z',used:10,monthly_quota:1000,task_count:1,version:'v1'};
 p.on('dialog',async d=>{dialogs++;if(dialogMode==='accept')await d.accept();else await d.dismiss();});
 await p.route('**/*',async r=>{
   const u=new URL(r.request().url());if(u.origin!==origin)return r.abort();if(!u.pathname.startsWith('/api/'))return r.continue();
   if(u.pathname==='/api/v1/admin/session'){
     const method=r.request().method();if(method==='POST')authenticated=true;if(method==='DELETE')authenticated=false;
     return r.fulfill({status:authenticated||method==='DELETE'?200:401,json:{authenticated}});
   }
   if(!authenticated)return r.fulfill({status:401,json:{authenticated:false}});
   if(u.pathname.endsWith('/u1')){detailReads++;return r.fulfill({json:{user,usage:[],history:[]}});}
   return r.fulfill({json:{summary:{total:1,members:1,used:10,tasks:1},items:[user],total:1,page:1,pageSize:25,month:'2026-09',asOf:new Date().toISOString()}});
 });
 await p.goto(origin+'/admin-users.html');await p.locator('#userKey').fill('mock-admin-key-'.repeat(4));await p.locator('#userLogin button').click();await p.locator('#userWorkspace:visible').waitFor();
 await p.getByRole('button',{name:'查看详情'}).click();await p.locator('#detailContent:visible').waitFor();assert.equal(detailReads,1);

 // Changing only the expiry used to bypass the reload warning because the old code checked
 // whether the reason field was non-empty instead of tracking the form's actual dirty state.
 await p.locator('#editExpiry').fill('2099-03-01T08:00');dialogMode='dismiss';const beforeReload=dialogs;
 await p.locator('#detailReload').click();assert.equal(dialogs,beforeReload+1);assert.equal(detailReads,1);assert.equal(await p.locator('#editExpiry').inputValue(),'2099-03-01T08:00');

 dialogMode='accept';await p.locator('#detailReload').click();await p.waitForFunction(()=>document.querySelector('#editExpiry').value==='2099-01-01T08:00');assert.equal(detailReads,2);

 await p.locator('#editExpiry').fill('2099-04-01T08:00');dialogMode='dismiss';const beforeClose=dialogs;
 await p.locator('#detailClose').click();assert.equal(dialogs,beforeClose+1);assert.equal(await p.locator('#userDetail').evaluate(e=>e.open),true);

 dialogMode='accept';await p.locator('#detailClose').click();await p.waitForFunction(()=>!document.querySelector('#userDetail').open);
 const beforeLogout=dialogs;await p.locator('#userLogout').click();await p.locator('#userGate:visible').waitFor();assert.equal(dialogs,beforeLogout,'accepted close clears the discarded draft so logout does not warn again');
 assert.deepEqual(errors,[]);
});
