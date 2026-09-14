// Fixed upstream only. Keeps browser API traffic on the website domain.
const upstreamOrigin = 'https://dwgc2e-api.maplehousezz.workers.dev';
export async function onRequest({ request }) {
 const incoming = new URL(request.url);
 const path = incoming.pathname.slice('/api'.length);
 const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
 if (!path.startsWith('/v1/') || path.startsWith('/v1/admin/') || path.startsWith('/v1/billing/notify/')) {
  return new Response(JSON.stringify({error_code:'not_found',message:'接口不存在'}),{status:404,headers});
 }
 const target = new URL(upstreamOrigin); target.pathname = path; target.search = incoming.search;
 const forwarded = new Headers();
 for (const name of ['authorization','content-type','idempotency-key','accept']) {
  const value = request.headers.get(name); if (value) forwarded.set(name,value);
 }
 forwarded.set('origin','https://cad.pocketter.dpdns.org');
 try {
  const response = await fetch(target.href, {
   method:request.method,headers:forwarded,
   body:['GET','HEAD'].includes(request.method)?undefined:request.body,
   redirect:'manual',signal:AbortSignal.timeout(25000)
  });
  if (response.status>=300 && response.status<400) throw new Error('upstream_redirect');
  const resultHeaders = new Headers(headers);
  resultHeaders.set('content-type',response.headers.get('content-type')||'application/json');
  const retry = response.headers.get('retry-after');if(retry)resultHeaders.set('retry-after',retry);
  return new Response(response.body,{status:response.status,headers:resultHeaders});
 } catch {
  return new Response(JSON.stringify({error_code:'api_unreachable',message:'暂时无法连接账户服务，请稍后重试。下单请求请勿重复提交。'}),{status:502,headers});
 }
}
