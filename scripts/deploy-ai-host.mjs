import {createHash} from 'node:crypto';
import { readFile, mkdir, writeFile, access } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assetInventory } from './deploy-owned-apps.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const AI_HOST = Object.freeze({origin:'https://ai.hashbin.page', version:'0.4.3', allowedOrigins:['https://r.hashbin.page']});

export const FLEET_HOST=Object.freeze({path:'fleet-v0.4.3',kitVersion:'0.4.3',allowedOrigins:["https://gnuplot.hashbin.page", "https://livelier.hashbin.page", "https://audio.hashbin.page", "https://pages.hashbin.page", "https://manim.hashbin.page", "https://apptron.hashbin.page", "https://sheets.hashbin.page", "https://modl.hashbin.page", "https://gripeline.hashbin.page"]});

/** Keep this credential origin separate from editors, previews, accounts and run origins. */
export function validateAiHost(config, version) {
  const origins=version===FLEET_HOST.path?FLEET_HOST.allowedOrigins:version==='0.4.0'?['https://python.hashbin.page']:version===AI_HOST.version?AI_HOST.allowedOrigins:null;
  if(!origins)throw new Error('AI host requires the registered exact kit version.');
  if(JSON.stringify(config.allowedOrigins)!==JSON.stringify(origins))throw new Error('AI host app origins require a registry review.');
}

/** Apply each origin policy only inside its immutable version directory. */
export function aiHostVersionHeaders(version, source) {
  if(!['0.4.0',AI_HOST.version,FLEET_HOST.path].includes(version))throw new Error('Unregistered host version.');
  const csp=source.split('\n').find(line=>line.startsWith('  Content-Security-Policy:'));
  if(!csp)throw new Error('Staged host CSP is missing.');
  return '/'+(version===FLEET_HOST.path?version:'v'+version)+'/*\n'+csp+'\n'+(version===FLEET_HOST.path?'  Cross-Origin-Opener-Policy: same-origin\n  Cross-Origin-Embedder-Policy: require-corp\n  Cross-Origin-Resource-Policy: cross-origin\n':'');
}

