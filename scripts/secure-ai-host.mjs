import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const AI_HTTPS_RULE={
  ref:'fragment_kit_ai_force_https',description:'Require HTTPS only for the AI credential host',enabled:true,
  expression:'(http.host eq "ai.hashbin.page" and not ssl)',action:'redirect',
  action_parameters:{from_value:{status_code:301,target_url:{expression:'concat("https://ai.hashbin.page", http.request.uri.path)'},preserve_query_string:true}}
};
/** Add/update only our hostname's redirect; never replace another app's zone rules. */
export async function secureAiHost({token,fetchSource=fetch}={}){
  if(!token)throw new Error('Cloudflare API token is required.');
  async function api(path,{method='GET',body,allow404=false}={}){
    const response=await fetchSource('https://api.cloudflare.com/client/v4'+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    if(allow404&&response.status===404)return null;
    const data=await response.json();if(!response.ok||!data.success)throw new Error('Cloudflare HTTPS configuration failed (HTTP '+response.status+').');return data.result;
  }
  const zones=await api('/zones?name=hashbin.page'),zone=zones.filter(value=>value.name==='hashbin.page');
  if(zone.length!==1||!/^[a-f0-9]{32}$/.test(zone[0].id))throw new Error('Expected the exact hashbin.page zone.');
  const base='/zones/'+zone[0].id,entry=await api(base+'/rulesets/phases/http_request_dynamic_redirect/entrypoint',{allow404:true});
  if(!entry)return api(base+'/rulesets',{method:'POST',body:{name:'AI host HTTPS redirect',kind:'zone',phase:'http_request_dynamic_redirect',rules:[AI_HTTPS_RULE]}});
  if(!/^[a-f0-9]{32}$/.test(entry.id)||!Array.isArray(entry.rules))throw new Error('Invalid redirect entrypoint.');
  const existing=entry.rules.find(rule=>rule.ref===AI_HTTPS_RULE.ref),target=base+'/rulesets/'+entry.id+'/rules';
  if(!existing)return api(target,{method:'POST',body:AI_HTTPS_RULE});
  const same=Object.entries(AI_HTTPS_RULE).every(([key,value])=>JSON.stringify(existing[key])===JSON.stringify(value));
  if(same)return entry;
  if(!/^[a-f0-9]{32}$/.test(existing.id))throw new Error('Invalid AI redirect rule.');
  return api(target+'/'+existing.id,{method:'PATCH',body:AI_HTTPS_RULE});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))secureAiHost({token:process.env.CLOUDFLARE_API_TOKEN}).then(()=>console.log('AI host HTTPS redirect configured.')).catch(error=>{console.error(error.message);process.exitCode=1;});
