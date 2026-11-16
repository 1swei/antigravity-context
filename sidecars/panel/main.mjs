import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { MetricsStore } from './store.mjs';
import { DesktopUsage, UsageLedger } from './usage.mjs';
import { RuntimeUi, makeRendererSource } from '../../compat/runtime-ui.mjs';
import { platformPaths } from '../../compat/platform.mjs';
import { PreferencesStore } from '../../compat/preferences.mjs';
import { SidecarOwner } from '../../compat/sidecar-owner.mjs';
import { readHostTheme } from '../../compat/host-theme.mjs';
import { AppUpdater, releaseRuntimeDirectory } from './updater.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
// The host starts this sidecar in sidecars/panel. Windows holds the process's
// current directory open; release that handle before an update renames sidecars.
try { releaseRuntimeDirectory(join(HERE,'..','..')); } catch {}
const paths=platformPaths();
const isHostSidecar = Boolean(
  process.env.ANTIGRAVITY_SIDECAR_WEB_PORT ||
  process.env.ANTIGRAVITY_EXECUTABLE_DATA_DIR ||
  (process.env.ANTIGRAVITY_LS_ADDRESS && process.env.ANTIGRAVITY_CSRF_TOKEN)
);
const ownership=isHostSidecar?new SidecarOwner(paths.data):null;
let settingsCache={},settingsAt=-Infinity;
const owns=()=>(!ownership||ownership.owns())&&settingsCache.enabled!==false;
const store = new MetricsStore(undefined,{owns});
const localTimeZone=Intl.DateTimeFormat().resolvedOptions().timeZone||'Asia/Shanghai';
const usage=new DesktopUsage(store,new UsageLedger(undefined,{timeZone:localTimeZone}),{host:'app',owns});
store.onTrajectory=async(scope,id,raw,options={})=>{
  const {isCurrent=()=>true}=options;
  if(isCurrent()!==true)return;
  if((!ownership||await ownership.isOwner())&&isCurrent()===true)return usage.ingestLive(scope,id,raw,{...options,isCurrent});
};
store.onBackgroundResult=(scope,id,file,options)=>usage.ingestDisk(scope,id,file,options);
const preferences=new PreferencesStore();
const updater=new AppUpdater({pluginDir:join(HERE,'..','..'),dataDir:paths.data});
const metrics = async input => {
  if(ownership&&!await ownership.isOwner())throw Error('Sidecar ownership changed');
  runtimeSettings();
  const base=await store.snapshot(input);
  const forceSync=input?.usageSync===true,smartSync=!forceSync&&(input?.usageRefresh===true||input?.usageCheck===true);
  const syncPromise=forceSync?usage.sync(true):smartSync&&typeof usage.syncSmart==='function'?usage.syncSmart():null;
  if(smartSync&&syncPromise){
    await Promise.race([syncPromise.catch(()=>{}),new Promise(resolve=>setTimeout(resolve,80))]);
  }
  const usageData=await usage.snapshot({sync:forceSync});
  const update=typeof updater.publicState==='function'?updater.publicState():null;
  return {...base,usage:usageData,preferences:await preferences.snapshot(),theme:await readHostTheme(),integration:integration.health,...(update?{update}:{})};
};
const usageSource=()=>{const s=readFileSync(join(HERE,'..','..','compat','usage-ui.cjs'),'utf8');return `window.__agPulseUsageFactory=(${s.slice(s.indexOf('module.exports = ')+17).trim().replace(/;$/,'')});`;};
const inlineSource=()=>{
  const file=readFileSync(join(HERE,'..','..','compat','inline-widget.cjs'),'utf8');
  const i18n=readFileSync(join(HERE,'..','..','compat','i18n.cjs'),'utf8');
  const theme=readFileSync(join(HERE,'..','..','compat','theme.cjs'),'utf8');
  const extract=s=>s.slice(s.indexOf('module.exports = ')+'module.exports = '.length).trim().replace(/;$/,'');
  return usageSource()+`window.__agPulseI18nFactory=(${extract(i18n)});window.__agPulseThemeFactory=(${extract(theme)});(${extract(file)})();`;
};
const runtimeSettings = () => {
  if(Date.now()-settingsAt<1000)return settingsCache;
  let settings = {};
  try { settings = JSON.parse(readFileSync(paths.settings,'utf8').replace(/^\uFEFF/,'')); } catch {}
  try { if (JSON.parse(readFileSync(paths.pluginConfig,'utf8').replace(/^\uFEFF/,'')).plugins?.['antigravity-context']?.enabled === false) settings.enabled = false; } catch {}
  settingsCache=settings;settingsAt=Date.now();return settings;
};
const integration = new RuntimeUi({
  // Composer identity is authoritative. Unknown/new inline inputs request quota
  // only; SDK/HTTP panels keep the store's automatic most-recent selection.
  snapshot: input => metrics({...input,selectLatest:false}),
  preferences,
  updater,
  owner:ownership?.token,owns:()=>ownership?ownership.isOwner():true,
  source: makeRendererSource(readFileSync(join(HERE,'..','..','compat','i18n.cjs'),'utf8'),readFileSync(join(HERE,'..','..','compat','inline-widget.cjs'),'utf8'),readFileSync(join(HERE,'..','..','compat','theme.cjs'),'utf8'),ownership?.token,ownership?.startedAt,usageSource()),
  dataDir: paths.data,
  enabled: () => { const s = runtimeSettings(); return s.enabled !== false && s.inline !== false && s.mode !== 'legacy'; },
});

