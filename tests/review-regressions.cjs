// Review regressions: real page scripts and CSP, entirely intercepted local fixtures.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),origin='https://review.test';let browser;
const csp=fs.readFileSync(path.join(root,'_headers'),'utf8').match(/Content-Security-Policy: (.+)/)[1];
before(async()=>{browser=await chromium.launch({channel:'msedge',headless:true});});
after(async()=>{await browser?.close();});
async function pageFor(t,file,api,emptyDownload=false){
 const p=await browser.newPage();p.setDefaultTimeout(5000);const errors=[];
 p.on('pageerror',e=>errors.push(e.message));t.after(async()=>{await p.close();assert.deepEqual(errors,[]);});
 await p.addInitScript(()=>sessionStorage.setItem('dwgc2e.session',JSON.stringify({token:'fixture',expiresAt:'2099-01-01'})));
 await p.route('**/*',async r=>{
  const u=new URL(r.request().url());if(u.origin!==origin)return r.abort();
  if(u.pathname.startsWith('/api/')){const result=await api?.(u,r);if(result)return;return r.fulfill({json:u.pathname.endsWith('/profile')?{user_id:'review'}:u.pathname.endsWith('/health')?{api:'operational',database:'operational'}:{}});}
  const f=path.resolve(root,'.'+u.pathname);if(!f.startsWith(root+path.sep)||!fs.existsSync(f))return r.fulfill({status:404,body:''});
  let body=fs.readFileSync(f);if(emptyDownload&&u.pathname==='/js/site-config.js')body=Buffer.from("window.DWGC2E_SITE={apiBaseUrl:'/api',downloadUrl:''};");
  return r.fulfill({body,headers:{'content-security-policy':csp},contentType:({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.webp':'image/webp','.png':'image/png'})[path.extname(f)]||'application/octet-stream'});
 });await p.goto(origin+'/'+file);return p;
}
const config=url=>({release:{latest_version:'test',download_url:url},content:{},controls:{}});
test('managed download activates a previously disabled static link',async t=>{
 const p=await pageFor(t,'index.html',async(u,r)=>{if(!u.pathname.endsWith('/site'))return false;await r.fulfill({json:config('https://download.test/app')});return true;},true);
 await p.waitForFunction(()=>document.querySelector('[data-download]').href==='https://download.test/app');
 assert.equal(await p.locator('[data-download]').first().evaluate(el=>{let prevented;el.addEventListener('click',e=>{prevented=e.defaultPrevented;e.preventDefault();},{once:true});el.click();return prevented;}),false);
});
test('authoritative empty download revokes old links on a restored page',async t=>{
 let url='https://download.test/app',reads=0;
 const p=await pageFor(t,'index.html',async(u,r)=>{if(!u.pathname.endsWith('/site'))return false;reads++;await r.fulfill({json:config(url)});return true;});
 await p.waitForFunction(()=>document.querySelector('[data-download]').href==='https://download.test/app');url='';
 await p.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
 await p.waitForFunction(()=>document.querySelector('[data-download]').getAttribute('aria-disabled')==='true');
 assert.ok(reads>=2);assert.equal(await p.locator('[data-download]').first().getAttribute('target'),null);
 assert.equal(await p.locator('[data-download]').first().evaluate(el=>{let prevented;el.addEventListener('click',e=>{prevented=e.defaultPrevented;e.preventDefault();},{once:true});el.click();return prevented;}),true);
});
test('malformed history refresh preserves the last loaded records',async t=>{
 let malformed=null;
 const p=await pageFor(t,'history.html',async(u,r)=>{if(!u.pathname.endsWith('/translation/history'))return false;await r.fulfill({json:malformed||{items:[{id:'task',file_name:'保留的任务',status:'completed'}],nextCursor:null}});return true;});
 await p.getByText('保留的任务',{exact:true}).waitFor();
 for(const invalid of [{unexpected:true},{items:[null]},{items:[[]]},{items:[],nextCursor:42}]){
  malformed=invalid;await p.locator('#retryHistory').click();
  await p.waitForFunction(()=>document.querySelector('#historyMessage').classList.contains('error'));
  assert.match(await p.locator('#historyList').textContent(),/保留的任务/);
 }
});
test('refreshing cloud glossary can cancel discarding an unsaved edit',async t=>{
 let reads=0;const p=await pageFor(t,'terminology.html',async(u,r)=>{if(!u.pathname.endsWith('/glossary'))return false;reads++;await r.fulfill({json:{entries:[],revision:'r1'}});return true;});
 await p.locator('#glossaryForm [name=source]').fill('未保存');
 p.once('dialog',d=>d.dismiss());await p.locator('#syncGlossary').click();
 assert.equal(await p.locator('#glossaryForm [name=source]').inputValue(),'未保存');assert.equal(reads,1);
});
test('glossary import validates merged total before issuing a write',async t=>{
 let writes=0;const entries=Array.from({length:1000},(_,i)=>({id:'row-'+i,source:'source'+i,target:'target'+i}));
 const p=await pageFor(t,'terminology.html',async(u,r)=>{if(!u.pathname.endsWith('/glossary'))return false;if(r.request().method()==='PUT'){writes++;await r.fulfill({status:400,json:{message:'limit'}});}else await r.fulfill({json:{entries,revision:'r1'}});return true;});
 await p.waitForFunction(()=>!document.querySelector('#importGlossary').disabled);
 await p.locator('#importGlossary').setInputFiles({name:'new.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify([{source:'extra',target:'new'}]))});
 await p.waitForFunction(()=>document.querySelector('#glossaryMessage').classList.contains('error'));
 assert.equal(writes,0);assert.equal(await p.locator('#saveGlossary').isEnabled(),true);assert.match(await p.locator('#glossaryMessage').textContent(),/1000/);
});

test('homepage toast and scripts are not trapped inside the closed lightbox',async t=>{
 const p=await pageFor(t,'index.html');
 assert.equal(await p.locator('#lightbox .toast, #lightbox script').count(),0);
 assert.equal(await p.locator('body > .toast').count(),1);
});
