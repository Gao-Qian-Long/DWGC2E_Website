(() => {
 'use strict';
 const api=window.DWGC2E_API,$=s=>document.querySelector(s),money=n=>`¥${(n/100).toFixed(2)}`;
 const node=(tag,text,cls)=>{const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n;};
 const say=(text,error=false)=>{$('#portalMessage').textContent=text;$('#portalMessage').className=`form-message${error?' error':''}`;};
 let current=null,timer=null,failures=0,busy=false,pending=null,nextCursor=null,stopped=false;
 const savedKey='dwgc2e.payment.pending';
 try{pending=JSON.parse(sessionStorage.getItem(savedKey)||'null');}catch{}
 const validPending=p=>p&&typeof p==='object'&&typeof p.planId==='string'&&['alipay','wxpay'].includes(p.channel)&&typeof p.key==='string'&&/^[a-zA-Z0-9_-]{16,80}$/.test(p.key);
 if(pending&&!validPending(pending)){pending=null;try{sessionStorage.removeItem(savedKey);}catch{}}
 const save=()=>{try{if(pending)sessionStorage.setItem(savedKey,JSON.stringify(pending));else sessionStorage.removeItem(savedKey);}catch{}};
 const stop=()=>{clearTimeout(timer);timer=null;};
 const statusText=o=>o.status==='paid'?'支付成功，Pro 已开通':o.createState==='unknown'?('创建结果待确认，请勿重复付款，请联系管理员核查'+(o.errorCode?'（'+o.errorCode+'）':'')):o.createState==='creating'?'正在确认平台订单':o.status!=='pending'?o.status:'等待支付确认';
 async function member(){const [s,u]=await Promise.all([api.account.subscription(),api.account.usage()]);$('#membership').textContent=`当前套餐：${s.plan_name} · ${s.expires_at?'到期 '+new Date(s.expires_at).toLocaleString():'无付费有效期'} · 已用 ${Number(u.used).toLocaleString()} / ${Number(u.monthly_quota).toLocaleString()} 字符`;}
 function renderQr(o){const box=$('#qrBox');box.replaceChildren();if(o.status==='pending'&&o.createState!=='ready'){box.append(node('p',o.createState==='unknown'?'暂未获取到可用二维码，请勿重复下单或付款。':'正在确认平台订单，暂未获取二维码。'));return;}if(o.status!=='pending'||Date.parse(o.expiresAt)<=Date.now())return;
  if(o.qrCode){try{const qr=qrcode(0,'M');qr.addData(o.qrCode);qr.make();const count=qr.getModuleCount(),scale=Math.max(2,Math.floor(240/(count+8))),canvas=document.createElement('canvas');canvas.width=canvas.height=(count+8)*scale;canvas.setAttribute('role','img');canvas.setAttribute('aria-label','支付二维码');const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#000';for(let y=0;y<count;y++)for(let x=0;x<count;x++)if(qr.isDark(y,x))ctx.fillRect((x+4)*scale,(y+4)*scale,scale,scale);box.append(canvas);return;}catch{box.append(node('p','二维码生成失败，请联系管理员，不要重复下单。'));}}
  else if(o.qrCodeImageUrl){try{const url=new URL(o.qrCodeImageUrl);if(url.protocol!=='https:'||url.username||url.password)throw Error();const img=document.createElement('img');img.src=url.href;img.alt='支付二维码';img.referrerPolicy='no-referrer';img.onerror=()=>box.replaceChildren(node('p','二维码图片加载失败，请联系管理员。'));box.append(img);}catch{box.append(node('p','二维码地址无效'));}}
 }
 function show(o){stop();current=o;$('#checkout').hidden=false;$('#checkoutTitle').textContent=o.planName;$('#paymentAmount').textContent=money(o.payableCents);$('#paymentChannel').textContent=o.channel==='wxpay'?'请使用微信扫码':'请使用支付宝扫码';$('#orderNo').textContent=o.orderNo;$('#paymentStatus').textContent=statusText(o);const left=Math.max(0,Math.ceil((Date.parse(o.expiresAt)-Date.now())/1000));$('#countdown').textContent=left?`本地付款窗口剩余 ${Math.floor(left/60)} 分 ${left%60} 秒`:'付款窗口已结束。已付款请刷新状态，未付款请勿继续扫旧码。';if(o.status!=='pending'||o.createState!=='ready'||left<=0){$('#paymentChannel').textContent=o.channel==='wxpay'?'支付方式：微信':'支付方式：支付宝';if(o.status!=='pending'||o.createState!=='ready')$('#countdown').textContent='';}renderQr(o);
  if(o.status==='paid'){if(pending?.orderNo===o.orderNo){pending=null;save();}member().catch(()=>say('支付成功，会员信息刷新失败，请稍后刷新。',true));}
  if(!stopped&&!document.hidden&&o.status==='pending'&&left>0)timer=setTimeout(refresh,Math.min(30000,3000*2**failures));
 }
 async function refresh(){if(!current)return;const no=current.orderNo;stop();try{const o=await api.billing.status(no);if(current?.orderNo!==no)return;failures=0;show(o);if(o.status==='paid')await orders();}catch(e){failures=Math.min(failures+1,4);say(e.message,true);if(e.status===401){stopped=true;$('#loginLink').hidden=false;}if(!stopped&&!document.hidden)timer=setTimeout(refresh,Math.min(30000,3000*2**failures));}}
 async function checkout(planId){if(busy)return;if(pending&&(pending.planId!==planId||pending.channel!==$('input[name=channel]:checked').value)){if(!confirm('之前的订单可能仍有效。请先确认没有付款，是否创建新订单？'))return;pending=null;save();}
  busy=true;$('#plans').querySelectorAll('button').forEach(b=>b.disabled=true);try{if(!pending){pending={planId,channel:$('input[name=channel]:checked').value,key:crypto.randomUUID()};save();}const o=await api.billing.checkout({planId:pending.planId,channel:pending.channel},pending.key);pending.orderNo=o.orderNo;save();show(o);await orders();say(o.createState==='ready'?'请核对金额。付款后由服务器确认会员开通。':statusText(o),o.createState==='unknown');}catch(e){if(e.code==='order_hidden'){pending=null;save();say(e.message,true);}else if(e.code==='invalid_idempotency_key'){pending=null;save();say('下单标识未正确传递，已清理无效记录。请刷新页面后重新点击购买。',true);}else{say(e.message+'；重试将复用原下单标识。',true);}if(e.status===401)$('#loginLink').hidden=false;}finally{busy=false;$('#plans').querySelectorAll('button').forEach(b=>b.disabled=false);}}
 async function hideOrder(o,button){
  if(busy)return;
  if(!confirm('删除这条未付款订单记录？此操作不会取消平台订单，也不会退款。请确认没有付款；删除后不要再扫旧码。后台会保留对账记录。'))return;
  busy=true;button.disabled=true;
  try{
   await api.billing.hide(o.orderNo);
   if(pending?.orderNo===o.orderNo){pending=null;save();}
   if(current?.orderNo===o.orderNo){stop();current=null;$('#checkout').hidden=true;}
   await orders();say('订单记录已删除。确认没有付款后，可重新选择套餐创建新订单；请勿支付旧订单。');
  }catch(e){say(e.message,true);button.disabled=false;}
  finally{busy=false;}
 }
 async function orders(append=false){const d=await api.billing.orders(append?nextCursor:null);const box=$('#orderList');if(!append)box.replaceChildren();for(const o of d.orders){const row=node('div','','billing-order'),details=node('div',`${o.planName} · ${money(o.payableCents)} · ${statusText(o)}`);details.append(node('small',`${new Date(o.createdAt).toLocaleString()} · ${o.orderNo}`));const b=node('button','查看订单','btn btn-ghost');b.onclick=()=>{show(o);refresh();};row.append(details,b);if(o.status!=='paid'&&!o.paidAt){const del=node('button','删除订单','btn btn-ghost');del.onclick=()=>hideOrder(o,del);row.append(del);}box.append(row);}if(!box.children.length)box.textContent='暂无订单记录';nextCursor=d.nextCursor;$('#moreOrders').hidden=!nextCursor;}
 async function init(){try{await member();const d=await api.billing.plans();say(d.message);for(const p of d.plans){const card=node('article',''),title=node('h2',p.name),desc=node('p',`Pro ${p.duration_days} 天 · 每月 100 万字符上限`),price=node('strong',money(p.price_cents)),b=node('button','立即购买','btn btn-primary');b.onclick=()=>checkout(p.id);card.append(title,desc,price,b);$('#plans').append(card);}await orders();if(pending)say('检测到未完成下单。选择原套餐可安全重试，或从最近订单查看付款状态。');}catch(e){say(e.status===401?'请先登录与 APP 相同的账号，再购买会员套餐。':e.message,true);if(e.status===401)$('#loginLink').hidden=false;}}
 $('#refreshOrder').onclick=refresh;$('#moreOrders').onclick=()=>orders(true).catch(e=>say(e.message,true));document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else refresh();});window.addEventListener('pagehide',()=>{stopped=true;stop();});window.addEventListener('pageshow',()=>{stopped=false;if(current)refresh();});init();
})();
