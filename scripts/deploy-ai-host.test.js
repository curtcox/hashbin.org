import {describe,it,expect} from 'vitest';
import {AI_HOST,validateAiHost,aiHostVersionHeaders} from './deploy-ai-host.mjs';
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