if (isHostSidecar) {
  if(!await ownership.claim())process.exit(0);
  integration.start();
  // Automatic background update check on startup and every 6 hours.
  let startupUpdateTimer=null,periodicUpdateTimer=null;
  const runAutoUpdateCheck=()=>{if(typeof updater.check==='function')void updater.check({silent:true}).catch(()=>{});};
  if(typeof updater.current==='function')void updater.current().then(v=>{if(updater.state&&!updater.state.currentVersion)updater.state={...updater.state,currentVersion:v};}).catch(()=>{});
  startupUpdateTimer=setTimeout(runAutoUpdateCheck,5000);startupUpdateTimer.unref?.();
  periodicUpdateTimer=setInterval(runAutoUpdateCheck,6*60*60*1000);periodicUpdateTimer.unref?.();
  const shutdown=async()=>{
    clearTimeout(startupUpdateTimer);clearInterval(periodicUpdateTimer);
    usage.dispose();store.dispose();
    const exitTimer=setTimeout(()=>process.exit(0),2000);exitTimer.unref();
    await integration.stop();ownership.stop();process.exit(0);
  };
  ownership.watch(shutdown);
  updater.onReload=()=>void shutdown();
  for (const signal of ['SIGTERM','SIGINT']) process.once(signal, () => {
    void shutdown();
  });
} else {
  // Lightweight local JSON/inline preview server when started outside Antigravity.
  const port = Number(process.env.AG_PULSE_PORT || 17891);
  const server = createServer(async (req, res) => {
    const host = req.headers.host || '';
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) { res.writeHead(403); res.end(); return; }
    const url = new URL(req.url, `http://${host}`);
    if (url.pathname === '/api/preferences') {
      const sameOrigin=req.headers.origin===`http://${host}`;
      if(req.headers.origin&&!sameOrigin){res.writeHead(403);res.end();return;}
      res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');
      if(req.method==='GET'){res.end(JSON.stringify(await preferences.snapshot()));return;}
      if(req.method==='POST'&&sameOrigin&&String(req.headers['content-type']).startsWith('application/json')){
        let body='';
        try {for await(const chunk of req){body+=chunk;if(body.length>1024)throw new Error('Preference payload too large');}
          res.end(JSON.stringify(await preferences.set(JSON.parse(body))));
        }catch{res.writeHead(400);res.end(JSON.stringify({error:'Language preference could not be saved'}));}
        return;
      }
      res.writeHead(405);res.end();return;
    }
    if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (url.pathname === '/api/metrics') {
      if (req.headers.origin && req.headers.origin !== `http://${host}`) { res.writeHead(403); res.end(); return; }
      try { res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(await metrics({ conversationId: url.searchParams.get('conversationId'), force: url.searchParams.get('force') === '1' }))); }
      catch { res.writeHead(500); res.end('{"error":"数据暂时不可用"}'); }
      return;
    }
    if (url.pathname === '/api/integration') { res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(integration.health)); return; }
    if(url.pathname==='/inline-widget.js'){res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8'});res.end(inlineSource());return;}
    res.writeHead(404); res.end();
  });
  server.listen(port, '127.0.0.1', () => console.log(`Antigravity Context (headless): http://127.0.0.1:${port}`));
}
