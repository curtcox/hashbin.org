import { readFile, mkdir, writeFile, access } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assetInventory } from './deploy-owned-apps.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const AI_HOST = Object.freeze({origin:'https://ai.hashbin.page', version:'0.4.0', allowedOrigins:['https://python.hashbin.page']});

/** Keep this credential origin separate from editors, previews, accounts and run origins. */
export function validateAiHost(config, version) {
  if(version!==AI_HOST.version)throw new Error('AI host requires the registered exact kit version.');
  if(JSON.stringify(config.allowedOrigins)!==JSON.stringify(AI_HOST.allowedOrigins))throw new Error('AI host app origins require a registry review.');
}

/** Stage a new version; preserve every existing version when assembling a later deployment. */
export async function stageAiHostDeployment({kit, output=join(root,'build-reports','ai-host'), published=true}={}) {
  if(!kit)throw new Error('An exact Fragment Kit checkout is required.');
  kit=resolve(kit);output=resolve(output);
  const pkg=JSON.parse(await readFile(join(kit,'package.json'),'utf8'));
  const config=JSON.parse(await readFile(join(root,'scripts','ai-host.config.json'),'utf8'));
  validateAiHost(config,pkg.version);
  // Exact operator-selected local checkout; Node 22 supports native dynamic import.
  // eslint-disable-next-line no-unsanitized/method, node/no-unsupported-features/es-syntax
  const {verifyManifest,sync}=await import(pathToFileURL(join(kit,'tools','vendor-sync.mjs')));
  const pin=await sync({source:kit,target:join(output,'.verified-kit')});
  await verifyManifest(pin,{published});
  const destination=join(output,'public','v'+pkg.version);
  try {await access(destination);throw new Error('Version already staged; never overwrite an immutable AI host.');}catch(error){if(error.code!=='ENOENT')throw error;}
  await mkdir(dirname(destination),{recursive:true});
  // The copied kit passed the published manifest check before this import.
  // eslint-disable-next-line no-unsanitized/method, node/no-unsupported-features/es-syntax
  const {stageAiHost}=await import(pathToFileURL(join(pin,'tools','stage-ai-host.mjs')));
  await stageAiHost({config,output:destination});
  // Cloudflare applies only the root _headers. All kit paths stay under /vX.Y.Z/.
  await writeFile(join(output,'public','_headers'),await readFile(join(destination,'_headers')));
  const assets=await assetInventory(join(output,'public'));
  await writeFile(join(output,'public','release.json'),JSON.stringify({origin:AI_HOST.origin,kitVersion:pkg.version,publishedPinVerified:published,assets},null,2)+'\n');
  await writeFile(join(output,'wrangler.json'),JSON.stringify({name:'hashbin-ai-host',compatibility_date:'2026-11-08',workers_dev:false,preview_urls:false,routes:[{pattern:'ai.hashbin.page',custom_domain:true}],assets:{directory:'./public',not_found_handling:'none'}},null,2)+'\n');
  return output;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))stageAiHostDeployment({kit:process.argv[2]}).then(console.log).catch(error=>{console.error(error.message);process.exitCode=1;});
