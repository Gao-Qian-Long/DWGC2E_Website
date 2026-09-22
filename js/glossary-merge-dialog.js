(function(){
 'use strict';
 window.QLCAD_GLOSSARY_MERGE_DIALOG=(groups,active)=>new Promise(resolve=>{
  const dialog=document.createElement('dialog');dialog.setAttribute('aria-labelledby','mergeTitle');dialog.style.cssText='max-width:min(1000px,94vw);width:94vw;max-height:88vh;padding:24px;border:1px solid #aaa;border-radius:12px';
  const heading=document.createElement('h2');heading.id='mergeTitle';heading.textContent='核对本次修改与最新云端';dialog.append(heading);
  const hint=document.createElement('p');hint.textContent='未冲突的新增、修改和删除已自动选择。请逐项确认；缺少词条表示删除。预览不会保存，确认后仍会检查云端版本。';dialog.append(hint);
  const container=document.createElement('div');container.style.cssText='max-height:52vh;overflow:auto';dialog.append(container);
  const choices={};
  const describe=entry=>entry?`${entry.source} → ${entry.target}\n备注：${entry.note||'无'}\n分类：${entry.category||'无'}；目录：${entry.folder||'无'}；${entry.enabled===false?'停用':'启用'}`:'（无此词条／删除）';
  groups.forEach((row,i)=>{
   if(window.QLCAD_GLOSSARY_MERGE.equal(row.local,row.remote))return;
   const section=document.createElement('fieldset');section.style.cssText='margin:12px 0;padding:12px';const legend=document.createElement('legend');legend.textContent=`${row.conflict?'需选择 · ':''}${row.kind}：${row.local?.source||row.remote?.source||row.base?.source}`;section.append(legend);
   for(const side of ['local','remote']){
    const label=document.createElement('label');label.style.cssText='display:block;white-space:pre-wrap;margin:8px 0;overflow-wrap:anywhere';const radio=document.createElement('input');radio.type='radio';radio.name='merge-'+i;radio.value=side;radio.checked=row.choice===side;radio.setAttribute('aria-label',`${i+1} ${side==='local'?'本次修改':'最新云端'}`);radio.onchange=()=>{choices[i]=side;error.textContent='';};label.append(radio,document.createTextNode(` ${side==='local'?'本次修改':'最新云端'}：${describe(row[side])}`));section.append(label);
   }
   container.append(section);
  });
  const error=document.createElement('p');error.setAttribute('role','alert');dialog.append(error);
  const apply=document.createElement('button');apply.type='button';apply.className='btn btn-primary';apply.textContent='确认合并并保存云端';
  const cancel=document.createElement('button');cancel.type='button';cancel.className='btn btn-ghost';cancel.textContent='取消，保留草稿';dialog.append(apply,cancel);
  let done=false;const finish=result=>{if(done)return;done=true;clearInterval(timer);dialog.close();dialog.remove();resolve(result);};
  apply.onclick=()=>{if(!active())return finish(null);try{finish(window.QLCAD_GLOSSARY_MERGE.resolve(groups,choices));}catch(e){error.textContent=e.message;}};
  cancel.onclick=()=>finish(null);dialog.addEventListener('cancel',e=>{e.preventDefault();finish(null);});
  const timer=setInterval(()=>{if(!active())finish(null);},300);document.body.append(dialog);dialog.showModal();cancel.focus();
 });
})();
