(() => {
 'use strict';
 const auth=window.DWGC2E_AUTH; if(!auth.active())return;
 const $=s=>document.querySelector(s),money=n=>`¥${(n/100).toFixed(2)}`;
 const readSession=()=>{try{const s=JSON.parse(sessionStorage.getItem('dwgc2e.session')||'null');return s?.token&&(!s.expiresAt||Date.parse(s.expiresAt)>Date.now())?s.token:'';}catch{return '';}};
 const boundSession=readSession();
 const guardSession=()=>{if(!boundSession||readSession()!==boundSession){stopped=true;authenticated=false;stop();clearTimeout(expiryTimer);$('#checkout').hidden=true;$('#qrBox').replaceChildren();$('#orderList').replaceChildren();$('#plans').replaceChildren();$('#membership').textContent='登录状态已失效，请重新登录。';$('#loginLink').hidden=false;throw Object.assign(Error('账号会话已切换或过期，请重新加载购买页。'),{code:'session_changed'});}};
 const bindGroup=group=>Object.fromEntries(Object.entries(group).map(([name,fn])=>[name,async(...args)=>{guardSession();try{const result=await fn(...args);guardSession();return result;}catch(error){guardSession();throw error;}}]));
 const api={account:bindGroup(window.DWGC2E_API.account),billing:bindGroup(window.DWGC2E_API.billing)};
 const node=(tag,text,cls)=>{const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n;};
 const say=(text,error=false)=>{$('#portalMessage').textContent=text;$('#portalMessage').className=`form-message${error?' error':''}`;};

 let current=null,timer=null,expiryTimer=null,failures=0,busy=false,pending=null,nextCursor=null,stopped=false;
 let savedKey=null,authenticated=false,selection=0,refreshVersion=0,listVersion=0;
 const validPending=p=>p&&typeof p.planId==='string'&&['alipay','wxpay'].includes(p.channel)&&typeof p.key==='string'&&/^[a-zA-Z0-9_-]{16,80}$/.test(p.key);
 const load=()=>{const raw=localStorage.getItem(savedKey);if(!raw)return null;const p=JSON.parse(raw);if(!validPending(p))throw Error('未完成购买记录异常，请联系支持核查，请勿重复下单。');return p;};
 const save=()=>{if(!savedKey)throw Error('账户尚未加载');if(pending)localStorage.setItem(savedKey,JSON.stringify(pending));else localStorage.removeItem(savedKey);};
 const stop=()=>{clearTimeout(timer);timer=null;};
 function closeCheckout(){++selection;++refreshVersion;stop();clearTimeout(expiryTimer);current=null;$('#checkout').hidden=true;$('#countdown').textContent='';$('#qrBox').replaceChildren();$('#scanHint').hidden=true;}
 const statusText=o=>o.status==='paid'?'支付成功':o.displayState==='awaiting_payment'?'等待付款':['pending','expired'].includes(o.status)?'正在确认支付结果，请勿重复付款':({failed:'订单失败',cancelled:'订单已关闭',refunded:'已退款'}[o.status]||'订单待核实');
 async function member(){const d=await api.billing.entitlements();$('#membership').textContent= '当前套餐：'+d.subscription.plan_name+' · '+(d.subscription.expires_at?'到期 '+new Date(d.subscription.expires_at).toLocaleString():'无付费有效期')+' · 已用 '+Number(d.usage.used).toLocaleString()+' / '+Number(d.usage.monthly_quota).toLocaleString()+' 字符';}
 async function clearPaid(o){if(!navigator.locks||!savedKey)return;await navigator.locks.request(savedKey,()=>{pending=load();if(pending?.orderNo===o.orderNo){pending=null;save();}});}
 function renderQr(o){
  const box=$('#qrBox');box.replaceChildren();
  if(o.errorCode==='provider_amount_mismatch'){box.append(node('p','套餐标价 '+money(o.amountCents??o.payableCents)+' 与收款二维码金额不一致，已暂停付款。请勿支付旧二维码或反复下单，请联系管理员核实原订单。'));return;}
  if(o.status!=='pending'){box.append(node('p',o.status==='paid'?'订单已支付，无需再次扫码。':'当前订单不可继续付款。'));return;}
  if(o.createState!=='ready'){box.append(node('p',o.createState==='unknown'?'暂未获取到可用二维码，请勿重复下单或付款。':'正在确认平台订单，暂未获取二维码。'));return;}
  if(!Number.isFinite(Date.parse(o.expiresAt))||Date.parse(o.expiresAt)<=Date.now()){box.append(node('p','付款窗口已结束，请勿继续支付旧订单。'));return;}
  if(o.qrCode){try{const qr=qrcode(0,'M');qr.addData(o.qrCode);qr.make();const count=qr.getModuleCount(),scale=Math.max(2,Math.floor(240/(count+8))),canvas=document.createElement('canvas');canvas.width=canvas.height=(count+8)*scale;canvas.setAttribute('role','img');canvas.setAttribute('aria-label','支付二维码');const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#000';for(let y=0;y<count;y++)for(let x=0;x<count;x++)if(qr.isDark(y,x))ctx.fillRect((x+4)*scale,(y+4)*scale,scale,scale);box.append(canvas);return;}catch{/* Try the validated image fallback below. */}}
  if(o.qrCodeImageUrl){try{const url=new URL(o.qrCodeImageUrl);if(url.protocol!=='https:'||url.username||url.password)throw Error();const img=document.createElement('img');img.src=url.href;img.alt='支付二维码';img.referrerPolicy='no-referrer';img.onerror=()=>{if(current?.orderNo===o.orderNo)box.replaceChildren(node('p','二维码图片加载失败，请联系管理员。'));};box.append(img);return;}catch{box.append(node('p','二维码地址无效，请联系管理员。'));return;}}
  box.append(node('p',o.qrCode?'二维码生成失败，且没有可用备用图片，请联系管理员。':'服务器未返回二维码内容或图片地址，请联系管理员。'));
 }

 function schedule(o){stop();if(o&&!stopped&&!document.hidden&&['pending','expired'].includes(o.status))timer=setTimeout(refresh,Math.min(30000,3000*2**failures));}
 function show(o){if(o.hidden||(pending?.orderNo===o.orderNo&&pending.dismissed)){closeCheckout();return;}clearTimeout(expiryTimer);current=o;if(o.status==='pending'&&o.createState==='ready'&&(o.qrCode||o.qrCodeImageUrl)&&Date.parse(o.expiresAt)>Date.now())expiryTimer=setTimeout(()=>{if(current?.orderNo===o.orderNo){renderQr(o);$('#scanHint').hidden=true;$('#countdown').textContent='二维码展示期限已结束；若尚未付款，点击「我已付款，刷新状态」可重新获取新二维码，请勿再扫旧码。';}},Math.min(2147483647,Math.max(0,Date.parse(o.expiresAt)-Date.now()+20))); $('#checkout').hidden=false;$('#checkoutTitle').textContent=o.planName;$('#paymentAmount').textContent=money(o.payableCents);$('#paymentChannel').textContent=o.channel==='wxpay'?'支付方式：微信':'支付方式：支付宝';$('#orderNo').textContent=o.orderNo;$('#paymentStatus').textContent=statusText(o);
 const left=Math.max(0,Math.ceil((Date.parse(o.expiresAt)-Date.now())/1000));$('#countdown').textContent=o.status!=='pending'||o.createState!=='ready'||!(o.qrCode||o.qrCodeImageUrl)?'':left?'二维码展示剩余 '+Math.floor(left/60)+' 分 '+left%60+' 秒':'二维码展示期限已结束；若尚未付款，点击「我已付款，刷新状态」可重新获取新二维码，请勿再扫旧码。';
 $('#scanHint').hidden=!(o.allowedActions?.pay&&left>0);renderQr(o);schedule(o);
 }
 async function afterPaid(o){if(!o||o.status!=='paid')return;const selected=selection;const active=()=>!stopped&&selected===selection&&current?.orderNo===o.orderNo;try{await clearPaid(o);await member();if(active())say('支付成功，会员与额度已同步。');}catch{if(active())say('支付成功，会员信息同步失败。请刷新账户，勿再次付款。',true);}}
 async function refresh(confirm=false){if(!current||stopped)return;const no=current.orderNo,version=selection,request=++refreshVersion;stop();try{const o=await (confirm===true?api.billing.confirm(no):api.billing.status(no));if(stopped||version!==selection||request!==refreshVersion)return;failures=0;show(o);await afterPaid(o);if(o.status==='paid')await orders();}catch(e){if(version!==selection||request!==refreshVersion)return;failures=Math.min(failures+1,4);say(e.message,true);if(e.authExpired||['unauthenticated','session_changed'].includes(e.code)){stopped=true;authenticated=false;$('#loginLink').hidden=false;$('#checkout').hidden=true;}if(!stopped)schedule(current);}}
 async function checkout(planId){if(busy)return;if(!authenticated){say('请先登录后购买。',true);return;}if(!navigator.locks){say('当前浏览器不支持安全下单锁，请使用新版 Edge 或 Chrome。',true);return;}busy=true;$('#plans').querySelectorAll('button').forEach(b=>b.disabled=true);
 try{await navigator.locks.request(savedKey,async()=>{pending=load();const channel=$('input[name=channel]:checked').value;
 if(pending){
  if(!pending.orderNo){say('正在重试原购买请求，请稍候；不会重复创建订单。');}
  else {
   const previous=await api.billing.status(pending.orderNo);
   if(['paid','failed','cancelled','refunded'].includes(previous.status)){pending=null;save();}
   else if(pending.planId===planId&&pending.channel===channel&&!pending.dismissed&&!previous.hidden&&previous.allowedActions?.pay){++selection;show(previous);say('已显示原订单的二维码，请勿重复付款。');return;}
   else if(previous.status==='pending'&&(Date.parse(previous.expiresAt)>Date.now()||['creating','unknown'].includes(previous.createState))){
    pending.dismissed=false;save();++selection;show(previous);say(previous.errorCode==='provider_amount_mismatch'?'原订单收款金额与套餐标价不一致，已暂停付款，请联系管理员；不会创建新订单。':'原购买仍待确认，已保留原订单；请先核实，不会因重试或切换套餐创建新订单。',true);return;
   }else {if(!confirm('原订单展示期限已结束，但不代表平台订单已取消。请确认没有付款，且不会再支付旧二维码。是否继续购买？'))return;pending=null;save();closeCheckout();}
  }
 }
 say('正在获取支付二维码，请稍候…');
 if(!pending){pending={planId,channel,key:crypto.randomUUID()};save();}
 let o,reused=false;try{o=await api.billing.checkout({planId:pending.planId,channel:pending.channel},pending.key);}catch(e){if(e.code!=='payment_order_pending'||!e.order)throw e;o=e.order;reused=true;pending.planId=o.planId;pending.channel=o.channel;pending.dismissed=false;}pending.orderNo=o.orderNo;save();++selection;show(o);say(o.createState==='ready'?(reused?'已有未完成购买，已恢复原订单；未创建新订单，请核对原套餐与金额。':'二维码已获取，请核对金额后付款。'):o.errorCode==='provider_amount_mismatch'?'收款金额与套餐标价不一致，已暂停付款。请联系管理员核实原订单，勿反复下单。':'原订单创建结果待确认（'+(o.errorCode||'创建结果未确认')+'）。重试仅查看原订单，请勿支付旧二维码。',o.createState!=='ready');
 });if(current)await afterPaid(current);await orders();
 }catch(e){say(e.message+'；重试会复用原购买标识，请勿重复付款。',true);if(e.authExpired||e.code==='session_changed'){authenticated=false;stopped=true;$('#checkout').hidden=true;}}finally{busy=false;$('#plans').querySelectorAll('button').forEach(b=>b.disabled=false);}}
 async function hideOrder(o,button){if(busy||!confirm('仅删除列表记录，不会取消支付平台订单。请勿支付旧二维码。是否继续？'))return;busy=true;button.disabled=true;
 try{await api.billing.hide(o.orderNo);if(current?.orderNo===o.orderNo)closeCheckout();await navigator.locks.request(savedKey,()=>{pending=load();if(pending?.orderNo===o.orderNo){pending.dismissed=true;save();}});await orders();say('记录已删除，旧付款面板已关闭。平台订单未取消，请勿支付旧二维码。');}catch(e){say(e.message,true);}finally{busy=false;button.disabled=false;}}
 async function orders(append=false){const version=++listVersion;const d=await api.billing.orders(append?nextCursor:null);if(version!==listVersion||stopped)return;const box=$('#orderList');if(!append)box.replaceChildren();for(const o of d.orders){const row=node('div','','billing-order'),details=node('div',o.planName+' · '+money(o.payableCents)+' · '+statusText(o));details.append(node('small',new Date(o.createdAt).toLocaleString()+' · '+o.orderNo));const b=node('button','查看订单','btn btn-ghost');b.onclick=()=>{if(busy)return;++selection;show(o);refresh();};row.append(details,b);if(o.status!=='paid'&&!o.paidAt){const del=node('button','删除记录','btn btn-ghost');del.onclick=()=>hideOrder(o,del);row.append(del);}box.append(row);}if(!box.children.length)box.textContent='暂无订单记录';nextCursor=d.nextCursor;$('#moreOrders').hidden=!nextCursor;}
 async function init(){try{const profile=await api.account.profile();if(!profile.user_id)throw Error('无法确定账户身份，请重新登录。');authenticated=true;savedKey='dwgc2e.payment.pending.'+profile.user_id;
 const account=node('p','购买账号：'+(profile.email||profile.account||profile.user_id));$('#membership').before(account);
 // Migrate legacy per-tab intent before ever creating a new one.
 if(navigator.locks)await navigator.locks.request(savedKey,()=>{const legacy=sessionStorage.getItem(savedKey);if(!localStorage.getItem(savedKey)&&legacy){const parsed=JSON.parse(legacy);if(!validPending(parsed))throw Error('旧购买记录异常，请先核实订单。');localStorage.setItem(savedKey,legacy);}sessionStorage.removeItem(savedKey);});
 pending=load();const d=await api.billing.plans();say(d.paymentsEnabled===false?'新购买暂未开放，适用于所有普通账户，并非新注册账号受限。已有订单仍可查看及确认付款状态。':d.message);if(d.paymentsEnabled===false){document.querySelector('.billing-channel').hidden=true;document.querySelector('.billing-placeholder').textContent='新购买暂未开放。如有已创建的订单，请从下方最近订单查看付款状态。';}for(const p of d.plans){const card=node('article',''),title=node('h2',p.name),desc=node('p',p.id==='go'?'额外 '+Number(p.quota).toLocaleString()+' 字符 · '+p.duration_days+' 天有效 · 不改变会员档位':p.id==='free'?'每月 '+Number(p.quota).toLocaleString()+' 字符 · 免费':p.duration_days+' 天 · 每月 '+Number(p.quota||0).toLocaleString()+' 字符'),price=node('strong',money(p.price_cents));card.append(title,desc);if(p.description)card.append(node('p',p.description,'field-hint'));card.append(price);if(p.id==='free'){card.append(node('p','免费基础套餐，无需购买'));}else if(p.enabled===0||d.paymentsEnabled===false){card.append(node('p',p.quota===0?'额度待管理员配置，暂未开放':'暂未开放购买'));}else{const b=node('button','立即购买','btn btn-primary');b.onclick=()=>checkout(p.id);card.append(b);}$('#plans').append(card);}

 await member();await orders();auth.ready();if(pending?.orderNo&&!pending.dismissed){++selection;show(await api.billing.status(pending.orderNo));await afterPaid(current);}else if(pending&&!pending.orderNo){say('检测到未完成购买，重试将复用原标识。');const retry=node('button','确认原购买','btn btn-primary');retry.onclick=()=>checkout(pending.planId);$('#plans').append(retry);}
 }catch(e){auth.error();say(e.message,true);if($('#orderList').textContent.includes('正在加载'))$('#orderList').textContent='订单暂时无法读取，请刷新重试。';$('#membership').textContent='会员同步未完成，请刷新重试。';if(e.authExpired||e.code==='unauthenticated')$('#loginLink').hidden=false;}}
 $('#refreshOrder').onclick=()=>refresh(true);$('#moreOrders').onclick=()=>orders(true).catch(e=>say(e.message,true));document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else refresh();});window.addEventListener('online',()=>refresh());window.addEventListener('storage',e=>{if(e.key===savedKey){try{pending=load();if(current?.orderNo===pending?.orderNo&&pending.dismissed)closeCheckout();else refresh();}catch(err){say(err.message,true);}}});window.addEventListener('pagehide',()=>{stopped=true;stop();});window.addEventListener('pageshow',()=>{stopped=false;if(current)refresh();});
 const checkSession=()=>{try{guardSession();return true;}catch(error){say(error.message,true);return false;}};
 for(const event of ['focus','pageshow','storage'])window.addEventListener(event,checkSession);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkSession();});
 document.querySelector('main')?.addEventListener('click',event=>{if(!checkSession()&&!event.target.closest('#loginLink')){event.preventDefault();event.stopImmediatePropagation();}},true);
 setInterval(checkSession,1000);
 init();
})();
