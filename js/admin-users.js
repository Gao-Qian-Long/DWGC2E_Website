(() => {
  'use strict';
  const adminAuth=window.QLCAD_ADMIN_AUTH, moduleId=document.body.dataset.adminModule||'users';
  const $ = selector => document.querySelector(selector);
  const base = (window.QLCAD_SITE || {}).apiBaseUrl || '/api';
  const number = n => new Intl.NumberFormat('zh-CN').format(Number(n) || 0);
  const date = value => {
    if (!value) return '未设置';
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }) + '（北京时间）' : '时间格式异常';
  };
  const recordTimeFields = new Set(['paid_at','created_at','first_seen','last_seen','unbind_available_at','started_at','completed_at','expires_at','starts_at']);
  const node = (tag, text, className) => { const el = document.createElement(tag); el.textContent = text; if (className) el.className = className; return el; };
  let key = '', epoch = 0, listRun = 0, detailRun = 0, page = 1, total = 0;
  let listBusy = false, detailBusy = false, saving = false, current = null, selectedId = null, attempt = null;
  const accountLabels={enable:'启用用户',disable:'禁用用户',delete:'软删除用户',restore:'恢复用户（保持禁用）',grant_super:'设为超级用户 · Max',revoke_super:'取消超级用户',revoke_sessions:'退出所有登录'};
  const accountStatus=user=>user.deleted_at?'已删除':user.is_active?'正常':'已禁用';
  for(const [value,label] of [['disabled','已禁用账户'],['deleted','已删除账户'],['super','超级用户']]){const option=node('option',label);option.value=value;$('#memberFilter').append(option);}
  const controllers = new Set();
  const tell = (selector, text, error = false) => { $(selector).textContent = text; $(selector).className = 'form-message' + (error ? ' error' : ''); };
  const describe = error => error.name === 'AbortError' ? '请求超时或已中断，请重试。保存请求可能已提交，请重新读取数据核对结果。' : error instanceof TypeError ? '网络连接失败，请检查网络后重试；已输入的内容保留。' : error.message;
  function controls() {
    $('#userLogin button').disabled = listBusy;
    $('#userRefresh').disabled = listBusy;
    $('#userFilters button').disabled = listBusy;
    $('#userPrev').disabled = listBusy || page <= 1;
    $('#userNext').disabled = listBusy || page * 25 >= total;
    $('#saveMembership').disabled = saving || detailBusy || !current || !!current?.user.deleted_at;
    document.querySelectorAll('#accountEditor button,#accountEditor input,#accountEditor select').forEach(el=>el.disabled=saving||detailBusy);
    $('#detailReload').disabled = saving || detailBusy;
    for (const id of ['editPlan', 'editReason']) $('#' + id).disabled = saving || detailBusy;
    $('#editExpiry').disabled = saving || detailBusy || $('#editPlan').value === 'free';
    // Logout and close always remain available, including during a slow request.
  }
  function clear() {
    resetOps();planDirty=false;
    document.getElementById("compensationEditor")?.remove();document.getElementById('accountEditor')?.remove();
    $("#userLogout").hidden=true;
    epoch++; listRun++; detailRun++;
    for (const controller of controllers) controller.abort(); controllers.clear();
    $('#planEditor').replaceChildren(); $('#planAudit').replaceChildren(); $('#planMessage').textContent=''; planAttempt=null; planLoading=false; planSaving=false; $('#planRefresh').disabled=false;
    key = ''; current = null; selectedId = null; attempt = null; page = 1; total = 0;
    listBusy = false; detailBusy = false; saving = false;
    $('#userKey').value = ''; $('#userSearch').value = ''; $('#memberFilter').value = 'all';
    detailDirty=false; $('#membershipForm').reset(); $('#userGate').hidden = false;$('#adminChecking').hidden=true; $('#userWorkspace').hidden = true;
    $('#detailContent').hidden = true; $('#userDetail').close(); $('#detailTitle').textContent = '用户详情';
    for (const id of ['userList','userIdentity','detailFacts','usageHistory','changeHistory']) $('#' + id).replaceChildren();
    for (const id of ['asOf','resultCount','userPage','detailMessage']) $('#' + id).textContent = '';
    for (const id of ['metricTotal','metricMembers','metricUsed','metricTasks']) $('#' + id).textContent = '—';
    controls();
  }
  async function request(path, options = {}) {
    const controller = new AbortController(), generation = epoch;
    controllers.add(controller); const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(base + path, { ...options, cache: 'no-store', signal: controller.signal, credentials:'same-origin', headers: { 'content-type': 'application/json' } });
      let data; try { data = await response.json(); } catch { throw Error('服务返回格式不完整，请重试。'); }
      if (generation !== epoch) throw Error('stale');
      if (response.status === 401) { clear(); tell('#userMessage', '管理员验证失效，请重新输入密钥。', true); throw Error('stale'); }
      if (!response.ok) { const error = Error(data.message || '请求失败，请重试。'); error.status = response.status; throw error; }
      return data;
    } finally { clearTimeout(timer); controllers.delete(controller); }
  }
  function badge(user) {
    return node('span', user.membership === 'active' ? '有效 '+user.plan_name.toUpperCase() : user.membership === 'expired' ? user.plan_name.toUpperCase()+' 已到期' : '免费账户', 'member-badge ' + (['active','expired'].includes(user.membership) ? user.membership : 'free'));
  }
  function renderList(data) {
    if (!Array.isArray(data.items) || !data.summary || !Number.isFinite(data.total)) throw Error('返回数据不完整，请重试。');
    total = data.total; page = data.page;
    for (const [id, field] of [['metricTotal','total'],['metricMembers','members'],['metricUsed','used'],['metricTasks','tasks']]) $('#' + id).textContent = number(data.summary[field]);
    $('#resultCount').textContent = `${number(total)} 位用户 · ${data.month} UTC`;
    $('#asOf').textContent = '数据更新于 ' + date(data.asOf);
    $('#userPage').textContent = `第 ${page} / ${Math.max(1, Math.ceil(total / 25))} 页`;
    const list = $('#userList'); list.replaceChildren();
    if (!data.items.length) list.append(node('p', '没有符合条件的用户。', 'portal-empty'));
    for (const user of data.items) {
      const row = node('article', '', 'user-row'), identity = node('div', '', 'row-identity');
      identity.append(node('strong', user.display_name || user.account), node('p', user.account + ' · ' + (user.email || '未填写邮箱')), node('small', user.id));
      const membership = node('div', '', 'row-membership');
      membership.append(node('strong',accountStatus(user)+(user.is_super?' · 超级用户 Max':'')),badge(user), node('p', ['pro','max'].includes(user.plan_name) ? user.expires_at ? '到期 ' + date(user.expires_at) : user.is_super?'超级权益 · 无到期时间':'历史账户 · 未设置到期时间' : '免费账户'));
      const usage = node('div', '', 'row-usage');
      usage.append(node('strong', `${number(user.used)} / ${number(user.monthly_quota)}`), node('p', `本月字符 · ${number(user.task_count)} 个任务`));
      const meter = node('div', '', 'usage-meter'), fill = node('span', '');
      const quotaPct = user.monthly_quota > 0 ? Math.min(100, Math.max(0, 100 * user.used / user.monthly_quota)) : 0; fill.style.width = quotaPct + '%'; meter.append(fill); usage.append(meter);
      const button = node('button', '查看详情', 'btn btn-ghost'); button.type = 'button'; button.onclick = () => openDetail(user.id);
      row.append(identity, membership, usage, button); list.append(row);
    }
  }
  async function load(targetPage = page) {
    if (listBusy || !key) return;
    const generation = epoch, run = ++listRun; listBusy = true; controls();
    tell('#userMessage', '正在读取用户数据…'); $('#userList').setAttribute('aria-busy', 'true');
    try {
      const query = new URLSearchParams({ q: $('#userSearch').value.trim(), status: $('#memberFilter').value, page: String(targetPage) });
      const data = await request('/v1/admin/users?' + query);
      if (generation !== epoch || run !== listRun) return;
      renderList(data); $('#userGate').hidden = true; $('#userWorkspace').hidden = false; tell('#userMessage', '');
    } catch (error) { if (generation === epoch && run === listRun) tell('#userMessage', describe(error) + ' 现有数据未更新。', true); }
    finally { if (generation === epoch && run === listRun) { listBusy = false; $('#userList').removeAttribute('aria-busy'); controls(); } }
  }
  const localValue = value => {
    if (!value) return '';
    const d = new Date(value), pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };
  function renderDetail(data) {
    if (!data.user || !Array.isArray(data.usage) || !Array.isArray(data.history)) throw Error('用户详情不完整，请重试。');
    const user = data.user; current = data;
    $('#detailTitle').textContent = user.display_name || user.account;
    $('#userIdentity').replaceChildren(node('strong', user.account), node('p', user.email || '未填写邮箱'), node('p', '用户编号 ' + user.id), node('p', '注册于 ' + date(user.created_at)));
    $('#detailFacts').replaceChildren();
    for (const [label, value] of [['会员状态',user.membership === 'active' ? '有效 '+user.plan_name.toUpperCase() : user.membership === 'expired' ? '已到期 '+user.plan_name.toUpperCase() : '免费账户'],['本月已用',number(user.used) + ' / ' + number(user.monthly_quota) + ' 字符'],['本月任务',number(user.task_count) + ' 个'],['会员到期',date(user.expires_at)]]) {
      const fact = node('div', ''); fact.append(node('small', label), node('strong', value)); $('#detailFacts').append(fact);
    }
    document.getElementById('accountEditor')?.remove();
    const accountBox=node('section','','membership-editor');accountBox.id='accountEditor';
    accountBox.append(node('h3','账户管理 · '+accountStatus(user)+(user.is_super?' · 超级用户 Max':'')),node('p','超级用户持续享有当前 Max 配置额度，不授予后台权限。原付费套餐和订单保留；取消超级用户后恢复原权益。删除为可恢复的软删除；恢复后还需启用。禁用、删除和强制退出将撤销全部登录，不解除设备绑定。','field-hint'));
    const accountForm=node('form','','ops-form'),actionLabel=node('label','管理操作'),action=document.createElement('select'),accountReasonLabel=node('label','操作原因（必填）'),accountReason=document.createElement('input'),accountSave=node('button','核对并执行','btn btn-primary'),accountMessage=node('p','','form-message');
    for(const value of user.deleted_at?['restore']:[user.is_active?'disable':'enable',user.is_super?'revoke_super':'grant_super','revoke_sessions','delete']){const opt=node('option',accountLabels[value]);opt.value=value;action.append(opt);}
    accountReason.required=true;accountReason.spellcheck=false;accountReason.maxLength=500;accountSave.type='submit';actionLabel.append(action);accountReasonLabel.append(accountReason);accountForm.append(actionLabel,accountReasonLabel,accountSave,accountMessage);accountBox.append(accountForm);
    for(const h of data.accountHistory||[])accountBox.append(node('p',date(h.created_at)+' · '+(accountLabels[h.action]||h.action)+' · '+h.reason+' · '+h.actor));
    $('#detailFacts').after(accountBox);let accountAttempt=null;
    accountForm.onsubmit=async event=>{event.preventDefault();if(saving||detailBusy)return;const d={action:action.value,reason:accountReason.value.trim(),version:user.account_version};if(!d.reason){accountMessage.textContent='请填写操作原因。';return;}if(!confirm('确认对 '+user.account+' 执行“'+accountLabels[d.action]+'”？\n'+(d.action==='delete'?'用户不能再登录；保留账号、订单、设备和审计，可恢复。不释放账号用于重新注册。':d.action==='grant_super'?'持续提供 Max 权益，直到管理员取消；不会获得后台权限。':'该操作会立即生效。')))return;
      const signature=JSON.stringify(d);if(accountAttempt?.signature!==signature)accountAttempt={signature,body:{...d,request_id:crypto.randomUUID()}};const generation=epoch,run=detailRun;saving=true;controls();accountMessage.textContent='正在保存…';
      try{await request('/v1/admin/users/'+encodeURIComponent(user.id)+'/account',{method:'POST',body:JSON.stringify(accountAttempt.body)});if(generation!==epoch||run!==detailRun)return;saving=false;await openDetail(user.id,true);await load();}catch(error){if(generation===epoch&&run===detailRun)accountMessage.textContent=describe(error);}finally{if(generation===epoch){saving=false;controls();}}
    };
    document.getElementById('compensationEditor')?.remove();
    const bonusBox=node('section','','membership-editor');bonusBox.id='compensationEditor';bonusBox.append(node('h3','赠送本月补偿额度'),node('p','当前本月补偿：'+number(user.compensation_quota)+' 字符。新增额度仅在当前 UTC 自然月有效，月初失效；不会修改历史扣费、订单或 Go 包。','field-hint'));
    const bonusForm=node('form','','ops-form'),amountLabel=node('label','补偿字符数'),amount=document.createElement('input'),reasonLabel=node('label','补偿原因'),reason=document.createElement('textarea'),save=node('button','核对并赠送额度','btn btn-primary'),message=node('p','','form-message');amount.type='number';amount.min=1;amount.max=1000000000;amount.step=1;amount.required=true;reason.spellcheck=false;reason.required=true;reason.minLength=1;reason.maxLength=500;save.type='submit';amountLabel.append(amount);reasonLabel.append(reason);bonusForm.append(amountLabel,reasonLabel,save,message);bonusBox.append(bonusForm);$('#detailFacts').after(bonusBox);let bonusAttempt=null;
    bonusForm.onsubmit=async event=>{event.preventDefault();if(saving||detailBusy)return;const d={user_id:user.id,amount:Number(amount.value),year_month:data.month,reason:reason.value.trim()},signature=JSON.stringify(d);if(!confirm('给 '+user.account+' 赠送 '+number(d.amount)+' 字符？仅在 '+d.year_month+' UTC 月份有效，不可直接撤销。'))return;if(bonusAttempt?.signature!==signature)bonusAttempt={signature,body:{...d,request_id:crypto.randomUUID()}};const generation=epoch,run=detailRun;saving=true;save.disabled=true;controls();try{await request('/v1/admin/operations/compensations',{method:'POST',body:JSON.stringify(bonusAttempt.body)});if(generation!==epoch||run!==detailRun)return;message.textContent='补偿已保存';saving=false;await openDetail(user.id,true);await load();}catch(error){if(generation===epoch&&run===detailRun)message.textContent=describe(error);}finally{if(generation===epoch){saving=false;save.disabled=false;controls();}}};
    $('#editPlan').value = ['pro','max'].includes(user.underlying_plan_name) ? user.underlying_plan_name : 'free'; $('#editExpiry').value = localValue(user.underlying_expires_at); $('#editReason').value = '';
    $('#localTimezone').textContent = Intl.DateTimeFormat().resolvedOptions().timeZone;
    $('#usageHistory').replaceChildren();
    for (const usage of data.usage) { const item = node('div', '', 'history-item'); item.append(node('strong', usage.year_month + ' · UTC'), node('p', `${number(usage.chars_used)} 字符 · ${number(usage.task_count)} 个任务`)); $('#usageHistory').append(item); }
    if (!data.usage.length) $('#usageHistory').append(node('p', '暂无用量记录。', 'field-hint'));
    $('#changeHistory').replaceChildren();
    for (const change of data.history) {
      let before = null; try { before = JSON.parse(change.before_snapshot); } catch { /* display an explicit unknown historical value */ }
      const old = before ? `${before[0]} · ${date(before[2])}` : '无会员记录';
      const after = change.plan_name !== 'free' ? change.plan_name.toUpperCase()+' · ' + date(change.expires_at) : '免费账户';
      const item = node('div', '', 'history-item');
      item.append(node('strong', date(change.created_at)), node('p', old + ' → ' + after), node('p', '原因：' + change.reason), node('p', '管理员指纹 ' + change.actor + ' · 记录 ' + change.id)); $('#changeHistory').append(item);
    }
    if (!data.history.length) $('#changeHistory').append(node('p', '暂无人工调整记录。付款续费不在此列表中。', 'field-hint'));
    $('#detailContent').hidden = false;
  }
  async function openDetail(id, saved = false) {
    const generation = epoch, run = ++detailRun; selectedId = id;
    const same = current?.user.id === id;
    if (!same) { current = null; attempt = null; $('#detailContent').hidden = true; $('#detailTitle').textContent = '用户详情'; }
    if (!$('#userDetail').open) $('#userDetail').showModal();
    detailBusy = true; controls(); tell('#detailMessage', '正在读取用户详情…');
    try {
      const data = await request('/v1/admin/users/' + encodeURIComponent(id));
      if (generation !== epoch || run !== detailRun) return;
      renderDetail(data); attempt = null;
      tell('#detailMessage', saved ? '会员修改已保存，以下为重新读取的生效数据。' : '');
    } catch (error) { if (generation === epoch && run === detailRun) tell('#detailMessage', (saved ? '修改已保存，但详情刷新失败。' : '') + describe(error), true); }
    finally { if (generation === epoch && run === detailRun) { detailBusy = false; controls(); } }
  }

  let planLoading=false,planSaving=false,planAttempt=null;
  async function loadPlans(){if(planLoading||planSaving||!key)return;const generation=epoch;planLoading=true;$('#planRefresh').disabled=true;tell('#planMessage','正在读取套餐配置…');
   try{const data=await request('/v1/admin/plans');if(generation!==epoch)return;$('#planEditor').replaceChildren();planAttempt=null;planDirty=false;
    for(const p of data.plans){const form=node('form','','plan-config');form.dataset.plan=p.id;form.oninput=()=>{form.dataset.dirty='true';planDirty=true;};form.append(node('h3',p.name),node('p',p.id==='go'?'加购包 · 不改变会员档位':p.id==='free'?'免费基础档位':'会员套餐','field-hint'));
     const input=(label,name,value,type='number')=>{const wrap=node('label',label),el=document.createElement('input');el.name=name;el.type=type;el.value=value;el.required=true;el.spellcheck=false;wrap.append(el);form.append(wrap);return el;};
     const displayName=input('套餐显示名称','displayName',p.name,'text');displayName.maxLength=50;const description=input('权益说明（可留空）','description',p.description||'','text');description.required=false;description.maxLength=1000;
     const price=input('价格（元）','price',(p.price_cents/100).toFixed(2));price.min=p.id==='free'?'0':'0.01';price.max='100000';price.step='0.01';price.readOnly=p.id==='free';
     const quota=input(p.id==='go'?'每份加购字符数':'每月基础字符数','quota',p.quota);quota.min='0';quota.max='1000000000';quota.step='1';
     const days=input('有效期（天，默认 30 天）','days',p.duration_days);days.min='1';days.max='366';days.step='1';if(p.id==='free'){days.hidden=true;days.parentElement.hidden=true;}
     const label=node('label',''),enabled=document.createElement('input');enabled.type='checkbox';enabled.name='enabled';enabled.checked=!!p.enabled;enabled.disabled=p.id==='free';label.append(enabled,document.createTextNode(p.id==='free'?'始终免费提供':'开放此套餐购买'));form.append(label);
     const reason=input('修改原因（必填）','reason','','text');reason.minLength=1;reason.maxLength=500;
     const save=node('button','保存 '+p.name+' 配置','btn btn-primary');save.type='submit';form.append(save);
     form.onsubmit=async event=>{event.preventDefault();if(planSaving||planLoading)return;const gen=epoch;if([...document.querySelectorAll('.plan-config[data-dirty=true]')].some(other=>other!==form)&&!confirm('保存会重新读取全部套餐，其他套餐尚未保存的输入将丢失。确认继续吗？'))return;
      const raw=price.value;if(!/^\d+(?:\.\d{1,2})?$/.test(raw)){tell('#planMessage','价格最多保留两位小数。',true);return;}
      const body={name:displayName.value.trim(),description:description.value.trim(),price_cents:Math.round(Number(raw)*100),quota:Number(quota.value),duration_days:Number(days.value),enabled:p.id==='free'?1:Number(enabled.checked),revision:p.revision,reason:reason.value.trim()};
      if(!Number.isSafeInteger(body.quota)||(body.enabled&&body.quota<=0)){tell('#planMessage','开放购买前请设置大于 0 的整数字符额度。',true);return;}
      if(!confirm('确认保存 '+p.name+'？\n价格 ¥'+raw+'，额度 '+body.quota+' 字符，'+body.duration_days+' 天。\n'+(body.enabled?'启用':'暂停')+'此套餐；已有付费订单与已购权益不变。'))return;
      const signature=JSON.stringify({id:p.id,...body});if(!planAttempt||planAttempt.signature!==signature)planAttempt={signature,body:{...body,request_id:crypto.randomUUID()}};
      planSaving=true;$('#planRefresh').disabled=true;$('#planEditor').querySelectorAll('button').forEach(x=>x.disabled=true);tell('#planMessage','正在保存…');
      let saved=false;try{await request('/v1/admin/plans/'+p.id,{method:'POST',body:JSON.stringify(planAttempt.body)});if(gen!==epoch)return;saved=true;}
      catch(error){if(gen===epoch)tell('#planMessage',describe(error),true);}
      finally{if(gen===epoch){planSaving=false;$('#planRefresh').disabled=false;$('#planEditor').querySelectorAll('button').forEach(x=>x.disabled=false);}}
      if(saved&&gen===epoch){await loadPlans();if(gen===epoch)tell('#planMessage','已保存。新订单采用新配置，已有订单与已购权益保持不变。');}
     };$('#planEditor').append(form);
    }
    $('#planAudit').replaceChildren();for(const h of data.history){$('#planAudit').append(node('p',date(h.created_at)+' · '+h.plan_id.toUpperCase()+' · ¥'+(h.price_cents/100).toFixed(2)+' · '+number(h.quota)+' 字符 · '+h.duration_days+' 天 · '+(h.enabled?'启用':'暂停')+' · '+h.reason));}if(!data.history.length)$('#planAudit').append(node('p','尚无配置修改记录。','field-hint'));tell('#planMessage','已读取当前生效配置。');
   }catch(error){if(generation===epoch)tell('#planMessage',describe(error),true);}finally{if(generation===epoch){planLoading=false;$('#planRefresh').disabled=false;}}
  }
  $('#planRefresh').onclick=()=>{if(!$('#planEditor').children.length||confirm('重新读取将丢弃尚未保存的套餐输入，继续吗？'))loadPlans();};

  $('#userLogin').onsubmit = async event => {
    event.preventDefault(); if (listBusy) return;
    const candidate = $('#userKey').value;
    if (candidate.trim() !== candidate || candidate.length < 32) { tell('#userMessage', '请输入已部署的管理员密钥（至少 32 个字符，不能含首尾空格）。', true); return; }
    epoch++;$('#userKey').value='';$('#userLogin button').disabled=true;try{await adminAuth.login(candidate,$('#userName').value.trim());await startAdmin();}catch(error){tell('#userMessage',describe(error),true);}finally{$('#userLogin button').disabled=false;}
  };
  $('#userFilters').onsubmit = event => { event.preventDefault(); load(1); };
  $('#memberFilter').onchange = () => load(1);
  $('#userRefresh').onclick = () => load();
  $('#userLogout').onclick = async () => {if((opsDirty||planDirty||detailDirty)&&!confirm('退出会丢弃尚未保存的输入，继续吗？'))return;$('#userLogout').disabled=true;try{await adminAuth.logout();tell('#userMessage','已退出全部后台页面。');}catch(error){tell('#userMessage','退出未完成，请重试。'+describe(error),true);}finally{$('#userLogout').disabled=false;}};
  $('#userPrev').onclick = () => load(page - 1); $('#userNext').onclick = () => load(page + 1);
  $('#detailClose').onclick = () => $('#userDetail').close();
  $('#userDetail').addEventListener('close', () => { detailRun++; detailBusy = false; current = null; selectedId = null; attempt = null; $('#detailContent').hidden = true; controls(); });
  $('#detailReload').onclick = () => { if (selectedId && (!$('#editReason').value.trim() || confirm('重新加载会清除尚未保存的输入，是否继续？'))) openDetail(selectedId); };
  $('#editPlan').onchange = controls;
  $('#membershipForm').oninput = () => { detailDirty = true; };
  $('#membershipForm').onsubmit = async event => {
    event.preventDefault(); if (saving || detailBusy || !current) return;
    const user = current.user, generation = epoch, run = detailRun;
    const plan = $('#editPlan').value, reason = $('#editReason').value.trim(), raw = $('#editExpiry').value;
    if (reason.length < 1) { tell('#detailMessage', '请填写修改原因。', true); return; }
    if (plan !== 'free' && (!raw || !Number.isFinite(new Date(raw).getTime()))) { tell('#detailMessage', '请填写有效的会员到期时间。', true); $('#editExpiry').focus(); return; }
    const expiry = ['pro', 'max'].includes(plan) ? new Date(raw).toISOString() : null;
    const changes = { plan_name: plan, expires_at: expiry, reason, version: user.version };
    const signature = JSON.stringify(changes);
    if (!attempt || attempt.signature !== signature) attempt = { signature, body: { ...changes, request_id: crypto.randomUUID() } };
    const warning = plan === 'free' || (expiry && Date.parse(expiry) <= Date.now()) ? '\n注意：此操作将立即关闭有效会员权益。' : user.expires_at && Date.parse(expiry) < Date.parse(user.expires_at) ? '\n注意：此操作将缩短现有会员期限。' : '';
    if (!confirm(`确认修改用户 ${user.account}（${user.email || user.id}）？\n原状态：${user.plan_name}，到期 ${date(user.expires_at)}\n新状态：${plan !== 'free' ? plan.toUpperCase()+'，到期 ' + date(expiry) : '免费账户'}${warning}\n原因：${reason}\n已用字符和支付记录保持不变。`)) return;
    saving = true; controls(); tell('#detailMessage', '正在保存，请勿重复提交…');
    try {
      await request('/v1/admin/users/' + encodeURIComponent(user.id) + '/membership', { method: 'POST', body: JSON.stringify(attempt.body) });
      if (generation !== epoch) return;
      tell('#userMessage', '用户 ' + user.account + ' 的会员修改已保存。');
      if (run === detailRun && $('#userDetail').open) await openDetail(user.id, true);
      await load();
    } catch (error) {
      if (generation === epoch && run === detailRun) tell('#detailMessage', describe(error), true);
      else if (generation === epoch) tell('#userMessage', '会员保存请求未能确认结果，请重新打开用户详情核对。', true);
    } finally { if (generation === epoch) { saving = false; controls(); } }
  };
  // Operations shares the in-memory admin session; never stores credentials in the browser.
  let planDirty=false;let detailDirty=false;
  let opsTab=moduleId,opsRun=0,opsPage=1,opsQuery='',opsBusy=false,opsAttempt=null,opsDirty=false;
  const opsNames={users:'用户管理',plans:'套餐与额度',orders:'订单售后',devices:'设备管理',usage:'用量明细',release:'软件发布',content:'公告与帮助',controls:'功能开关',feedback:'用户反馈',audit:'操作记录'};
  const opsHints={release:'保存后更新官网与软件的版本查询信息，不会生成或上传安装包。仅支持 HTTPS 下载地址。',content:'公告仅显示在独立公告栏，不修改首页标题与产品简介。支持定时发布与下架，时间按本机时区填写。内容只按纯文本显示。',controls:'暂停购买只阻止新订单，不影响旧订单到账。维护开关暂停新的翻译请求。自助解绑默认等待 20 天，可设置 0–365 天（0 表示无需等待）。保存后立即按原绑定时间重新计算所有现有绑定；管理员强制解绑不受限制。',orders:'查询订单和到账记录。售后备注不改变付款或权益状态；异常订单须核对支付方证据，不能手动伪造已支付。',devices:'管理员可立即强制解绑，不受用户等待期限制；须填写原因并确认，将释放设备名额并撤销该设备 APP 登录。',usage:'填写完整用户编号，查看每次请求的预留、实际扣费与 Go 加量包余额。',feedback:'记录处理进度和内部备注；内部备注不会发送给用户。',audit:'记录配置、套餐、会员和售后修改。恢复配置时先载入历史值核对，再以新操作保存，不回滚订单或已消费权益。'};
  function resetOps(){opsRun++;opsAttempt=null;opsBusy=false;opsDirty=false;opsPage=1;opsQuery='';$('#opsContent').replaceChildren();$('#opsMessage').textContent='';$('#opsRefresh').disabled=false;}
  const moduleFiles={users:'admin-users.html',plans:'admin-plans.html',orders:'admin-orders.html',devices:'admin-devices.html',usage:'admin-usage.html',release:'admin-release.html',content:'admin-content.html',controls:'admin-controls.html',feedback:'admin-feedback.html',audit:'admin-audit.html'};
  async function startAdmin(){epoch++;key='session';opsTab=moduleId;$('#userGate').hidden=true;$('#adminChecking').hidden=true;$('#userWorkspace').hidden=false;$('#userLogout').hidden=false;$('#usersPanel').hidden=moduleId!=='users';$('#plansPanel').hidden=moduleId!=='plans';$('#opsPanel').hidden=['users','plans'].includes(moduleId);tell('#userMessage','');if(moduleId==='users')await load(1);else if(moduleId==='plans')await loadPlans();else await loadOps();}
  const fields={release:[['latest_version','软件版本号','text'],['download_url','主下载链接','url'],['backup_download_url','备用下载链接（可留空）','url'],['release_notes','更新说明','textarea']],content:[['announcement','公告正文（留空不显示）','textarea'],['announcement_start','公告开始时间（可留空）','datetime-local'],['announcement_end','公告结束时间（可留空）','datetime-local'],['help_text','补充使用帮助与常见问题','textarea'],['contact_email','客服邮箱（可留空）','email'],['tutorial_url','教程链接（可留空）','url']],controls:[['registration_open','允许新用户注册','checkbox'],['purchases_open','允许创建新订单（仍受支付总开关限制）','checkbox'],['maintenance','暂停新的翻译请求 / 维护模式','checkbox'],['device_wait_days','用户自助解绑等待天数（0–365 天，0 表示不等待）','number']]};
  function localDate(v){if(!v)return '';const d=new Date(v);return new Date(d-d.getTimezoneOffset()*60000).toISOString().slice(0,19);}
  function editor(item,preset){const form=node('form','','ops-form');const values=preset||item.value;for(const [id,label,type]of fields[item.section]){const l=node('label',label),input=document.createElement(type==='textarea'?'textarea':'input');input.name=id;if(type!=='textarea')input.type=type;if(type!=='checkbox')input.spellcheck=false;if(type==='checkbox')input.checked=values[id];else input.value=type==='datetime-local'?localDate(values[id]):values[id]??'';const limits={latest_version:80,download_url:2048,backup_download_url:2048,release_notes:5000,headline:100,description:500,announcement:2000,help_text:10000,contact_email:254,tutorial_url:2048};if(limits[id])input.maxLength=limits[id];if(type==='number'){input.min=0;input.max=365;input.step=1;}if(type==='datetime-local')input.step=1;if(id==='latest_version'||id==='download_url')input.required=true;l.append(input);form.append(l);}
    const reasonLabel=node('label','修改原因（必填）'),reason=document.createElement('textarea');reason.name='reason';reason.spellcheck=false;reason.required=true;reason.minLength=1;reason.maxLength=500;reasonLabel.append(reason);form.append(reasonLabel);const button=node('button','核对并保存配置','btn btn-primary');button.type='submit';form.append(button);form.oninput=()=>{opsDirty=true;};form.onsubmit=async event=>{event.preventDefault();if(opsBusy)return;const value=item.section==='content'?{headline:values.headline??'',description:values.description??''}:{};for(const [id,,type]of fields[item.section]){const input=form.elements.namedItem(id);value[id]=type==='checkbox'?input.checked:type==='number'?Number(input.value):type==='datetime-local'?(input.value?new Date(input.value).toISOString():''):input.value.trim();}
      const payload={value,revision:item.revision,reason:reason.value.trim()},signature=JSON.stringify(payload);if(!confirm('确认保存“'+opsNames[item.section]+'”？配置将立即生效，请特别核对下载地址、版本和开关。'))return;
      if(!opsAttempt||opsAttempt.signature!==signature)opsAttempt={signature,body:{...payload,request_id:crypto.randomUUID()}};const generation=epoch,run=opsRun;opsBusy=true;button.disabled=true;
      try{await request('/v1/admin/operations/settings/'+item.section,{method:'POST',body:JSON.stringify(opsAttempt.body)});if(generation!==epoch||run!==opsRun)return;opsDirty=false;opsAttempt=null;if(location.search)history.replaceState(null,'',location.pathname);opsBusy=false;await loadOps();tell('#opsMessage','已保存，公开页面下次读取时使用新配置。');}catch(error){if(generation===epoch&&run===opsRun)tell('#opsMessage',describe(error),true);}finally{if(generation===epoch&&run===opsRun){opsBusy=false;button.disabled=false;}}
    };$('#opsContent').append(form);
  }
  function showRecord(item){const box=node('article','','ops-record');const labels={order_no:'订单号',account:'账号',plan_name:'套餐',status:'状态',create_state:'订单创建状态',amount_cents:'订单金额（分）',payable_cents:'应付金额（分）',settled:'到账记录（1=已到账）',paid_at:'付款时间',created_at:'创建时间',user_id:'用户编号',device_id:'设备编号',device_name:'设备名称',first_seen:'绑定时间',last_seen:'最近活动',revoked:'已解绑（1=是）',unbind_available_at:'超过此时间可解绑',request_id:'请求编号',year_month:'月份',reserved:'预留字符',billed:'实际扣费字符',state:'状态',started_at:'开始时间',completed_at:'完成时间',email:'邮箱',category:'问题分类',message:'问题内容',workflow_status:'处理进度',latest_note:'最新内部备注',kind:'修改对象',actor:'操作者标识',reason:'原因',amount:'补偿字符',quota:'额度',remaining:'剩余',expires_at:'到期时间',starts_at:'开始时间'};for(const [key,value]of Object.entries(item)){if(labels[key]&&value!==null)box.append(node('p',labels[key]+'：'+(recordTimeFields.has(key)?date(value):value)));}
    if(item.before_snapshot!==undefined){const details=node('details'),summary=node('summary','修改前后详情');details.append(summary,node('pre','修改前：'+item.before_snapshot+'\n修改后：'+item.after_snapshot));box.append(details);if(item.kind?.startsWith('配置 / ')){const section=item.kind.slice(5);if(fields[section]){const restore=node('button','载入此条修改前的配置','btn btn-ghost');restore.type='button';restore.onclick=async()=>{if(!confirm('将读取当前版本，再载入历史内容供核对；不会直接保存。继续吗？'))return;let old;try{old=JSON.parse(item.before_snapshot);}catch{return;}if(!Object.keys(old).length){tell('#opsMessage','该记录是首次设置，修改前使用环境默认值；请手动核对默认值。',true);return;}location.href=moduleFiles[section]+'?restore='+encodeURIComponent(item.id);};box.append(restore);}}}
    if(['orders','feedback'].includes(opsTab)){const form=node('form','','ops-form'),select=document.createElement('select'),note=document.createElement('textarea');note.spellcheck=false;select.setAttribute('aria-label','处理状态');note.setAttribute('aria-label','内部备注');note.placeholder='内部备注（必填，不会修改付款状态）';note.required=true;note.minLength=1;note.maxLength=2000;const states=opsTab==='orders'?{awaiting_provider:'等待支付方核查',provider_replay_requested:'已请求支付方重发通知',escalated:'升级处理'}:{new:'待处理',processing:'处理中',resolved:'已解决'};for(const [v,label]of Object.entries(states)){const o=node('option',label);o.value=v;select.append(o);}if(states[item.workflow_status||item.status])select.value=item.workflow_status||item.status;const save=node('button','保存处理记录','btn btn-ghost');save.type='submit';form.append(select,note,save);let attempt=null;form.oninput=()=>{opsDirty=true;};form.onsubmit=async ev=>{ev.preventDefault();if(opsBusy||!confirm('确认保存内部处理记录？'))return;const d={kind:opsTab==='orders'?'order':'feedback',target_id:item.order_no||item.id,status:select.value,note:note.value.trim()},signature=JSON.stringify(d);if(attempt?.signature!==signature)attempt={signature,body:{...d,request_id:crypto.randomUUID()}};const gen=epoch,run=opsRun;opsBusy=true;save.disabled=true;try{await request('/v1/admin/operations/notes',{method:'POST',body:JSON.stringify(attempt.body)});if(gen!==epoch||run!==opsRun)return;opsDirty=false;opsBusy=false;await loadOps();tell('#opsMessage','处理记录已保存。');if(d.kind==='feedback')window.QLCAD_ADMIN_BADGES?.refresh();}catch(error){if(gen===epoch&&run===opsRun)tell('#opsMessage',describe(error),true);}finally{if(gen===epoch&&run===opsRun){opsBusy=false;save.disabled=false;}}};box.append(form);}
    if(opsTab==='devices'&&!Number(item.revoked)){
      const form=node('form','','ops-form'),label=node('label','强制解绑原因（必填）'),reason=document.createElement('textarea');reason.spellcheck=false;reason.required=true;reason.maxLength=500;reason.setAttribute('aria-label','强制解绑原因');label.append(reason);
      const save=node('button','立即强制解绑','btn btn-primary');save.type='submit';form.append(label,save);let attempt=null;
      form.oninput=()=>{opsDirty=true;};form.onsubmit=async ev=>{ev.preventDefault();if(opsBusy||!reason.value.trim())return;
        if(!confirm('立即解绑 '+item.account+' 的设备 '+(item.device_name||item.device_id)+'？该设备 APP 登录将失效，设备名额将释放。此操作不删除账号或文件。'))return;
        const d={user_id:item.user_id,device_id:item.device_id,first_seen:item.first_seen,reason:reason.value.trim()},signature=JSON.stringify(d);if(attempt?.signature!==signature)attempt={signature,body:{...d,request_id:crypto.randomUUID()}};
        const gen=epoch,run=opsRun;opsBusy=true;save.disabled=true;
        try{await request('/v1/admin/operations/devices/revoke',{method:'POST',body:JSON.stringify(attempt.body)});if(gen!==epoch||run!==opsRun)return;opsDirty=false;opsBusy=false;await loadOps();tell('#opsMessage','设备已强制解绑，对应 APP 登录已撤销。');}
        catch(error){if(gen===epoch&&run===opsRun)tell('#opsMessage',describe(error)+' 请核对设备状态；重试将复用操作编号。',true);}
        finally{if(gen===epoch&&run===opsRun){opsBusy=false;save.disabled=false;}}
      };box.append(form);
    }
    return box;
  }
  async function loadOps(preset){if(!key||opsBusy)return;const generation=epoch,run=++opsRun;opsBusy=true;$('#opsRefresh').disabled=true;$('#opsTitle').textContent=opsNames[opsTab];$('#opsHint').textContent=opsHints[opsTab]||'';tell('#opsMessage','正在读取…');try{
    const data=opsTab==='usage'&&!opsQuery?{items:[],hasMore:false}:await request('/v1/admin/operations/'+(fields[opsTab]?'settings':opsTab+'?page='+opsPage+'&q='+encodeURIComponent(opsQuery)));if(generation!==epoch||run!==opsRun)return;$('#opsContent').replaceChildren();opsDirty=false;
    if(fields[opsTab]){const item=data.items.find(x=>x.section===opsTab);if(!item)throw Error('配置返回不完整');const restoreId=new URLSearchParams(location.search).get('restore');if(restoreId&&!preset){const change=await request('/v1/admin/operations/changes/'+encodeURIComponent(restoreId));if(generation!==epoch||run!==opsRun)return;if(change.section!==opsTab)throw Error('历史配置类型不匹配');const old=JSON.parse(change.before_snapshot);if(Object.keys(old).length)preset=old;else throw Error('首次配置之前使用环境默认值，请手动核对。');}editor(item,preset);if(preset)opsDirty=true;}else{
      if(opsTab!=='audit'){const form=node('form','','ops-search'),search=document.createElement('input');search.spellcheck=false;search.value=opsQuery;search.placeholder=opsTab==='usage'?'完整用户编号':'订单号、用户编号、账号或邮箱（依模块）';search.setAttribute('aria-label','查询条件');const button=node('button','查询','btn btn-primary');button.type='submit';form.append(search,button);form.onsubmit=e=>{e.preventDefault();if(opsDirty&&!confirm('查询将丢弃未保存备注，继续吗？'))return;opsPage=1;opsQuery=search.value.trim();loadOps();};$('#opsContent').append(form);}
      for(const item of data.items||[])$('#opsContent').append(showRecord(item));if(!data.items?.length)$('#opsContent').append(node('p','没有匹配的记录。','portal-empty'));if(data.addons?.length){$('#opsContent').append(node('h3','Go 加量包（包含过期记录）'));for(const a of data.addons)$('#opsContent').append(showRecord(a));}if(data.compensations?.length){$('#opsContent').append(node('h3','本月与历史补偿记录'));for(const a of data.compensations)$('#opsContent').append(showRecord(a));}
      const pager=node('div','','ops-pagination');for(const [delta,title]of [[-1,'上一页'],[1,'下一页']]){const b=node('button',title,'btn btn-ghost');b.type='button';b.disabled=delta<0?opsPage===1:!data.hasMore;b.onclick=()=>{if(opsDirty&&!confirm('翻页将丢弃未保存备注，继续吗？'))return;opsPage+=delta;loadOps();};pager.append(b);}pager.append(node('span','第 '+opsPage+' 页'));$('#opsContent').append(pager);
    }tell('#opsMessage','');
   }catch(error){if(generation===epoch&&run===opsRun){tell('#opsMessage',describe(error),true);if(opsTab==='usage'&&!opsQuery){$('#opsContent').replaceChildren();const form=node('form','','ops-search'),input=document.createElement('input'),button=node('button','查询','btn btn-primary');input.spellcheck=false;input.placeholder='完整用户编号';input.setAttribute('aria-label','完整用户编号');button.type='submit';form.append(input,button);form.onsubmit=e=>{e.preventDefault();opsQuery=input.value.trim();loadOps();};$('#opsContent').append(form);}}}finally{if(generation===epoch&&run===opsRun){opsBusy=false;$('#opsRefresh').disabled=false;}}
  }
  $('#opsRefresh').onclick=()=>{if(!opsDirty||confirm('重新读取将丢弃尚未保存的输入，继续吗？'))loadOps();};

  window.addEventListener('admin-logout',()=>{clear();tell('#userMessage','后台会话已退出，请重新登录。');});
  window.addEventListener('beforeunload',e=>{if(opsDirty||planDirty||detailDirty){e.preventDefault();e.returnValue='';}});
  window.addEventListener('pagehide',()=>{clear();$('#userGate').hidden=true;$('#adminChecking').hidden=false;tell('#userMessage','');});
  let checking=false;let lastCheck=0;
  async function restoreSession(){if(checking||Date.now()-lastCheck<15000)return;checking=true;const generation=epoch;try{await adminAuth.check();if(generation!==epoch)return;if(!key)await startAdmin();}catch(error){if(generation!==epoch)return;if(error.status===401){clear();tell('#userMessage','请登录后台；有效会话内切换页面和刷新无需重输密钥。');}else {$('#adminChecking').hidden=true;$('#userGate').hidden=!!key;tell('#userMessage','暂时无法检查后台登录状态，请重试。',true);}}finally{checking=false;lastCheck=Date.now();}}
  window.addEventListener('pageshow',e=>{if(e.persisted)restoreSession();});window.addEventListener('focus',restoreSession);document.addEventListener('visibilitychange',()=>{if(!document.hidden)restoreSession();});
  restoreSession();
  controls();
})();

