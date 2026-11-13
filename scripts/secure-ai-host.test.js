import {describe,it,expect} from 'vitest';
import {AI_HTTPS_RULE,secureAiHost,checkAiHttps} from './secure-ai-host.mjs';
const zone={name:'hashbin.page',id:'a'.repeat(32)},ruleset='b'.repeat(32);
function api(entry){const calls=[];return{calls,fetchSource:async(url,options)=>{calls.push({url,...options});const result=url.includes('/zones?')?[zone]:url.endsWith('/entrypoint')?entry:{};return new Response(JSON.stringify({success:true,result}),{status:entry===null&&url.endsWith('/entrypoint')?404:200});}};}
describe('AI-host-only HTTPS enforcement',()=>{
 it('adds one hostname-scoped rule without replacing existing rules',async()=>{const mock=api({id:ruleset,rules:[{id:'c'.repeat(32),ref:'other_app',action:'redirect'}]});await secureAiHost({token:'test',fetchSource:mock.fetchSource});expect(mock.calls.at(-1).method).toBe('POST');expect(mock.calls.at(-1).url.endsWith('/rulesets/'+ruleset+'/rules')).toBe(true);expect(JSON.parse(mock.calls.at(-1).body)).toEqual(AI_HTTPS_RULE);expect(AI_HTTPS_RULE.expression).toBe('(http.host eq "ai.hashbin.page" and not ssl)');expect(AI_HTTPS_RULE.action_parameters.from_value.preserve_query_string).toBe(true);});
 it('is idempotent and creates an entrypoint only when absent',async()=>{let mock=api({id:ruleset,rules:[{...AI_HTTPS_RULE,id:'d'.repeat(32)}]});await secureAiHost({token:'test',fetchSource:mock.fetchSource});expect(mock.calls).toHaveLength(2);mock=api(null);await secureAiHost({token:'test',fetchSource:mock.fetchSource});expect(JSON.parse(mock.calls.at(-1).body).rules).toEqual([AI_HTTPS_RULE]);});
 it('fails before writes when the token or exact zone is unavailable',async()=>{const mock=api(null);await expect(secureAiHost({fetchSource:mock.fetchSource})).rejects.toThrow('token');expect(mock.calls).toHaveLength(0);await expect(secureAiHost({token:'test',fetchSource:async()=>new Response(JSON.stringify({success:true,result:[]}))})).rejects.toThrow('exact hashbin.page');});
});

it('accepts only a same-host HTTPS redirect preserving the exact path and query',async()=>{
 const expected='https://ai.hashbin.page/v0.4.0/host.html?fragment_kit_https_probe=1';
 for(const target of [expected,'http://ai.hashbin.page/v0.4.0/host.html?fragment_kit_https_probe=1','https://evil.example/v0.4.0/host.html?fragment_kit_https_probe=1','https://ai.hashbin.page/v0.4.0/host.html']){
  const result=await checkAiHttps({fetchSource:async(url,options)=>{expect(options.credentials).toBe('omit');expect(options.redirect).toBe('manual');expect(options.headers).toBeUndefined();return new Response(null,{status:301,headers:{Location:target}});}});
  expect(result).toBe(target===expected);
 }
});
