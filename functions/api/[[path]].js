// Fixed upstream only. Keeps browser API traffic on the website domain.
const upstreamOrigin = 'https://api.cad.pocketter.dpdns.org';
export async function onRequest({ request, env = {} }) {
 const incoming = new URL(request.url);
 const path = incoming.pathname.slice('/api'.length);
 const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
 const sessionAdmin = path==='/v1/admin/session' && ['GET','POST','DELETE'].includes(request.method);
 // Cookie-authenticated writes must originate on this exact site, not a sibling subdomain.
 if(path.startsWith('/v1/admin/')&&!['GET','HEAD','OPTIONS'].includes(request.method)&&request.headers.get('cookie')?.includes('__Secure-dwgc_admin=')&&request.headers.get('origin')!==incoming.origin)return new Response(JSON.stringify({message:'请求来源不匹配'}),{status:403,headers});
 const feedbackAdmin = (path === '/v1/admin/feedback' && request.method === 'GET') || (/^\/v1\/admin\/feedback\/[a-f0-9-]{36}$/.test(path) && request.method === 'POST');
 const plansAdmin = (path === '/v1/admin/plans' && request.method === 'GET') || (/^\/v1\/admin\/plans\/(free|pro|max|go)$/.test(path) && request.method === 'POST');
 const operationChangeRead = /^\/v1\/admin\/operations\/changes\/[-a-f0-9]{36}$/.test(path)&&request.method==='GET';
 const operationsAdmin = operationChangeRead || ( /^\/v1\/admin\/operations\/(settings|orders|devices|usage|feedback|audit)$/.test(path) && request.method==='GET') || (/^\/v1\/admin\/operations\/settings\/(release|content|controls)$/.test(path)&&request.method==='POST') || (['/v1/admin/operations/notes','/v1/admin/operations/compensations','/v1/admin/operations/devices/revoke'].includes(path)&&request.method==='POST');
 const usersAdmin = (path === '/v1/admin/users' && request.method === 'GET') || (/^\/v1\/admin\/users\/[a-zA-Z0-9_-]{1,100}$/.test(path) && request.method === 'GET') || (/^\/v1\/admin\/users\/[a-zA-Z0-9_-]{1,100}\/(membership|account)$/.test(path) && request.method === 'POST');
 // The Worker validates ADMIN_API_KEY independently; a browser account token never grants admin access.
 if (!path.startsWith('/v1/') || (path.startsWith('/v1/admin/') && !feedbackAdmin && !usersAdmin && !plansAdmin && !operationsAdmin && !sessionAdmin) || path.startsWith('/v1/billing/notify/')) {
  return new Response(JSON.stringify({error_code:'not_found',message:'接口不存在'}),{status:404,headers});
 }
 const target = new URL(upstreamOrigin); target.pathname = path; target.search = incoming.search;
 const forwarded = new Headers();
 for (const name of ['authorization','content-type','idempotency-key','accept']) {
  const value = request.headers.get(name); if (value) forwarded.set(name,value);
 }
 if(path.startsWith('/v1/admin/')){const value=(request.headers.get('cookie')||'').split(';').map(x=>x.trim()).filter(x=>/^__Secure-dwgc_admin=[a-f0-9]{64}$/.test(x)).join('; ');if(value)forwarded.set('cookie',value);}
 // Sign only the edge-provided identity; client-supplied attestations are never forwarded.
 const clientIp=request.headers.get('cf-connecting-ip')||'';
 if(env.WEB_PROXY_IDENTITY_KEY && /^[0-9a-fA-F:.]{3,64}$/.test(clientIp)) {
  const timestamp=String(Math.floor(Date.now()/1000));
  const payload=[timestamp,clientIp,request.method,target.pathname+target.search,forwarded.get('authorization')||''].join('\n');
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.WEB_PROXY_IDENTITY_KEY),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(payload))),b=>b.toString(16).padStart(2,'0')).join('');
  forwarded.set('x-dwgc-client-ip',clientIp);forwarded.set('x-dwgc-client-time',timestamp);forwarded.set('x-dwgc-client-signature',signature);
 } forwarded.set('origin','https://cad.pocketter.dpdns.org');
 try {
  const response = await fetch(target.href, {
   method:request.method,headers:forwarded,
   body:['GET','HEAD'].includes(request.method)?undefined:request.body,
   redirect:'manual',signal:AbortSignal.timeout(25000)
  });
  if (response.status>=300 && response.status<400) throw new Error('upstream_redirect');
  const resultHeaders = new Headers(headers);
  resultHeaders.set('content-type',response.headers.get('content-type')||'application/json');
  if(sessionAdmin){const cookie=response.headers.get('set-cookie');if(cookie)resultHeaders.set('set-cookie',cookie);}
  const retry = response.headers.get('retry-after');if(retry)resultHeaders.set('retry-after',retry);
  return new Response(response.body,{status:response.status,headers:resultHeaders});
 } catch {
  return new Response(JSON.stringify({error_code:'api_unreachable',message:'暂时无法连接账户服务，请稍后重试。下单请求请勿重复提交。'}),{status:502,headers});
 }
}
