import { readFile, mkdir, writeFile, access } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assetInventory } from './deploy-owned-apps.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const AI_HOST = Object.freeze({origin:'https://ai.hashbin.page', version:'0.4.3', allowedOrigins:['https://r.hashbin.page']});

/** Keep this credential origin separate from editors, previews, accounts and run origins. */
export function validateAiHost(config, version) {
  const origins=version==='0.4.0'?['https://python.hashbin.page']:version===AI_HOST.version?AI_HOST.allowedOrigins:null;
  if(!origins)throw new Error('AI host requires the registered exact kit version.');
  if(JSON.stringify(config.allowedOrigins)!==JSON.stringify(origins))throw new Error('AI host app origins require a registry review.');
}

/** Apply each origin policy only inside its immutable version directory. */
export function aiHostVersionHeaders(version, source) {
  if(!['0.4.0',AI_HOST.version].includes(version))throw new Error('Unregistered host version.');
  const csp=source.split('\n').find(line=>line.startsWith('  Content-Security-Policy:'));
  if(!csp)throw new Error('Staged host CSP is missing.');
  return '/v'+version+'/*\n'+csp+'\n';
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
  for(const [source,file] of [[resolve(previousKit),'ai-host.config.json'],[kit,'ai-host-r.config.json']]) {
    const pkg=JSON.parse(await readFile(join(source,'package.json'),'utf8'));
    const config=JSON.parse(await readFile(join(root,'scripts',file),'utf8'));
    validateAiHost(config,pkg.version);
    // Exact reviewed release checkout; never execute a remotely supplied module.
    // eslint-disable-next-line no-unsanitized/method, node/no-unsupported-features/es-syntax
    const {verifyManifest,sync}=await import(pathToFileURL(join(source,'tools','vendor-sync.mjs')));
    const pin=await sync({source,target:join(output,'.verified-kit')});
    await verifyManifest(pin,{published});
    const destination=join(output,'public','v'+pkg.version);
    try {await access(destination);throw new Error('Version already staged; never overwrite an immutable AI host.');}catch(error){if(error.code!=='ENOENT')throw error;}
    await mkdir(dirname(destination),{recursive:true});
    // eslint-disable-next-line no-unsanitized/method, node/no-unsupported-features/es-syntax
    const {stageAiHost}=await import(pathToFileURL(join(pin,'tools','stage-ai-host.mjs')));
    await stageAiHost({config,output:destination});
    headers.push(aiHostVersionHeaders(pkg.version,await readFile(join(destination,'_headers'),'utf8')));
  }
  // Cloudflare reads only the root header file. Scope every frame policy by version.
  await writeFile(join(output,'public','_headers'),headers.join('\n'));
  const assets=await assetInventory(join(output,'public'));
  await writeFile(join(output,'public','release.json'),JSON.stringify({origin:AI_HOST.origin,kitVersion:current.version,kitVersions:['0.4.0',current.version],publishedPinVerified:published,assets},null,2)+'\n');
  await writeFile(join(output,'wrangler.json'),JSON.stringify({name:'hashbin-ai-host',compatibility_date:'2026-11-08',workers_dev:false,preview_urls:false,routes:[{pattern:'ai.hashbin.page',custom_domain:true}],assets:{directory:'./public',not_found_handling:'none'}},null,2)+'\n');
  return output;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))stageAiHostDeployment({kit:process.argv[2],previousKit:process.argv[3]}).then(console.log).catch(error=>{console.error(error.message);process.exitCode=1;});
