// Ephemeral three-way comparison; never stores snapshots or writes to the server.
(function(root){
 'use strict';
 const fields=['source','target','note','category','folder','enabled'];
 const validId=id=>typeof id==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id);
 const equal=(a,b)=>!a||!b?a===b:fields.every(k=>(a[k]??(k==='enabled'?true:''))===(b[k]??(k==='enabled'?true:'')));
 function plan(base,local,remote){
  for(const list of [base,local,remote]){
   if(!Array.isArray(list)||list.length>1000)throw Error('词库超过1000条或格式异常，未合并。');
   const ids=list.filter(x=>validId(x.id)).map(x=>x.id);
   if(new Set(ids).size!==ids.length||list.some(x=>!x||typeof x.source!=='string'||typeof x.target!=='string'))throw Error('词条标识或格式异常，请先核对。');
  }
  const groups=[], usedLocal=new Set(),usedRemote=new Set();
  function match(entry,list,used){
   let candidates=validId(entry.id)?list.filter(x=>!used.has(x)&&x.id===entry.id):[];
   if(!candidates.length)candidates=list.filter(x=>!used.has(x)&&(!validId(entry.id)||!validId(x.id))&&x.source===entry.source);
   if(candidates.length>1)throw Error('相同原文对应多个词条，无法安全匹配，请先整理。');
   if(candidates[0])used.add(candidates[0]);return candidates[0]||null;
  }
  function append(b,l,r){
   const conflict=!equal(l,r)&&!equal(l,b)&&!equal(r,b);
   const choice=equal(l,r)?'remote':equal(l,b)?'remote':equal(r,b)?'local':null;
   groups.push({base:b,local:l,remote:r,conflict,choice,kind:!b?'新增':!l||!r?'删除或保留':'修改'});
  }
  for(const b of base)append(b,match(b,local,usedLocal),match(b,remote,usedRemote));
  for(const l of local)if(!usedLocal.has(l)){usedLocal.add(l);append(null,l,match(l,remote,usedRemote));}
  for(const r of remote)if(!usedRemote.has(r))append(null,null,r);
  return groups;
 }
 function resolve(groups,choices={}){
  const result=[];
  groups.forEach((row,i)=>{
   const choice=Object.hasOwn(choices,i)?choices[i]:row.choice;
   if(choice!=='local'&&choice!=='remote')throw Error('请为每个冲突选择本次修改或最新云端。');
   const selected=row[choice];if(!selected)return;
   const entry={...(row.remote||{}),...selected};
   if(row.remote&&validId(row.remote.id))entry.id=row.remote.id;else delete entry.id;
   result.push(entry);
  });
  if(result.length>1000)throw Error('合并后超过1000条，请减少词条后重试。');
  const pairs=result.map(x=>JSON.stringify([x.source.trim(),x.target.trim()]));
  if(new Set(pairs).size!==pairs.length)throw Error('合并后存在重复原文和译文，请重新选择。');
  return result;
 }
 root.QLCAD_GLOSSARY_MERGE=Object.freeze({plan,resolve,equal});
})(globalThis);
