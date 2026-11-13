import {it,expect} from 'vitest';
import {createHostHandoff} from './ai-host-handoff.mjs';
const bytes=value=>new TextEncoder().encode(value),text=value=>new TextDecoder('utf-8',{fatal:true}).decode(value);
const bounded=(value,max)=>{if((typeof value==='string'?bytes(value):value).length>max)throw Error('Bound exceeded');return value;};
const encode64=value=>Buffer.from(value).toString('base64url'),decode64=(value,max)=>bounded(new Uint8Array(Buffer.from(value,'base64url')),max);
const{receiveHandoff,sendHandoff}=createHostHandoff({bytes,text,encode64,decode64,bounded});
const store=()=>{const values=new Map();return{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key),values};};
it('hands a key only to its in-memory receiver; storage contains public data and authenticated ciphertext',async()=>{
 const storage=store(),key='synthetic-session-key',app='https://apptron.hashbin.page';let complete;const value=new Promise(resolve=>complete=resolve);
 const receiver=await receiveHandoff({kind:'credentials',app,storage,onValue:complete});
 try{await sendHandoff({kind:'credentials',nonce:receiver.nonce,app,value:{key},storage});expect(JSON.stringify([...storage.values])).not.toContain(key);expect(await value).toEqual({key});expect(storage.values.size).toBe(0);}finally{receiver.close();}
});
it('rejects cross-app, expired, oversized and missing-receiver handoffs before writing a credential',async()=>{
 const storage=store(),app='https://apptron.hashbin.page',receiver=await receiveHandoff({kind:'credentials',app,storage,onValue:()=>{throw Error('Must not deliver');}});
 try{await expect(sendHandoff({kind:'credentials',nonce:receiver.nonce,app:'https://evil.example',value:{key:'x'},storage})).rejects.toThrow('expired');await expect(sendHandoff({kind:'credentials',nonce:receiver.nonce,app,value:{key:'x'.repeat(17000)},storage})).rejects.toThrow('Bound');receiver.close();await expect(sendHandoff({kind:'credentials',nonce:receiver.nonce,app,value:{key:'x'},storage})).rejects.toThrow('expired');}finally{receiver.close();}
});
it('rejects tampered ciphertext and removes the handoff without invoking its consumer',async()=>{
 const storage=store(),app='https://apptron.hashbin.page';let delivered=false,complete;const failure=new Promise(resolve=>complete=resolve);const receiver=await receiveHandoff({kind:'credentials',app,storage,onValue:()=>{delivered=true;},onError:complete});
 try{await sendHandoff({kind:'credentials',nonce:receiver.nonce,app,value:{key:'synthetic'},storage});const name=[...storage.values.keys()].find(key=>key.endsWith(':cipher')),envelope=JSON.parse(storage.getItem(name));envelope.cipher='AA'+envelope.cipher.slice(2);storage.setItem(name,JSON.stringify(envelope));expect((await failure).message).toContain('failed');expect(delivered).toBe(false);expect(storage.values.size).toBe(0);}finally{receiver.close();}
});
it('expires abandoned sessions and prevents a late sender from retaining ciphertext',async()=>{
 const storage=store();let complete;const expired=new Promise(resolve=>complete=resolve);const receiver=await receiveHandoff({kind:'oauth',app:'https://ai.hashbin.page',storage,timeout:1,onValue:()=>{},onError:complete});try{expect((await expired).message).toContain('expired');expect(storage.values.size).toBe(0);}finally{receiver.close();}
});
