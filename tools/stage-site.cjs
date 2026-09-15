// Allowlisted public build: never publish repository metadata, test fixtures or operations notes.
const fs=require('node:fs'),path=require('node:path');const root=path.resolve(__dirname,'..'),dest=path.join(root,'public');
fs.mkdirSync(dest,{recursive:true});
// A stale build must be explicitly removed by the caller, not mixed into a release.
if(fs.readdirSync(dest).length)throw Error('public output already exists; choose a clean checkout or remove only this generated output');
for(const name of fs.readdirSync(root).filter(n=>n.endsWith('.html')||['favicon.svg','robots.txt','sitemap.xml','_headers','_routes.json'].includes(n)))fs.copyFileSync(path.join(root,name),path.join(dest,name));
for(const name of ['assets','css','js'])fs.cpSync(path.join(root,name),path.join(dest,name),{recursive:true,filter:source=>! /\.(zip|log|psd|otf|bak)$/i.test(source)&&!path.basename(source).startsWith('.')});
console.log('Public assets staged in '+dest+'; Functions compile from repository functions/.');
