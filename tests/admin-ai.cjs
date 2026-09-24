const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
let server,browser,origin;
const provider={id:'provider-a',name:'主模型 A',base_url:'https://api.example.test/v1',model:'translation-model-a',enabled:true,weight:70,priority:10,timeout_ms:90000,max_failures:3,cooldown_seconds:60,temperature:.1,has_credential:true,credential_source:'encrypted_store',revision:4,updated_at:'2026-09-18T01:00:00Z',health:{consecutive_failures:0,last_success_at:'2026-09-18T01:00:00Z',last_failure_at:null,last_latency_ms:420,cooldown_until:null,last_error_code:null}};
const systemPrompt='这是一个用于工程图纸翻译的服务端系统提示词，必须保留格式、术语和占位符。';
const policy={profile:{id:'profile-a',name:'工程图纸策略',context_version:'ctx-test-1',active:1},policy:{id:'policy-a',version:'ctx-test-1',name:'工程图纸策略',system_prompt:systemPrompt,published:1,created_at:'2026-09-18T01:00:00Z'}};
before(async()=>{
 server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}fs.readFile(file,(error,data)=>{res.writeHead(error?404:200,{'content-type':({'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream'});res.end(error?'missing':data);});});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve)); origin='http://127.0.0.1:'+server.address().port; browser=await chromium.launch({channel:'msedge',headless:true});
});
after(async()=>{await browser?.close();await new Promise(resolve=>server?.close(resolve));});

for(const width of [390,1440]) test('AI admin module secure interaction '+width,async t=>{
 const context=await browser.newContext({viewport:{width,height:1000},timezoneId:'Asia/Shanghai'});const page=await context.newPage();t.after(()=>context.close());page.setDefaultTimeout(15000);
 const errors=[];let saves=[];let published=[];let tests=0;page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin!==origin)return route.abort();
  if(!url.pathname.startsWith('/api/'))return route.continue();
  const method=request.method();
  if(url.pathname==='/api/v1/admin/session') return route.fulfill({json:{authenticated:true}});
  assert.equal(await request.headerValue('authorization'),null,'admin session must use secure cookie, not a frontend token');
  if(url.pathname==='/api/v1/admin/ai/providers'&&method==='GET') return route.fulfill({json:{items:[provider]}});
  if(url.pathname==='/api/v1/admin/ai/policy'&&method==='GET') return route.fulfill({json:policy});
  if(url.pathname==='/api/v1/admin/ai/history'&&method==='GET') return route.fulfill({json:{profiles:[{id:'profile-a',name:'工程图纸策略',context_version:'ctx-test-1',active:1,created_at:'2026-09-18T01:00:00Z',updated_at:'2026-09-18T01:00:00Z'}],changes:[{id:'change-a',kind:'profile_publish',target_id:'profile-a',actor:'admin',reason:'初始化测试策略',created_at:'2026-09-18T01:00:00Z',after_json:JSON.stringify({context_version:'ctx-test-1'})}]}});
  if(url.pathname==='/api/v1/admin/ai/providers/provider-a/test'&&method==='POST'){tests++;return route.fulfill({json:{success:true,latency_ms:420,context_version:'ctx-test-1'}});}
  if(url.pathname==='/api/v1/admin/ai/providers'&&method==='POST'){const body=request.postDataJSON();saves.push(body);assert.equal(body.api_key,'fake-secret-must-not-persist');return route.fulfill({status:201,json:{...provider,id:'provider-new',name:body.name,revision:1}});}
  if(url.pathname==='/api/v1/admin/ai/publish'&&method==='POST'){const body=request.postDataJSON();published.push(body);assert.equal(body.system_prompt,'这是新的服务端策略提示词，必须保留工程图纸中的格式、术语、占位符、编号和换行结构。');return route.fulfill({json:{success:true,context_version:body.context_version}});}
  return route.fulfill({status:404,json:{message:'mock route not found'}});
 });
 await page.goto(origin+'/admin-ai.html');await page.locator('#userWorkspace:visible').waitFor();
 assert.equal(await page.locator('nav[aria-label="后台模块"] a[aria-current="page"]').textContent(),'AI 路由');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'no horizontal overflow');
 assert.equal(await page.evaluate(()=>document.body.innerText.includes('fake-secret-must-not-persist')),false);
 const stored=await page.evaluate(()=>({local:[...Array(localStorage.length)].map((_,i)=>{const key=localStorage.key(i);return[key,localStorage.getItem(key)];}),session:[...Array(sessionStorage.length)].map((_,i)=>{const key=sessionStorage.key(i);return[key,sessionStorage.getItem(key)];})}));
 assert.deepEqual(stored.local,[]);
 assert.equal(JSON.stringify(stored).includes('fake-secret-must-not-persist'),false);
 assert.ok([...stored.local,...stored.session].every(([key,value])=>!/(token|password|secret|api[_-]?key|credential)/i.test(key+' '+value)),'browser storage must not retain credentials or secret material');
 assert.equal(await page.locator('.ai-provider-row').count(),1);
 await page.locator('#providerNew').click();await page.locator('#providerForm:visible').waitFor();
 await page.locator('#providerName').fill('备用模型 B');await page.locator('#providerBaseUrl').fill('https://backup.example.test/v1');await page.locator('#providerModel').fill('translation-model-b');await page.locator('#providerApiKey').fill('fake-secret-must-not-persist');await page.locator('#providerReason').fill('添加备用翻译模型');await page.locator('#providerForm button[type=submit]').click();
 await page.waitForFunction(()=>document.querySelector('#providerMessage').textContent.includes('已保存模型服务'));
 assert.equal(saves.length,1);assert.equal(await page.locator('#providerApiKey').inputValue(),'','API key input must be cleared after submit');assert.equal(await page.locator('#providerSecretName').inputValue(),'');
 await page.locator('.ai-provider-row button', {hasText:'测试'}).click();await page.waitForFunction(()=>document.querySelector('#providerMessage').textContent.includes('连接成功'));assert.equal(tests,1);
 await page.locator('#policyName').fill('新策略');await page.locator('#policyVersion').fill('ctx-test-2');await page.locator('#policyPrompt').fill('这是新的服务端策略提示词，必须保留工程图纸中的格式、术语、占位符、编号和换行结构。');await page.locator('#policyReason').fill('更新格式保护规则');await page.locator('#policyPublish').click();await page.waitForFunction(()=>document.querySelector('#policyMessage').textContent.includes('已发布'));assert.equal(published.length,1);
 assert.deepEqual(errors,[]);
});


