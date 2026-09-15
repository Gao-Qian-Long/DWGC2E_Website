import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../js/api-client.js',import.meta.url),'utf8');
function setup(fetch) {
 const data=new Map([['dwgc2e.session',JSON.stringify({token:'old'})]]);
 const storage={getItem:k=>data.get(k)||null,removeItem:k=>data.delete(k),setItem:(k,v)=>data.set(k,v)};
 const context={window:{DWGC2E_SITE:{apiBaseUrl:'/api'}},sessionStorage:storage,fetch,AbortController,FormData,setTimeout,clearTimeout,TypeError,console};
 vm.runInNewContext(source,context);return {api:context.window.DWGC2E_API,storage};
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