/** Every previously published versioned byte must survive a later host deployment. */
export async function assertAiHostPreserved(assets,fetchSource=globalThis.fetch){
  const response=await fetchSource(AI_HOST.origin+'/release.json',{cache:'no-store',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(20000)});
  if(!response.ok||!response.body)throw new Error('Published AI host inventory is unavailable; do not deploy.');
  const reader=response.body.getReader(),chunks=[];let length=0;
  try{for(;;){const{done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>1024*1024){await reader.cancel();throw new Error('Published AI host inventory exceeds its limit.');}chunks.push(value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  const previous=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  if(!previous.assets||typeof previous.assets!=='object'||Array.isArray(previous.assets))throw new Error('Invalid published AI host inventory.');
  let preserved=0;
  for(const[name,entry]of Object.entries(previous.assets)){
    if(name.length>2048||!/^[A-Za-z0-9._/-]+$/.test(name)||name.split('/').some(part=>!part||part==='..'))throw new Error('Invalid published AI host asset path.');
    if(!name.includes('/'))continue; // Root metadata and the scoped header table can grow.
    if(!entry||!Number.isSafeInteger(entry.bytes)||entry.bytes<0||typeof entry.sha256!=='string'||!/^[a-f0-9]{64}$/.test(entry.sha256))throw new Error('Invalid published AI host asset record.');
    const current=assets[name];if(!current||current.bytes!==entry.bytes||current.sha256!==entry.sha256)throw new Error('Published AI host asset is immutable: '+name);
    preserved++;
  }
  if(!preserved)throw new Error('Published AI host inventory has no retained versions.');
  return preserved;
}

/** Stage a new version; preserve every existing version when assembling a later deployment. */
export async function stageAiHostDeployment({kit, previousKit, output=join(root,'build-reports','ai-host'), published=true}={}) {
  if(!kit||!previousKit)throw new Error('Exact current and previous Fragment Kit checkouts are required.');
  kit=resolve(kit);output=resolve(output);
  const current=JSON.parse(await readFile(join(kit,'package.json'),'utf8'));
  if(current.version!==AI_HOST.version)throw new Error('Current AI host requires the registered exact kit version.');
  const previous=JSON.parse(await readFile(join(resolve(previousKit),'package.json'),'utf8'));
  if(previous.version!=='0.4.0')throw new Error('Retain the exact previously deployed kit version.');
  const headers=['/*\n  Strict-Transport-Security: max-age=31536000\n  Referrer-Policy: no-referrer\n  X-Content-Type-Options: nosniff\n'];
  for(const [source,file,entry] of [[resolve(previousKit),'ai-host.config.json','0.4.0'],[kit,'ai-host-r.config.json','0.4.3'],[kit,'ai-host-fleet.config.json',FLEET_HOST.path]]) {
    const pkg=JSON.parse(await readFile(join(source,'package.json'),'utf8'));
    const config=JSON.parse(await readFile(join(root,'scripts',file),'utf8'));
    validateAiHost(config,entry);
    // Exact reviewed release checkout; never execute a remotely supplied module.
    // eslint-disable-next-line no-unsanitized/method, node/no-unsupported-features/es-syntax
    const {verifyManifest,sync}=await import(pathToFileURL(join(source,'tools','vendor-sync.mjs')));
    const pin=await sync({source,target:join(output,'.verified-kit')});
    await verifyManifest(pin,{published});
    const destination=join(output,'public',entry===FLEET_HOST.path?entry:'v'+pkg.version);
    try {await access(destination);throw new Error('Version already staged; never overwrite an immutable AI host.');}catch(error){if(error.code!=='ENOENT')throw error;}
    await mkdir(dirname(destination),{recursive:true});
    // eslint-disable-next-line no-unsanitized/method, node/no-unsupported-features/es-syntax
    const {stageAiHost}=await import(pathToFileURL(join(pin,'tools','stage-ai-host.mjs')));
    await stageAiHost({config,output:destination});
    if(entry===FLEET_HOST.path){
      await writeFile(join(destination,'fleet-host.mjs'),await readFile(join(root,'scripts/owned-apps/ai-fleet-host.mjs')));
      await writeFile(join(destination,'ai-host-handoff.mjs'),await readFile(join(root,'scripts/owned-apps/ai-host-handoff.mjs')));
      await writeFile(join(destination,'LICENSE-fragment-kit'),await readFile(join(root,'scripts/owned-apps/ai-fleet-host.LICENSE')));
      const html=await readFile(join(destination,'host.html'),'utf8');
      await writeFile(join(destination,'host.html'),html.replace('src="src/ai/host/host.js"','src="fleet-host.mjs"'));
      const inventory=await assetInventory(destination),files=Object.fromEntries(Object.entries(inventory).filter(([name])=>name!=='ai-host-manifest.json').map(([name,entry])=>[name,entry.sha256]));
      await writeFile(join(destination,'ai-host-manifest.json'),JSON.stringify({protocol:1,version:createHash('sha256').update(JSON.stringify(files)).digest('hex').slice(0,24),files},null,2)+'\n');
    }
    headers.push(aiHostVersionHeaders(entry,await readFile(join(destination,'_headers'),'utf8')));
  }
  // Cloudflare reads only the root header file. Scope every frame policy by version.
  await writeFile(join(output,'public','_headers'),headers.join('\n'));
  const assets=await assetInventory(join(output,'public'));
  const preservedAssets=published?await assertAiHostPreserved(assets):0;
  await writeFile(join(output,'public','release.json'),JSON.stringify({origin:AI_HOST.origin,kitVersion:current.version,kitVersions:['0.4.0',current.version],hostEntries:['v0.4.0','v0.4.3',FLEET_HOST.path],publishedPinVerified:published,preservedAssets,assets},null,2)+'\n');
  await writeFile(join(output,'wrangler.json'),JSON.stringify({name:'hashbin-ai-host',compatibility_date:'2026-11-08',workers_dev:false,preview_urls:false,routes:[{pattern:'ai.hashbin.page',custom_domain:true}],assets:{directory:'./public',not_found_handling:'none'}},null,2)+'\n');
  return output;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))stageAiHostDeployment({kit:process.argv[2],previousKit:process.argv[3]}).then(console.log).catch(error=>{console.error(error.message);process.exitCode=1;});
