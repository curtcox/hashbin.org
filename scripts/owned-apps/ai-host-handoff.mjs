// WebKit isolates popup openers and BroadcastChannel groups. Handoff uses only
// host-origin public keys and ciphertext; the receiver's private key stays in RAM.
export function createHostHandoff({bytes,text,encode64,decode64,bounded}){
const prefix='fragment-kit-ai-fleet:handoff:';
const validNonce=value=>typeof value==='string'&&/^[a-f0-9-]{36}$/.test(value);
const slot=(kind,nonce)=>{if(!['credentials','oauth'].includes(kind)||!validNonce(nonce))throw Error('Invalid host handoff.');return prefix+kind+':'+nonce;};
const derive=(privateKey,publicKey,usage)=>crypto.subtle.deriveKey({name:'ECDH',public:publicKey},privateKey,{name:'AES-GCM',length:256},false,usage);
const keyPair=()=>crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},false,['deriveKey']);
async function receiveHandoff({kind,app,onValue,onError=()=>{},storage=localStorage,timeout=600000}){
 const nonce=crypto.randomUUID(),name=slot(kind,nonce),pair=await keyPair(),expires=Date.now()+timeout;
 const publicKey=await crypto.subtle.exportKey('jwk',pair.publicKey);
 storage.setItem(name+':public',JSON.stringify({version:1,app,expires,publicKey}));
 let closed=false,busy=false;
 const close=()=>{if(closed)return;closed=true;clearInterval(timer);storage.removeItem(name+':public');storage.removeItem(name+':cipher');};
 const timer=setInterval(async()=>{
  if(closed||busy)return;if(Date.now()>expires){close();onError(Error('Host connection expired. Reopen it from the app.'));return;}
  busy=true;
  try{
   const raw=storage.getItem(name+':cipher');if(raw===null)return;
   const envelope=JSON.parse(bounded(raw,32768));storage.removeItem(name+':cipher');
   if(envelope.version!==1||typeof envelope.iv!=='string'||typeof envelope.cipher!=='string')throw Error('Invalid host handoff.');
   const remote=await crypto.subtle.importKey('jwk',envelope.publicKey,{name:'ECDH',namedCurve:'P-256'},false,[]),key=await derive(pair.privateKey,remote,['decrypt']);
   const iv=decode64(envelope.iv,32);if(iv.length!==12)throw Error('Invalid handoff nonce.');
   const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:bytes(name+'|'+app)},key,decode64(envelope.cipher,24576));
   const value=JSON.parse(text(new Uint8Array(plain)));bounded(JSON.stringify(value),16384);
   if(closed)return;close();try{await onValue(value);}catch{onError(Error('Host connection failed. Reopen it and try again.'));}
  }catch{if(!closed){close();onError(Error('Host connection failed. Reopen it and try again.'));}}finally{busy=false;}
 },100);
 return{nonce,close};
}
async function sendHandoff({kind,nonce,app,value,storage=localStorage}){
 const name=slot(kind,nonce),raw=storage.getItem(name+':public');if(raw===null)throw Error('Host connection expired. Reopen it from the app.');
 const pending=JSON.parse(bounded(raw,4096));if(pending.version!==1||pending.app!==app||!Number.isFinite(pending.expires)||Date.now()>pending.expires)throw Error('Host connection expired.');
 const publicKey=await crypto.subtle.importKey('jwk',pending.publicKey,{name:'ECDH',namedCurve:'P-256'},false,[]),pair=await keyPair(),key=await derive(pair.privateKey,publicKey,['encrypt']),iv=crypto.getRandomValues(new Uint8Array(12));
 const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:bytes(name+'|'+app)},key,bytes(bounded(JSON.stringify(value),16384)));
 const envelope=JSON.stringify({version:1,publicKey:await crypto.subtle.exportKey('jwk',pair.publicKey),iv:encode64(iv),cipher:encode64(new Uint8Array(cipher))});bounded(envelope,32768);storage.setItem(name+':cipher',envelope);
}

return{receiveHandoff,sendHandoff};
}
