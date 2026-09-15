import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
test('every website page has valid local resource links, unique IDs and expected heading structure',()=>{
 const failures=[];
 for(const name of fs.readdirSync(root).filter(n=>n.endsWith('.html'))){
  const text=fs.readFileSync(path.join(root,name),'utf8');
  // Account has mutually exclusive anonymous/authenticated panels; visibility is checked in browser smoke.
  if((text.match(/<h1\b/g)||[]).length!==(name==='account.html'?2:1))failures.push(name+': unexpected heading structure');
  const ids=[...text.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  if(new Set(ids).size!==ids.length)failures.push(name+': duplicate IDs');
  for(const match of text.matchAll(/\b(?:href|src)="([^"]+)"/g)){
   const ref=match[1];if(/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(ref))continue;
   const url=new URL(ref,'https://local.test/'+name);let local=path.join(root,decodeURIComponent(url.pathname));
   if(url.pathname.endsWith('/'))local=path.join(local,'index.html');
   if(!fs.existsSync(local)){failures.push(`${name}: missing ${ref}`);continue;}
   if(url.hash&&local.endsWith('.html')){
    const target=fs.readFileSync(local,'utf8'),id=decodeURIComponent(url.hash.slice(1));
    if(!target.includes(`id="${id}"`))failures.push(`${name}: missing anchor ${ref}`);
   }
  }
 }
 assert.deepEqual(failures,[]);
});

