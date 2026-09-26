// Allowlisted public build: never publish repository metadata, test fixtures or operations notes.
const fs=require('node:fs'),path=require('node:path');const root=path.resolve(__dirname,'..'),dest=path.join(root,'public');
fs.mkdirSync(dest,{recursive:true});
// A stale build must be explicitly removed by the caller, not mixed into a release.
if(fs.readdirSync(dest).length)throw Error('public output already exists; choose a clean checkout or remove only this generated output');
// Root files: explicit allowlist (deny by default).
const ROOT_FILES=['favicon.svg','robots.txt','sitemap.xml','_headers','_routes.json'];
for(const name of fs.readdirSync(root).filter(n=>n.endsWith('.html')||ROOT_FILES.includes(n)))fs.copyFileSync(path.join(root,name),path.join(dest,name));
// Asset trees: extension allowlist (deny by default) — anything not listed here fails the build loudly.
// Source maps would expose unminified sources (and any comments in them) to every visitor.
const ALLOWED_EXT=new Set(['.css','.js','.svg','.png','.webp','.woff2','.txt']);
const ALLOWED_DIR_FILES=new Set(['LICENSE']); // vendor license companion
const copyAllowed=(src,destPath)=>{
  const rel=path.relative(root,src);
  const ext=path.extname(src).toLowerCase();
  if(!ALLOWED_EXT.has(ext)&&!ALLOWED_DIR_FILES.has(path.basename(src)))
    throw Error('stage-site: non-allowlisted file would be published: '+rel);
  fs.mkdirSync(path.dirname(destPath),{recursive:true});
  fs.copyFileSync(src,destPath);
};
const walk=(dir,base)=>{
  for(const e of fs.readdirSync(dir,{withFileTypes:true})){
    if(e.name.startsWith('.'))continue; // never publish dotfiles
    const src=path.join(dir,e.name),rel=base?base+'/'+e.name:e.name;
    if(e.isDirectory())walk(src,rel);else copyAllowed(src,path.join(dest,rel));
  }
};
for(const name of ['assets','css','js'])walk(path.join(root,name),name);
console.log('Public assets staged in '+dest+'; Functions compile from repository functions/.');