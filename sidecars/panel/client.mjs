import { readFile,stat } from 'node:fs/promises';
import { request } from 'node:http';
import {setImmediate as yieldStream} from 'node:timers/promises';
import { platformPaths } from '../../compat/platform.mjs';
import { discoverProcesses,httpLogPorts } from './discovery.mjs';
import { TrajectoryJson } from './trajectory-json.mjs';
import { TrajectoryReader } from './trajectory-reader.mjs';

const SERVICE = '/exa.language_server_pb.LanguageServerService/';
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
const CLI_CSRF_RE = /--csrf_token(?:=|\s+)"?([^\s"]+)/;

export function serverFromEnv(env = process.env) {
  const rawAddr = env?.ANTIGRAVITY_LS_ADDRESS;
  const rawCsrf = env?.ANTIGRAVITY_CSRF_TOKEN;
  const addrText = typeof rawAddr === 'string' ? rawAddr.trim() : '';
  const csrf = typeof rawCsrf === 'string' ? rawCsrf.trim() : '';
  if (!addrText || !csrf || /[\s\r\n\0\x00-\x1f\x7f]/.test(csrf)) return null;
  let url;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(addrText) ? addrText : `http://${addrText}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== 'http:'
    || url.username
    || url.password
    || url.search
    || url.hash
    || (url.pathname !== '/' && url.pathname !== '')
    || !LOOPBACK_HOSTS.has(host)
    || !/^\d+$/.test(url.port)
  ) {
    return null;
  }
  const port = Number(url.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { port, csrf, ...(host === '[::1]' || host === '::1' ? { host: '::1' } : {}) };
}

function serverFromPorts(logPorts, processes, envServer = null) {
  const rows = (Array.isArray(processes) ? processes : [processes]).filter(p => /--standalone\b/.test(p?.CommandLine || ''));
  let row = null;
  if (rows.length === 1) row = rows[0];
  else if (rows.length > 1 && envServer) row = rows.find(p => new Set([p.Ports].flat().map(Number)).has(envServer.port)) || null;
  if (!row) throw new Error(rows.length ? '检测到多个 Antigravity 实例，请保留一个' : '未找到 Antigravity 桌面后台');
  const ports = new Set([row.Ports].flat().map(Number));
  const port = logPorts.find(p=>ports.has(p));
  if (!port) throw new Error('等待 Antigravity 本地接口启动');
  const cliCsrf = row.CommandLine.match(CLI_CSRF_RE)?.[1];
  const envMatch = envServer && envServer.port === port ? envServer : null;
  const csrf = cliCsrf || envMatch?.csrf;
  if (!csrf) throw new Error('当前版本未提供可用的本地检测凭据');
  return {port,csrf,pid:row.ProcessId,...(!cliCsrf && envMatch?.host ? {host:envMatch.host} : {})};
}
export function serverFromDiscovery(log, processes, env = null) { return serverFromPorts(httpLogPorts(log),processes,env ? serverFromEnv(env) : null); }
export class AntigravityClient {
  constructor({paths=platformPaths,readLog=readFile,logStat=stat,processes=discoverProcesses,env=undefined,now=Date.now,onRpc=null}={}) {
    this.paths=paths;this.readLog=readLog;this.logStat=logStat;this.processes=processes;
    this.env=env??(processes===discoverProcesses&&readLog===readFile?process.env:{});
    this.now=now;this.onRpc=onRpc;this.reader=new TrajectoryReader(this);
  }
  server = null;
  discoveredAt = 0;
  discovering = null;
  lastScanAt = -Infinity;
  retryAt = 0;
  discoveryFailures = 0;
  discoveryError = null;

  async discover(force = false) {
    if (!force && this.server && this.now() - this.discoveredAt < 15000) return this.server;
    if (this.discovering) return this.discovering;
    if (!force && this.discoveryError && this.now() < this.retryAt) throw this.discoveryError;
    this.lastScanAt=this.now();
    this.discovering = this.discoverNow().then(server=>{
      this.discoveredAt=this.now();this.discoveryFailures=0;this.discoveryError=null;this.retryAt=0;return server;
    }).catch(error=>{
      this.discoveryError=error;this.discoveryFailures++;
      this.retryAt=this.now()+Math.min(30000,3000*2**Math.min(4,this.discoveryFailures-1));throw error;
    }).finally(() => { this.discovering = null; });
    return this.discovering;
  }

  async discoverNow() {
    this.server=null;
    // A sidecar can outlive a renderer/backend restart. Its injected token may
    // then refer to the previous LS instance; pair the current log port with
    // the current standalone process credential instead of mixing generations.
    const paths=this.paths(),logs=[],files=[...new Set(paths.logCandidates||[paths.log])];
    for(const file of files){
      try {
        let modifiedAt=null;
        if(files.length>1){try{const info=await this.logStat(file);if(Number.isFinite(info?.mtimeMs))modifiedAt=info.mtimeMs;}catch{}}
        logs.push({ports:httpLogPorts(await this.readLog(file,'utf8')),modifiedAt});
      }
      catch(error) { logs.push({error}); }
    }
    // Hosts can move the log from the profile into .gemini. Prefer the active
    // file over a stale fallback path whose old HTTP port was reused by gRPC.
    // Metadata only ranks hints: PID ownership is still checked below. Equal
    // or unavailable timestamps keep the configured order; explicit overrides
    // expose only one path and are not replaced by default locations.
    if(logs.every(entry=>entry.error||Number.isFinite(entry.modifiedAt))){
      logs.sort((a,b)=>{
        const first=a.modifiedAt??-Infinity,second=b.modifiedAt??-Infinity;
        return first===second?0:second-first;
      });
    }
    // Another valid socket (for example gRPC) does not prove the HTTP socket
    // is present. Supply log hints to trigger one bounded Windows fallback;
    // the hinted ports still require independent live PID ownership proof.
    const envServer=serverFromEnv(this.env);
    const expectedPorts=[...new Set([...logs.flatMap(log=>log.ports||[]),...(envServer?[envServer.port]:[])])];
    const parsed = await this.processes({expectedPorts});
    if (!parsed || Array.isArray(parsed) && !parsed.length) {
      if (envServer) {
        this.server = { port: envServer.port, csrf: envServer.csrf, pid: 'env:' + envServer.port, ...(envServer.host ? { host: envServer.host } : {}) };
        this.discoveredAt = this.now();
        return this.server;
      }
      throw new Error('请先打开 Antigravity');
    }
    // Credentials stay in process memory. They are never logged, persisted, or
    // returned to a browser; all calls go exclusively to 127.0.0.1.
    let foundLog=false,lastError=null;
    for(const entry of logs) {
      try {
        if(entry.error)throw entry.error;
        foundLog=true;
        this.server=serverFromPorts(entry.ports,parsed,envServer);break;
      } catch(error) {
        if(error.code!=='ENOENT'&&error.code!=='ENOTDIR')lastError=error;
      }
    }
    if(!this.server&&envServer){
      const rows=(Array.isArray(parsed)?parsed:[parsed]).filter(p=>/--standalone\b/.test(p?.CommandLine||''));
      const portOwner=rows.find(p=>new Set([p.Ports].flat().map(Number)).has(envServer.port));
      if(portOwner){
        const cliCsrf=portOwner.CommandLine.match(CLI_CSRF_RE)?.[1];
        this.server={port:envServer.port,csrf:cliCsrf||envServer.csrf,pid:portOwner.ProcessId,...(!cliCsrf&&envServer.host?{host:envServer.host}:{})};
      }else if(rows.length===1&&![rows[0].Ports].flat().some(p=>p!=null&&p!=='')){
        const cliCsrf=rows[0].CommandLine.match(CLI_CSRF_RE)?.[1];
        this.server={port:envServer.port,csrf:cliCsrf||envServer.csrf,pid:rows[0].ProcessId,...(!cliCsrf&&envServer.host?{host:envServer.host}:{})};
      }
    }
    if(!this.server)throw lastError||new Error(foundLog?'等待 Antigravity 本地接口启动':'未找到 Antigravity 语言服务日志，请检查日志路径');
    this.discoveredAt = this.now();
    return this.server;
  }

  async call(method, body = {}, retry = true) {
    const server = await this.discover();
    try {
      return await new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const projection=['GetCascadeTrajectory','GetCascadeTrajectorySteps','GetCascadeTrajectoryGeneratorMetadata','GetAllCascadeTrajectories'].includes(method);
        const started=this.now();
        // A rejected stream destroys its socket. Do not leave that socket in
        // the shared agent where an immediate quota refresh could reuse it.
        const req = request({ hostname: server.host || '127.0.0.1', port: server.port, method: 'POST', path: SERVICE + method, ...(projection?{agent:false}:{}),
          headers: { 'Content-Type': 'application/json', 'Connect-Protocol-Version': '1', 'x-codeium-csrf-token': server.csrf, 'Content-Length': Buffer.byteLength(data) } }, res => {
          const projected=projection?new TrajectoryJson():null;
          let text = '',bytes=0,failed=false;
          // Parsing can fail after the request has finished sending. Destroying
          // that request does not always emit another request error, and the
          // response's error/end handlers deliberately ignore failed streams.
          // Settle here before closing transport so malformed replies never hang.
          const fail=error=>{if(failed)return;failed=true;reject(error);req.destroy(error);};
          res.setEncoding('utf8');
          res.on('error',error=>{if(!failed)reject(error);});
          res.on('data', chunk => {
            if(failed)return;bytes+=Buffer.byteLength(chunk);
            // Projected streams have no whole-response byte ceiling. The
            // retained statistics budget, parser depth and time bound work.
            if(!(projected&&res.statusCode===200)&&bytes>32*1024*1024){fail(new Error('接口响应超过采集上限'));return;}
            try { if(projected&&res.statusCode===200)projected.write(chunk);else text+=chunk; }
            catch(error){fail(error);}
          });
          res.on('end', () => {
            if(failed)return;
            if (res.statusCode !== 200) return reject(Object.assign(new Error(`Antigravity 接口 ${method} 返回 ${res.statusCode}`),{status:res.statusCode}));
            try {
              const value=projected?projected.end():JSON.parse(text);
              try{this.onRpc?.({method,bytes,retainedBytes:projected?.retained??Buffer.byteLength(text),ms:this.now()-started});}catch{}
              resolve(value);
            }
            catch(error) { reject(projected?error:new Error('Antigravity 接口返回了无法解析的数据')); }
          });
        });
        req.on('error', reject);
        req.setTimeout(12000, () => req.destroy(new Error('Antigravity 本地接口超时')));
        // Bound wall time as well as idle time for slow large streams.
        const deadline=setTimeout(()=>req.destroy(new Error('Antigravity 本地接口超时')),30000);deadline.unref();
        req.once('close',()=>clearTimeout(deadline));
        req.end(data);
      });
    } catch (error) {
      // A missing historical cascade, busy API or malformed response does not
      // prove the process/credential changed. Do not launch CIM scans for it.
      const endpointLost=[401,403].includes(error.status)||['ECONNREFUSED','ECONNRESET','EPIPE','ENOTCONN'].includes(error.code);
      if(!endpointLost)throw error;
      // A late failure from an old endpoint cannot invalidate a newer one.
      if(this.server===server){
        this.server=null;this.discoveryError=error;
        this.retryAt=Math.max(this.retryAt,this.lastScanAt+3000);
      }
      if(retry){await this.discover();return this.call(method,body,false);}
      throw error;
    }
  }

  // Background-only record stream. No complete page array is materialized and
  // asynchronous consumers apply backpressure before the next record is parsed.
  async streamTrajectoryPage(method,body,{onRecord,isCurrent=()=>true,wallMs=30000}={}) {
    if(!['GetCascadeTrajectorySteps','GetCascadeTrajectoryGeneratorMetadata'].includes(method)||typeof onRecord!=='function')throw Error('Unsupported statistics stream');
    if(!Number.isSafeInteger(wallMs)||wallMs<30000||wallMs>300000)throw Error('Invalid statistics stream deadline');
    let streamError=null,rejectAbort;
    const aborted=new Promise((_,reject)=>{rejectAbort=reject;});aborted.catch(()=>{});
    const assertCurrent=()=>{if(streamError)throw streamError;if(isCurrent()!==true)throw Error('Statistics stream cancelled');};
    assertCurrent();const server=await this.discover();assertCurrent();
    const input=JSON.stringify(method==='GetCascadeTrajectoryGeneratorMetadata'?{...body,includeMessages:false}:body);
    let pending=null;
    const parser=new TrajectoryJson({onRecord:(kind,index,value)=>{if(pending)throw Error('Statistics stream consumer overflow');pending={kind,index,value};}});
    const started=this.now();let bytes=0,peakRetained=0,req,res,deadline,watch;
    const timeout=()=>Error('Antigravity 本地接口超时');
    const abort=error=>{streamError||=error;rejectAbort(streamError);res?.destroy();req?.destroy(streamError);};
    try {
      res=await new Promise((resolve,reject)=>{
        req=request({hostname:server.host||'127.0.0.1',port:server.port,method:'POST',path:SERVICE+method,agent:false,
          headers:{'Content-Type':'application/json','Connect-Protocol-Version':'1','x-codeium-csrf-token':server.csrf,'Content-Length':Buffer.byteLength(input)}},resolve);
        req.on('error',error=>{streamError||=error;rejectAbort(streamError);reject(error);});req.setTimeout(12000,()=>abort(timeout()));
        deadline=setTimeout(()=>abort(timeout()),wallMs);deadline.unref();
        watch=setInterval(()=>{if(isCurrent()!==true)abort(Error('Statistics stream cancelled'));},250);watch.unref();req.end(input);
      });
      if(res.statusCode!==200)throw Object.assign(Error('Statistics stream HTTP '+res.statusCode),{status:res.statusCode});
      res.setEncoding('utf8');
      for await(const chunk of res){
        assertCurrent();bytes+=Buffer.byteLength(chunk);
        // Even a huge text-only value yields regularly; retained text is skipped.
        for(let offset=0;offset<chunk.length;){
          assertCurrent();const slice=chunk.slice(offset,offset+8192);
          const consumed=parser.write(slice,{stopAfterRecord:true});offset+=consumed;
          peakRetained=Math.max(peakRetained,parser.retained);
          if(pending){const item=pending;pending=null;await Promise.race([onRecord(item.kind,item.index,item.value),aborted]);assertCurrent();}
          await yieldStream();
        }
      }
      assertCurrent();const result=parser.end();
      if(pending){const item=pending;pending=null;await Promise.race([onRecord(item.kind,item.index,item.value),aborted]);assertCurrent();}
      try{this.onRpc?.({method,bytes,retainedBytes:peakRetained,ms:this.now()-started,streamed:true});}catch{}
      return result;
    } finally {clearTimeout(deadline);clearInterval(watch);res?.destroy();req?.destroy();}
  }

  resetTrajectories(){this.reader.reset();}
  trajectory(id,options){return this.reader.read(id,options);}
}
