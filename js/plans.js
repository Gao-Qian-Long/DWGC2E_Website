(() => {
 'use strict';const auth=window.DWGC2E_AUTH;if(!auth.active())return;
 const api=window.DWGC2E_API,$=s=>document.querySelector(s),node=(tag,text,cls)=>{const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n;};let busy=false;
 async function load(){if(busy||!auth.active())return;busy=true;$('#plansReload').disabled=true;$('#plansMessage').textContent='正在同步套餐权益…';
  try{const [catalog,ent]=await Promise.all([api.billing.plans(),api.billing.entitlements()]);if(!auth.active())return;const tier=ent.subscription.plan_name;
   $('#currentTier').textContent='当前档位：'+tier.toUpperCase();$('#currentUsage').textContent='本月已用 '+Number(ent.usage.used).toLocaleString()+' 字符 · 当前可用 '+Number(ent.usage.remaining).toLocaleString()+' 字符'+(ent.subscription.expires_at?' · 会员到期 '+new Date(ent.subscription.expires_at).toLocaleString():'');
   $('#currentAddons').replaceChildren();for(const a of ent.addons||[])$('#currentAddons').append(node('p','已加购 Go · 剩余 '+Number(a.remaining).toLocaleString()+' 字符 · '+new Date(a.expires_at).toLocaleString()+' 到期'));
   $('#benefitCards').replaceChildren();for(const p of catalog.plans){const current=p.id===tier,go=p.id==='go',card=node('article','','benefit-card'+(current?' is-current':''));card.dataset.plan=p.id;if(p.description)card.append(node('p',p.description,'field-hint'));
    card.append(node('span',current?'你的当前档位':go&&(ent.addons||[]).length?'已拥有 Go 加购包':go?'独立额度加购包':'基础会员档位','tier-label'),node('h2',p.name),node('strong',p.id==='free'?'免费':'¥'+(p.price_cents/100).toFixed(2),'benefit-price'),node('p',p.quota>0?(go?'增加 ':'每月 ')+Number(p.quota).toLocaleString()+' 字符':'额度待配置'),node('p',p.id==='free'?'永久免费':p.duration_days+' 天有效'),node('p',go?'可叠加购买，不替换原有会员档位。':'最多绑定 3 台 APP 安装实例。'));
    if(p.id==='free')card.append(node('p',current?'正在使用免费权益':'付费会员到期后回到 Free'));else if(!p.enabled||!catalog.paymentsEnabled)card.append(node('p','暂未开放购买'));else{const link=node('a',go?'前往加购':current?'前往续费':'了解购买','btn btn-primary');link.href='billing.html';card.append(link);}$('#benefitCards').append(card);
   }$('#plansMessage').textContent='权益已同步。本页不会创建订单或发起付款。';auth.ready();
  }catch(error){auth.failure(error);if(auth.active()){auth.error();$('#plansMessage').textContent=error.message||'读取失败，请刷新重试。';}}
  finally{busy=false;$('#plansReload').disabled=false;}
 }$('#plansReload').onclick=load;load();
})();
