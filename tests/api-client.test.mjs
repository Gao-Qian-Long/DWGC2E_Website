import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../js/api-client.js',import.meta.url),'utf8');
function setup(fetch) {
 const data=new Map([['dwgc2e.session',JSON.stringify({token:'old'})]]);
 const storage={getItem:k=>data.get(k)||null,removeItem:k=>data.delete(k),setItem:(k,v)=>data.set(k,v)};
 const context={window:{QLCAD_SITE:{apiBaseUrl:'/api'}},sessionStorage:storage,fetch,AbortController,FormData,setTimeout,clearTimeout,TypeError,console};
 vm.runInNewContext(source,context);return {api:context.window.QLCAD_API,storage};
}
test('web login uses scoped endpoint without bearer or device data',async()=>{const x=setup(async(path,options)=>{assert.equal(path,'/api/v1/auth/web/login');assert.equal(options.headers.Authorization,undefined);assert.deepEqual(JSON.parse(options.body),{account:'a',password:'p'});return Response.json({token:'new'});});await x.api.auth.login({account:'a',password:'p'});});
test('incorrect password does not discard existing account session',async()=>{const x=setup(async()=>Response.json({error_code:'invalid_credentials'},{status:401}));await assert.rejects(x.api.auth.login({}),e=>e.code==='invalid_credentials'&&!e.authExpired);assert.ok(x.storage.getItem('dwgc2e.session'));});
test('protected session expiry clears only matching session',async()=>{const x=setup(async()=>Response.json({error_code:'unauthenticated'},{status:401}));await assert.rejects(x.api.account.profile(),e=>e.authExpired===true);assert.equal(x.storage.getItem('dwgc2e.session'),null);});
test('unrelated admin 401 never clears user session',async()=>{const x=setup(async()=>Response.json({error_code:'unauthorized'},{status:401}));await assert.rejects(x.api.request('/v1/admin/feedback'),e=>!e.authExpired);assert.ok(x.storage.getItem('dwgc2e.session'));});
test('late response cannot update or clear replacement session',async()=>{const x=setup(async()=>{x.storage.setItem('dwgc2e.session',JSON.stringify({token:'new'}));return Response.json({error_code:'unauthenticated'},{status:401});});await assert.rejects(x.api.account.profile(),e=>e.code==='session_changed');assert.equal(JSON.parse(x.storage.getItem('dwgc2e.session')).token,'new');});
test('caller cancellation remains cancellation, not request timeout',async()=>{const x=setup(async(_,options)=>{assert.equal(options.signal.aborted,true);throw Object.assign(new Error('abort'),{name:'AbortError'});});const controller=new AbortController();controller.abort();await assert.rejects(x.api.request('/v1/profile',{signal:controller.signal}),e=>e.code==='request_cancelled');});
test('logout is server-side and uses current bearer',async()=>{const x=setup(async(path,options)=>{assert.equal(path,'/api/v1/auth/logout');assert.equal(options.method,'POST');assert.equal(options.headers.Authorization,'Bearer old');return Response.json({success:true});});await x.api.auth.logout();});
test('explicit alternate bearer cannot clear the saved account session',async()=>{const x=setup(async(_,options)=>{assert.equal(options.headers.authorization,'Bearer other');assert.equal(options.headers.Authorization,undefined);return Response.json({error_code:'unauthenticated'},{status:401});});await assert.rejects(x.api.request('/v1/profile',{headers:{authorization:'Bearer other'}}),e=>!e.authExpired);assert.ok(x.storage.getItem('dwgc2e.session'));});
test('registration and recovery never carry a saved login bearer',async()=>{const x=setup(async(_,options)=>{assert.equal(options.headers.Authorization,undefined);return Response.json({success:true});});for(const method of ['register','requestRegisterCode','requestPasswordCode','resetPassword'])await x.api.auth[method]({});});
test('password form supplies the current password required by the server',()=>{const html=readFileSync(new URL('../profile.html',import.meta.url),'utf8');assert.match(html,/name="current_password"[^>]*required/);assert.equal((html.match(/id="emailPolicy"/g)||[]).length,1);});

test('feedback supports anonymous visitors and never sends account bearer',async()=>{const x=setup(async(p,o)=>{assert.equal(o.headers.Authorization,undefined);return Response.json({id:'local'});});x.storage.removeItem('dwgc2e.session');assert.equal((await x.api.feedback.submit({message:'卡'})).id,'local');});
test('successful malformed response cannot be mistaken for saved data',async()=>{const x=setup(async()=>new Response('not json',{status:200}));await assert.rejects(x.api.profileManagement.update({display_name:'a'}),e=>e.code==='invalid_response');});
test('checkout conflict returns the existing owned order for recovery',async()=>{const order={orderNo:'DW'+'a'.repeat(32),planId:'pro',channel:'alipay'};const x=setup(async()=>Response.json({error_code:'payment_order_pending',message:'existing',order},{status:409}));await assert.rejects(x.api.billing.checkout({planId:'max',channel:'alipay'},'new-purchase-key-0001'),e=>e.code==='payment_order_pending'&&e.order.orderNo===order.orderNo);});

test('successful JSON primitives and null envelopes cannot acknowledge a write',async()=>{
 for(const body of [null,true,42,'ok',{data:null}]) {
  const x=setup(async()=>Response.json(body));
  await assert.rejects(x.api.feedback.submit({message:'test'}),e=>e.code==='invalid_response');
 }
});
test('null error body preserves HTTP status instead of masquerading as a network failure',async()=>{
 const x=setup(async()=>Response.json(null,{status:503}));
 await assert.rejects(x.api.account.profile(),e=>e.status===503&&e.code!=='network_error');
});
