import {describe,it,expect} from 'vitest';
import {AI_HOST,FLEET_HOST,SLIDES_HOST,assertAiHostPreserved,validateAiHost,aiHostVersionHeaders} from './deploy-ai-host.mjs';
describe('AI credential host registry',()=>{
  it('keeps Python and R response policies in separate version paths',()=>{
    const policy=origin=>'/*\n  Content-Security-Policy: frame-ancestors '+origin+'\n';
    const headers=aiHostVersionHeaders('0.4.0',policy('https://python.hashbin.page'))+'\n'+aiHostVersionHeaders('0.4.3',policy('https://r.hashbin.page'));
    expect(headers).toBe('/v0.4.0/*\n  Content-Security-Policy: frame-ancestors https://python.hashbin.page\n\n/v0.4.3/*\n  Content-Security-Policy: frame-ancestors https://r.hashbin.page\n');
    expect(()=>aiHostVersionHeaders('0.4.2',policy('https://r.hashbin.page'))).toThrow('Unregistered');
    expect(()=>aiHostVersionHeaders('0.4.3','')).toThrow('missing');
  });
  it('requires each reviewed version and its exact app origin',()=>{
    expect(AI_HOST.origin).toBe('https://ai.hashbin.page');
    expect(()=>validateAiHost({allowedOrigins:['https://python.hashbin.page']},'0.4.0')).not.toThrow();
    expect(()=>validateAiHost({allowedOrigins:['https://r.hashbin.page']},'0.4.3')).not.toThrow();
    expect(()=>validateAiHost({allowedOrigins:['https://r.hashbin.page']},'0.4.0')).toThrow('registry review');
    expect(()=>validateAiHost({allowedOrigins:['https://python.hashbin.page']},'0.4.3')).toThrow('registry review');
    expect(()=>validateAiHost({allowedOrigins:['https://r.hashbin.page','https://python.hashbin.page']},'0.4.3')).toThrow('registry review');
    for(const origin of ['https://curtcox.github.io','https://python.hashbin.app','https://pages.hashbin.us','https://hashbin.org','https://evil.example'])expect(()=>validateAiHost({allowedOrigins:[origin]},'0.4.0')).toThrow('registry review');
    expect(()=>validateAiHost({allowedOrigins:['https://python.hashbin.page','https://evil.example']},'0.4.0')).toThrow('registry review');
    expect(()=>validateAiHost({allowedOrigins:AI_HOST.allowedOrigins},'0.3.5')).toThrow('exact kit version');
  });
});

describe('remaining-client credential host',()=>{
 it('allows exactly the reviewed nine app origins, separately from Python and R',()=>{
  expect(FLEET_HOST.allowedOrigins).toHaveLength(9);
  expect(()=>validateAiHost({allowedOrigins:FLEET_HOST.allowedOrigins},FLEET_HOST.path)).not.toThrow();
  for(const origin of ['https://r.hashbin.page','https://python.hashbin.page','https://curtcox.github.io','https://apptron-vm.hashbin.page','https://evil.example'])expect(()=>validateAiHost({allowedOrigins:[...FLEET_HOST.allowedOrigins,origin]},FLEET_HOST.path)).toThrow('registry review');
 });
 it('scopes isolated-frame compatibility headers to the new entry only',()=>{
  const source='/*\n  Content-Security-Policy: frame-ancestors '+FLEET_HOST.allowedOrigins.join(' ')+'\n';
  const headers=aiHostVersionHeaders(FLEET_HOST.path,source);
  expect(headers).toContain('/fleet-v0.4.3/*\n');
  expect(headers).toContain('Cross-Origin-Embedder-Policy: require-corp');
  expect(headers).toContain('Cross-Origin-Resource-Policy: cross-origin');
  expect(aiHostVersionHeaders('0.4.3',source)).not.toContain('Cross-Origin-Embedder');
 });
});

describe('Slidev credential host',()=>{
 it('allows only the Slidev canonical origin on its own v0.4.4 entry',()=>{
  expect(SLIDES_HOST).toEqual({path:'slides-v0.4.4',kitVersion:'0.4.4',allowedOrigins:['https://slides.hashbin.page']});
  expect(()=>validateAiHost({allowedOrigins:SLIDES_HOST.allowedOrigins},SLIDES_HOST.path)).not.toThrow();
  for(const origin of ['https://curtcox.github.io','https://r.hashbin.page','https://evil.example'])expect(()=>validateAiHost({allowedOrigins:[...SLIDES_HOST.allowedOrigins,origin]},SLIDES_HOST.path)).toThrow('registry review');
  for(const version of ['0.4.0','0.4.3',FLEET_HOST.path])expect(()=>validateAiHost({allowedOrigins:SLIDES_HOST.allowedOrigins},version)).toThrow('registry review');
 });
 it('scopes its policy to the new path without fleet isolation headers',()=>{
  const headers=aiHostVersionHeaders(SLIDES_HOST.path,'/*\n  Content-Security-Policy: frame-ancestors https://slides.hashbin.page\n');
  expect(headers).toBe('/slides-v0.4.4/*\n  Content-Security-Policy: frame-ancestors https://slides.hashbin.page\n');
 });
});

describe('published host immutability',()=>{
 const entry={bytes:3,sha256:'a'.repeat(64)},assets={'v0.4.0/host.html':entry,'v0.4.3/host.html':entry,'fleet-v0.4.3/fleet-host.mjs':entry};
 const fetchSource=async()=>new Response(JSON.stringify({assets}));
 it('retains every prior version, including the new fleet entry on later deployments',async()=>{expect(await assertAiHostPreserved({...assets,'new-entry/host.html':entry},fetchSource)).toBe(3);for(const path of Object.keys(assets))await expect(assertAiHostPreserved({...assets,[path]:{...entry,sha256:'b'.repeat(64)}},fetchSource)).rejects.toThrow('immutable');await expect(assertAiHostPreserved({},fetchSource)).rejects.toThrow('immutable');});
 it('bounds inventory bytes before UTF-8 decoding and rejects unavailable or malformed inventories',async()=>{await expect(assertAiHostPreserved({},async()=>new Response('x'.repeat(1024*1024+1)))).rejects.toThrow('exceeds');await expect(assertAiHostPreserved({},async()=>new Response('',{status:503}))).rejects.toThrow('unavailable');await expect(assertAiHostPreserved({},async()=>new Response('{"assets":{"../outside":{"bytes":3,"sha256":"bad"}}}'))).rejects.toThrow('path');});
});
