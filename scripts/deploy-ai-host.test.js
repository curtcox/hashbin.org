import {describe,it,expect} from 'vitest';
import {AI_HOST,validateAiHost} from './deploy-ai-host.mjs';
describe('AI credential host registry',()=>{
  it('requires the reviewed kit version and exact pilot origin',()=>{
    expect(AI_HOST.origin).toBe('https://ai.hashbin.page');
    expect(()=>validateAiHost({allowedOrigins:['https://python.hashbin.page']},'0.4.0')).not.toThrow();
    for(const origin of ['https://curtcox.github.io','https://python.hashbin.app','https://pages.hashbin.us','https://hashbin.org','https://evil.example'])expect(()=>validateAiHost({allowedOrigins:[origin]},'0.4.0')).toThrow('registry review');
    expect(()=>validateAiHost({allowedOrigins:['https://python.hashbin.page','https://evil.example']},'0.4.0')).toThrow('registry review');
    expect(()=>validateAiHost({allowedOrigins:AI_HOST.allowedOrigins},'0.3.5')).toThrow('exact kit version');
  });
});
