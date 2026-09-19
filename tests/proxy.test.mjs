import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8').replace('export async function','async function');
function setup(fetch){const ctx={URL,Headers,Response,AbortSignal,fetch,crypto,TextEncoder};vm.runInNewContext(code+';globalThis.proxy=onRequest;',ctx);return ctx.proxy;}
test('proxy blocks unrelated admin endpoints and payment notifications',async()=>{const proxy=setup(()=>{throw Error('must not forward')});for(const path of ['/v1/admin/secrets','/v1/admin/billing/recovery','/v1/billing/notify/ezfpy'])assert.equal((await proxy({request:new Request('https://site.test/api'+path)})).status,404);});
test('feedback administration forwards credential only to fixed upstream and preserves server denial',async()=>{const proxy=setup(async(url,options)=>{assert.equal(url,'https://api.cad.pocketter.dpdns.org/v1/admin/feedback');assert.equal(options.headers.get('authorization'),'Bearer ordinary-account-token');assert.equal(options.headers.get('x-admin-role'),null);assert.equal(options.headers.get('x-forwarded-for'),null);return Response.json({message:'管理员验证失败'},{status:401})});const response=await proxy({request:new Request('https://site.test/api/v1/admin/feedback',{headers:{authorization:'Bearer ordinary-account-token','x-admin-role':'admin','x-forwarded-for':'spoofed'}})});assert.equal(response.status,401);});
test('admin write path and method are restricted to feedback UUID status operation',async()=>{let forwarded=0;const proxy=setup(async()=>{forwarded++;return Response.json({success:true})});const id='12345678-1234-1234-1234-123456789012';assert.equal((await proxy({request:new Request('https://site.test/api/v1/admin/feedback/'+id,{method:'POST',body:'{}'})})).status,200);assert.equal((await proxy({request:new Request('https://site.test/api/v1/admin/feedback/'+id,{method:'DELETE'})})).status,404);assert.equal(forwarded,1);});
test('upstream redirects never send admin bearer to a redirected destination',async()=>{const proxy=setup(async()=>new Response(null,{status:302,headers:{location:'https://untrusted.test/'}}));assert.equal((await proxy({request:new Request('https://site.test/api/v1/admin/feedback')})).status,502);});
test('user administration allows only directory, detail and membership update; ordinary bearer still denied by Worker',async()=>{let n=0;const proxy=setup(async(url,options)=>{n++;assert.ok(url.startsWith('https://api.cad.pocketter.dpdns.org/v1/admin/users'));assert.equal(options.headers.get('authorization'),'Bearer ordinary');return Response.json({message:'管理员验证失败'},{status:401})});for(const [path,method] of [['','GET'],['/u1','GET'],['/u1/membership','POST']])assert.equal((await proxy({request:new Request('https://site.test/api/v1/admin/users'+path,{method,headers:{authorization:'Bearer ordinary'}})})).status,401);for(const [path,method] of [['','POST'],['/u1','DELETE'],['/u1/membership','GET'],['/u1/password','POST']])assert.equal((await proxy({request:new Request('https://site.test/api/v1/admin/users'+path,{method})})).status,404);assert.equal(n,3)});

test('same-zone attribution uses only edge CF address and strips spoofed forwarding headers',async()=>{
 for(const clientIp of ['203.0.113.21','2001:db8::22']) {
 const proxy=setup(async(url,options)=>{
 assert.equal(new URL(url).origin,'https://api.cad.pocketter.dpdns.org');
 assert.equal(options.headers.get('x-real-ip'),null);
 assert.equal(options.headers.get('x-dwgc-client-ip'),clientIp);assert.match(options.headers.get('x-dwgc-client-signature'),/^[a-f0-9]{64}$/);
 for(const name of ['x-forwarded-for','forwarded','true-client-ip','cf-connecting-ip'])assert.equal(options.headers.get(name),null);
 return Response.json({ok:true});
 });
 await proxy({env:{WEB_PROXY_IDENTITY_KEY:'test-key-'.repeat(8)},request:new Request('https://site.test/api/v1/health',{headers:{'cf-connecting-ip':clientIp,'x-real-ip':'attacker','x-forwarded-for':'attacker','forwarded':'for=attacker','true-client-ip':'attacker'}})});
 }
});
test('missing edge identity never falls back to attacker-controlled forwarding headers',async()=>{
 const proxy=setup(async(url,options)=>{assert.equal(options.headers.get('x-real-ip'),null);assert.equal(options.headers.get('x-forwarded-for'),null);return Response.json({ok:true});});
 await proxy({request:new Request('https://site.test/api/v1/health',{headers:{'x-real-ip':'attacker','x-forwarded-for':'attacker'}})});
});test('admin sessions forward scoped cookies and preserve login/logout Set-Cookie only',async()=>{
 const cookie='__Secure-dwgc_admin='+'a'.repeat(64),set=cookie+'; Path=/api/v1/admin; HttpOnly; Secure; SameSite=Strict';
 const proxy=setup(async(url,options)=>{assert.equal(options.headers.get('cookie'),new URL(url).pathname.startsWith('/v1/admin/')?cookie:null);return Response.json({ok:true},{headers:{'set-cookie':set}});});
 for(const path of ['/v1/admin/session','/v1/admin/users','/v1/site']){const r=await proxy({request:new Request('https://site.test/api'+path,{headers:{cookie:cookie+'; unrelated=private'}})});assert.equal(r.headers.get('set-cookie'),path.endsWith('/session')?set:null);}
});
test('cookie writes reject missing and sibling Origin before forwarding',async()=>{
 let calls=0;const proxy=setup(async()=>{calls++;return Response.json({ok:true});});
 for(const origin of ['', 'https://sibling.site.test','https://site.test']){const r=await proxy({request:new Request('https://site.test/api/v1/admin/session',{method:'DELETE',headers:{cookie:'__Secure-dwgc_admin='+'b'.repeat(64),...(origin?{origin}:{})}})});assert.equal(r.status,origin==='https://site.test'?200:403);}assert.equal(calls,1);
});

