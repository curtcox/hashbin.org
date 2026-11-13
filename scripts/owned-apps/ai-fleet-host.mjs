// Consumer host UI adapted from published Fragment Kit 0.4.3 (MIT). Engines and protocol stay pinned.
// COOP-isolated editors sever popup opener access. An encrypted same-origin handoff keeps keys on this host.
import {createHostHandoff} from './ai-host-handoff.mjs';
import {bytes,text,encode64,decode64,bounded} from './src/core/bytes.js';
const{receiveHandoff,sendHandoff}=createHostHandoff({bytes,text,encode64,decode64,bounded});
import { createAi } from './src/ai/client.js';
import { installAiHost } from './src/ai/host/protocol.js';
import { createStorage } from './src/core/storage.js';
import { element } from './src/ui/dialog.js';
import { endpoint, sha256 } from './src/ai/data.js';
import { jsonResponse,requestOptions } from './src/ai/drivers/http.js';
// OAuth callbacks also use encrypted host-only handoff: COOP may sever their opener.
async function handleHostCallback(){
 const url=new URL(location.href),denied=url.searchParams.has('error');
 if(!url.searchParams.has('state')||(!url.searchParams.has('code')&&!denied))return false;
 const state=url.searchParams.get('state'),code=url.searchParams.get('code');
 for(const key of ['code','state','error','error_description'])url.searchParams.delete(key);history.replaceState(null,'',url);
 if((code?.length??0)>8192)throw Error('Invalid authorization callback.');
 await sendHandoff({kind:'oauth',nonce:state,app:url.origin,value:{state,...denied?{error:true}:{code}}});
 document.getElementById('host-status').textContent='Authorization returned. You can close this window.';window.close();return true;
}
async function prepareHostSignIn({callbackURL,connect}){
 const verifier=encode64(crypto.getRandomValues(new Uint8Array(32))),challenge=encode64(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes(verifier))));
 let complete,fail,popup,used=false;const result=new Promise((resolve,reject)=>{complete=resolve;fail=reject;});result.catch(()=>{});
 const receiver=await receiveHandoff({kind:'oauth',app:location.origin,onError:fail,onValue:async data=>{
  try{if(data.error||data.state!==receiver.nonce||typeof data.code!=='string'||data.code.length>8192)throw Error();
   const raw=await jsonResponse(await fetch('https://openrouter.ai/api/v1/auth/keys',requestOptions({code:data.code,code_verifier:verifier,code_challenge_method:'S256'},{},AbortSignal.timeout(20000))));
   if(typeof raw.key!=='string'||!raw.key||raw.key.length>8192)throw Error();await connect('openrouter',raw.key);complete();popup?.close();
  }catch{fail(Error('Sign-in failed or was cancelled. Reopen the connection window.'));}
 }});
 addEventListener('pagehide',()=>receiver.close(),{once:true});
 const url=new URL('https://openrouter.ai/auth');url.search=new URLSearchParams({callback_url:callbackURL,code_challenge:challenge,code_challenge_method:'S256',state:receiver.nonce});
 return{start(){if(used)throw Error('Prepare a new sign-in.');used=true;popup=window.open(url.href,'_blank','popup,width=560,height=720');if(!popup){receiver.close();fail(Error('Allow popups and try again.'));}return result;}};
}
const status = document.getElementById('host-status'), controls = document.getElementById('host-controls');
const noopType = { type: 'ai-host', normalize: value => value };
try {
  if (!await handleHostCallback()) {
  const config = await jsonResponse(await fetch(new URL('./ai-host.config.json', import.meta.url)), 65536);
  const here = new URL(location.href), app = here.searchParams.get('app');
  const prefixFor = async origin => `${config.storagePrefix}-${(await sha256(origin)).slice(0, 24)}`;
  const credentialForm=(onConnect,origin)=>{
    document.getElementById('host-app').textContent = `Allow AI requests from ${origin}. Prompts go to the selected provider. Each app has its own consent and budget.`;
    const route = element('select', null, { 'aria-label': 'Provider' });
    for (const value of config.routes.filter(r => ['openai', 'openrouter', 'anthropic', 'gemini'].includes(r))) route.append(element('option', value, { value }));
    const key = element('input', null, { type: 'password', autocomplete: 'off', 'aria-label': 'API key' });
    const remember = element('input', null, { type: 'checkbox', 'aria-label': 'Remember key on this AI host' });
    const rememberLabel = element('label', ' Remember this key on the separate AI host for this app. Host scripts can read remembered keys.'); rememberLabel.prepend(remember);
    const cap = element('input', null, { type: 'number', min: '0', step: '.01', value: '0', 'aria-label': 'App spending cap (USD)' });
    const approve = element('button', 'Allow this app and connect', { type: 'button' });
    approve.onclick = async () => {
      const value = key.value; key.value = '';
      if (!value || !Number.isFinite(Number(cap.value)) || Number(cap.value) < 0) { status.textContent = 'Enter your key and a valid spending cap.'; return; }
      try{await onConnect({route:route.value,key:value,cap:Number(cap.value),remember:remember.checked});}catch{status.textContent='The connection expired or was rejected. Reopen it from the app.';}
    };
    const signIn=element('button','Sign in with OpenRouter',{type:'button'}); signIn.disabled=true;
    let oauth;
    if(config.routes.includes('openrouter')) {
      const callback=new URL(location.href);callback.search=callback.hash='';
      void prepareHostSignIn({callbackURL:callback.href,connect:(route,key)=>onConnect({route,key,cap:Number(cap.value),remember:remember.checked})}).then(prepared=>{oauth=prepared;signIn.disabled=false;},()=>{status.textContent='Sign-in storage is unavailable. Reopen this connection or use paste handoff.';});
      signIn.onclick=()=>{if(!Number.isFinite(Number(cap.value))||Number(cap.value)<0){status.textContent='Enter a valid spending cap.';return;}signIn.disabled=true;oauth.start().catch(()=>{status.textContent='Sign-in failed or was cancelled. Reopen the connection window to try again.';});};
    }
    controls.replaceChildren(element('p', 'Session keys stay on this separate AI host. Nothing is stored on the editor’s origin. Remember keeps the key for this app on this host.'), route, key, element('label', 'Maximum spend for this app (USD)'), cap, rememberLabel, approve);
    if(config.routes.includes('openrouter'))controls.append(signIn);
  };
  if (window.parent === window && app) {
    if (!config.allowedOrigins.includes(app) || endpoint(app).origin !== app) throw new Error('This app is not allowed to use this AI host.');
    // A fresh receiver on this host is required; a forgotten or expired popup cannot restore a key.
    const nonce = here.searchParams.get('session');
    if(!/^[a-f0-9-]{36}$/.test(nonce??''))throw Error('Reopen the connection window from the app.');
    credentialForm(async credentials => {
      await sendHandoff({kind:'credentials',nonce,app,value:credentials});
      status.textContent='Key sent privately to the host session. You can close this window.';window.close();

    }, app);
  } else if (window.parent !== window) {
    const approvedModels = new Map(),stores=new WeakMap();
    installAiHost({ authorizeDownload: (origin, cid) => approvedModels.get(origin)?.has(cid) === true, onModel: ({ ai, origin, cid, manifest, bytes }) => {
      const info = element('p', `${manifest.name}: ${bytes} bytes; licence ${manifest.license.id} (${manifest.license.url}); source ${manifest.source}; memory ${manifest.requires.memoryBytes} bytes; mirrors ${JSON.stringify(manifest.mirrors)}. Hash verification proves unchanged bytes, not model quality.`);
      const approve = element('button', 'Approve and download this model on the AI host', { type: 'button' });
      approve.onclick = async () => { try { await ai.downloadModel(cid, { consent: true }); const approved = approvedModels.get(origin) ?? new Set(); approved.add(cid); approvedModels.set(origin, approved); ai.consent('This device'); status.textContent = 'Verified model downloaded on the host. Return to the app.'; } catch (error) { status.textContent = error.message; } }; controls.append(info, approve);
    }, allowedOrigins: config.allowedOrigins, createClient: async origin => {
      const prefix = await prefixFor(origin);
      const ai = await createAi({ config: { name: config.name, canonicalOrigin: here.origin + '/', storagePrefix: prefix, ai: { deployments: { [here.origin + '/']: { connection: 'direct' } }, routes: config.routes, models: config.models, budget: { total: 0, day: 0, month: 0 } } }, type: noopType, storage: createStorage({ prefix }) });
      const storage = createStorage({ prefix });stores.set(ai,storage);
      for (const route of config.routes) {
        const raw = storage.getItem(`ai:connection:${route}`); if (!raw) continue;
        try { const saved = JSON.parse(raw); ai.connect(route, saved.key); ai.budget.configure({ total: saved.cap, day: saved.cap, month: saved.cap }); for (const model of await ai.models()) if (model.ref.startsWith(route + ':')) ai.consent(model.destination); } catch { storage.removeItem(`ai:connection:${route}`); }
      }
      return ai;
    }, onConnection: ({ ai, origin }) => {
      let receiver,generation=0,closed=false;const storage=stores.get(ai);
      const button = element('button', 'Connect on AI host', { type: 'button' });
      const prepare=async()=>{
        if(closed)return;const own=++generation;receiver?.close();button.disabled=true;
        const pending=await receiveHandoff({kind:'credentials',app:origin,onError:error=>{if(own!==generation)return;status.textContent=error.message;void prepare().catch(()=>{button.disabled=true;});},onValue:async c=>{
          if(own!==generation||closed)return;
          if(!c||!config.routes.includes(c.route)||!['openai','openrouter','anthropic','gemini'].includes(c.route)||typeof c.key!=='string'||!c.key||c.key.length>8192||!Number.isFinite(c.cap)||c.cap<0||typeof c.remember!=='boolean')throw Error('Invalid host connection.');
          ai.connect(c.route,c.key);ai.budget.configure({total:c.cap,day:c.cap,month:c.cap});
          // Persist only after this current receiver accepts the user's explicit Remember choice.
          const name='ai:connection:'+c.route;let remembered=true;
          try{if(c.remember)storage.setItem(name,JSON.stringify({route:c.route,key:c.key,cap:c.cap,remember:true}));else storage.removeItem(name);}catch{remembered=false;}
          for(const model of await ai.models())if(model.ref.startsWith(c.route+':'))ai.consent(model.destination);
          if(own!==generation||closed)return;
          status.textContent='Connected for this app and session. Return to Ask.'+(!remembered?' Host storage is unavailable; this connection is session only.':'');void prepare().catch(()=>{button.disabled=true;});
        }});
        if(own!==generation||closed){pending.close();return;}receiver=pending;button.disabled=false;
      };
      void prepare().catch(()=>{status.textContent='Host storage is unavailable. Use paste handoff or reopen this connection.';});
      addEventListener('pagehide',()=>{closed=true;generation++;receiver?.close();},{once:true});
      button.onclick=()=>{
        const url=new URL(location.href);url.search=new URLSearchParams({app:origin,session:receiver.nonce});
        const popup=window.open(url.href,'_blank','popup,width=560,height=720');
        status.textContent=popup?'Connect in the host window, then return to the app.':'Allow popups and try again.';
      };

      const forget = element('button', 'Forget this app on the AI host', { type: 'button' });
      forget.onclick = () => { generation++;receiver?.close();ai.disconnect();void prepare().catch(()=>{}); for (const route of config.routes) storage.removeItem(`ai:connection:${route}`); approvedModels.delete(origin); status.textContent = 'App credentials and consent removed from this host.'; };
      controls.replaceChildren(button, forget); document.getElementById('host-app').textContent = `Connection for ${origin}`;

    } });
  } else status.textContent = 'Open AI settings from an allowed app to connect.';
  }
} catch (error) { status.textContent = error.message; }