test('device force revoke proxy permits POST only; cross-origin cookie writes blocked',async()=>{
 let n=0;const proxy=setup(async(url)=>{n++;assert.equal(url,'https://api.cad.pocketter.dpdns.org/v1/admin/operations/devices/revoke');return Response.json({message:'管理员验证失败'},{status:401});});
 const url='https://site.test/api/v1/admin/operations/devices/revoke';
 assert.equal((await proxy({request:new Request(url,{method:'POST',headers:{authorization:'Bearer ordinary'}})})).status,401);
 assert.equal((await proxy({request:new Request(url)})).status,404);
 assert.equal((await proxy({request:new Request(url,{method:'POST',headers:{cookie:'__Secure-dwgc_admin='+'a'.repeat(64),origin:'https://evil.test'}})})).status,403);assert.equal(n,1);
});

test('model routing administration forwards every admin-ai endpoint the console calls',async()=>{
 const forwarded=[];
 const proxy=setup(async(url,options)=>{forwarded.push(new URL(url).pathname+' '+options.method);return Response.json({ok:true});});
 const cookie='__Secure-dwgc_admin='+'a'.repeat(64);
 const calls=[
  ['/v1/admin/ai/providers','GET',200],
  ['/v1/admin/ai/policy','GET',200],
  ['/v1/admin/ai/history','GET',200],
  ['/v1/admin/ai/providers','POST',200],
  ['/v1/admin/ai/providers/p1','PUT',200],
  ['/v1/admin/ai/providers/p1/test','POST',200],
  ['/v1/admin/ai/providers/p1','DELETE',200],
  ['/v1/admin/ai/publish','POST',200],
  ['/v1/admin/ai/rollback','POST',200]
 ];
 for(const [path,method,status] of calls){
  const response=await proxy({request:new Request('https://site.test/api'+path,{method,headers:{cookie,origin:'https://site.test'}})});
  assert.equal(response.status,status,method+' '+path);
 }
 assert.deepEqual(forwarded,[
  '/v1/admin/ai/providers GET','/v1/admin/ai/policy GET','/v1/admin/ai/history GET',
  '/v1/admin/ai/providers POST','/v1/admin/ai/providers/p1 PUT','/v1/admin/ai/providers/p1/test POST',
  '/v1/admin/ai/providers/p1 DELETE','/v1/admin/ai/publish POST','/v1/admin/ai/rollback POST'
 ]);
});

test('model routing administration still refuses cross-origin writes, other methods and unrelated admin paths',async()=>{
 let forwarded=0;const proxy=setup(async()=>{forwarded++;return Response.json({ok:true});});
 const cookie='__Secure-dwgc_admin='+'a'.repeat(64),same='https://site.test';
 assert.equal((await proxy({request:new Request('https://site.test/api/v1/admin/ai/providers',{method:'POST',headers:{cookie,origin:'https://evil.test'}})})).status,403);
 assert.equal((await proxy({request:new Request('https://site.test/api/v1/admin/ai/providers',{method:'POST',headers:{cookie}})})).status,403);
 assert.equal((await proxy({request:new Request('https://site.test/api/v1/admin/ai/providers',{method:'PATCH',headers:{cookie,origin:same}})})).status,404);
 // The allowlist must match the '/v1/admin/ai/' path segment, not a lookalike prefix or sibling module.
 assert.equal((await proxy({request:new Request('https://site.test/api/v1/admin/ai-evil/providers',{method:'GET',headers:{cookie,origin:same}})})).status,404);
 assert.equal((await proxy({request:new Request('https://site.test/api/v1/admin/ai/../secrets',{method:'GET',headers:{cookie,origin:same}})})).status,404);
 assert.equal((await proxy({request:new Request('https://site.test/api/v1/admin/secrets',{method:'GET',headers:{cookie,origin:same}})})).status,404);
 assert.equal(forwarded,0);
});

