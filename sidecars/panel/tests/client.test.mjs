import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import http from 'node:http';
import {syncBuiltinESMExports} from 'node:module';
import {EventEmitter} from 'node:events';
import {AntigravityClient,serverFromDiscovery,serverFromEnv} from '../client.mjs';

// Synthetic RPC fixtures own every accepted socket. End them explicitly:
// HTTP keep-alive teardown must not hold the cross-platform test runner open.
const stopServer=server=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});

test('invalid projected JSON settles even when destroying a sent request emits no error',async t=>{
 const original=http.request;let destroyed=false;
 http.request=(_options,onResponse)=>{
  const req=new EventEmitter();req.setTimeout=()=>req;
  req.destroy=()=>{destroyed=true;req.emit('close');return req;};
  req.end=()=>queueMicrotask(()=>{
   const res=new EventEmitter();res.statusCode=200;res.setEncoding=()=>res;
   onResponse(res);res.emit('data','{broken');res.emit('end');
  });return req;
 };
 syncBuiltinESMExports();t.after(()=>{http.request=original;syncBuiltinESMExports();});
 const client=new AntigravityClient({now:()=>0});client.server={port:1234,csrf:'fixture',pid:42};
 let timer;
 try{await Promise.race([
  assert.rejects(client.call('GetCascadeTrajectory'),error=>error.message==='Antigravity 接口返回了无法解析的数据'),
  new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Invalid stream left the RPC pending')),1000);})
 ]);}finally{clearTimeout(timer);}
 assert.equal(destroyed,true);
});
async function fixture(t){
 const state={scans:0,now:100000,status:404,body:'{}',requests:0};
 const server=createServer((req,res)=>{state.requests++;req.resume();res.writeHead(state.status,{'Content-Type':'application/json'});res.end(state.body);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>stopServer(server));
 state.port=server.address().port;state.pid=42;
 const client=new AntigravityClient({now:()=>state.now,paths:()=>({log:'fixture'}),readLog:async()=>`listening on random port at ${state.port} for HTTP\n`,
  processes:async()=>{state.scans++;return [{ProcessId:state.pid,CommandLine:'language_server --standalone --csrf_token=fixture',Ports:[state.port]}];}});
 return {client,state,server};
}

test('unavailable history and malformed RPC replies never invalidate a healthy endpoint',async t=>{
 const {client,state}=await fixture(t);
 const rejects=async(method,body)=>{
  let timer;
  try{await Promise.race([assert.rejects(client.call(method,body)),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`RPC fixture stalled: status=${state.status}, requests=${state.requests}, method=${method}`)),10000);})]);}
  finally{clearTimeout(timer);}
 };
 for(const status of [400,404,409,429,500,503]){
  state.status=status;
  for(let i=0;i<3;i++)await rejects('GetCascadeTrajectory',{cascadeId:'missing'});
 }
 state.status=200;state.body='{broken';await rejects('GetCascadeTrajectory');
 state.body='{}';assert.deepEqual(await client.call('GetUserStatus'),{});
 assert.equal(state.scans,1,'Conversation/protocol failures must not spawn another process scan');
 assert.equal(state.requests,20,'Application failures are not blindly retried');
 assert.ok(client.server);
});

test('ordinary RPC JSON errors never expose a private response fragment',async t=>{
 const {client,state}=await fixture(t);state.status=200;state.body='{"private":"DO_NOT_DISCLOSE" invalid}';
 await assert.rejects(client.call('GetUserStatus'),error=>error.message==='Antigravity 接口返回了无法解析的数据');
 state.body='{}';assert.deepEqual(await client.call('GetUserStatus'),{});assert.equal(state.scans,1);
});

test('conversation-list RPC keeps delegation metadata while discarding embedded messages',async t=>{
 const {client,state}=await fixture(t);state.status=200;
 const root='11111111-1111-1111-1111-111111111111',child='22222222-2222-2222-2222-222222222222';
 state.body=JSON.stringify({trajectorySummaries:{[root]:{stepCount:4,status:'IDLE'},[child]:{
  stepCount:2,hasActiveChildren:true,trajectoryMetadata:{parentConversationId:root,rootConversationId:root,subagentSpec:{initialPrompt:'PRIVATE_PROMPT'}},
  latestNotifyUserStep:{message:'PRIVATE_REPLY'},waitingSteps:[{response:'PRIVATE_TOOL'}],
 }}});
 const result=await client.call('GetAllCascadeTrajectories',{excludeSubtrajectories:false});
 assert.equal(result.trajectorySummaries[child].trajectoryMetadata.parentConversationId,root);
 assert.equal(result.trajectorySummaries[child].hasActiveChildren,true);
 assert.doesNotMatch(JSON.stringify(result),/PRIVATE|subagentSpec|waitingSteps|latestNotifyUserStep/);
});

test('cold-start discovery failures coalesce and back off while the backend starts',async()=>{
 let now=0,scans=0,ready=false;
 const client=new AntigravityClient({now:()=>now,paths:()=>({log:'fixture'}),readLog:async()=> 'listening on random port at 1234 for HTTP\n',
  processes:async()=>{scans++;return ready?[{ProcessId:42,CommandLine:'language_server --standalone --csrf_token=fixture',Ports:[1234]}]:[];}});
 await Promise.allSettled(Array.from({length:20},()=>client.discover()));assert.equal(scans,1);
 for(let i=0;i<20;i++)await assert.rejects(client.discover());assert.equal(scans,1);
 now=3000;await assert.rejects(client.discover());assert.equal(scans,2);
 now=4000;ready=true;await assert.rejects(client.discover());assert.equal(scans,2);
 now=9000;assert.equal((await client.discover()).pid,42);assert.equal(scans,3);
});

test('authorization failures have a cooldown, then rediscover without disabling the plugin',async t=>{
 const {client,state}=await fixture(t);state.status=401;
 for(let i=0;i<10;i++)await assert.rejects(client.call('GetUserStatus'));
 assert.equal(state.scans,1);assert.equal(state.requests,1);
 state.now+=3000;state.status=200;
 assert.deepEqual(await client.call('GetUserStatus'),{});assert.equal(state.scans,2);
});

test('a refused old port rediscovers a restarted backend once, without toggling the plugin',async t=>{
 const {client,state,server}=await fixture(t);state.status=200;
 await client.call('GetUserStatus');assert.equal(state.scans,1);
 await stopServer(server);
 const replacement=createServer((req,res)=>{req.resume();res.end('{}');});
 await new Promise(r=>replacement.listen(0,'127.0.0.1',r));t.after(()=>stopServer(replacement));
 state.port=replacement.address().port;state.pid=43;state.now+=3000;
 assert.deepEqual(await client.call('GetUserStatus'),{});
 assert.equal(client.server.pid,43);assert.equal(state.scans,2);
});

test('serverFromEnv validates loopback HTTP addresses and safe CSRF tokens',()=>{
 assert.deepEqual(serverFromEnv({ANTIGRAVITY_LS_ADDRESS:'localhost:60599',ANTIGRAVITY_CSRF_TOKEN:'scoped-token'}),{port:60599,csrf:'scoped-token'});
 assert.deepEqual(serverFromEnv({ANTIGRAVITY_LS_ADDRESS:'127.0.0.1:60599',ANTIGRAVITY_CSRF_TOKEN:'scoped-token'}),{port:60599,csrf:'scoped-token'});
 assert.deepEqual(serverFromEnv({ANTIGRAVITY_LS_ADDRESS:'http://127.0.0.1:60599/',ANTIGRAVITY_CSRF_TOKEN:'scoped-token'}),{port:60599,csrf:'scoped-token'});
 assert.deepEqual(serverFromEnv({ANTIGRAVITY_LS_ADDRESS:'[::1]:60599',ANTIGRAVITY_CSRF_TOKEN:'scoped-token'}),{port:60599,csrf:'scoped-token',host:'::1'});
 for(const bad of [
  {},
  {ANTIGRAVITY_LS_ADDRESS:'example.com:60599',ANTIGRAVITY_CSRF_TOKEN:'tok'},
  {ANTIGRAVITY_LS_ADDRESS:'192.168.1.10:60599',ANTIGRAVITY_CSRF_TOKEN:'tok'},
  {ANTIGRAVITY_LS_ADDRESS:'https://127.0.0.1:60599',ANTIGRAVITY_CSRF_TOKEN:'tok'},
  {ANTIGRAVITY_LS_ADDRESS:'http://127.0.0.1:0',ANTIGRAVITY_CSRF_TOKEN:'tok'},
  {ANTIGRAVITY_LS_ADDRESS:'http://127.0.0.1:65536',ANTIGRAVITY_CSRF_TOKEN:'tok'},
  {ANTIGRAVITY_LS_ADDRESS:'localhost',ANTIGRAVITY_CSRF_TOKEN:'tok'},
  {ANTIGRAVITY_LS_ADDRESS:'http://127.0.0.1:60599/path',ANTIGRAVITY_CSRF_TOKEN:'tok'},
  {ANTIGRAVITY_LS_ADDRESS:'http://127.0.0.1:60599?a=1',ANTIGRAVITY_CSRF_TOKEN:'tok'},
  {ANTIGRAVITY_LS_ADDRESS:'localhost:60599',ANTIGRAVITY_CSRF_TOKEN:'bad token'},
  {ANTIGRAVITY_LS_ADDRESS:'localhost:60599',ANTIGRAVITY_CSRF_TOKEN:'bad\ntoken'},
  {ANTIGRAVITY_LS_ADDRESS:'localhost:60599',ANTIGRAVITY_CSRF_TOKEN:'bad\0token'},
  {ANTIGRAVITY_LS_ADDRESS:'localhost:60599',ANTIGRAVITY_CSRF_TOKEN:'   '},
 ]){
  assert.equal(serverFromEnv(bad),null);
 }
});

test('discover uses host-injected sidecar env credentials when CLI --csrf_token is absent (2.34.0+)',async t=>{
 let seenToken=null;
 const server=createServer((req,res)=>{seenToken=req.headers['x-codeium-csrf-token'];req.resume();res.writeHead(200,{'Content-Type':'application/json'});res.end('{"ok":true}');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>stopServer(server));
 const port=server.address().port;
 const client=new AntigravityClient({
  paths:()=>({log:'fixture'}),
  readLog:async()=>`listening on random port at ${port} for HTTP\n`,
  processes:async()=>[{ProcessId:11064,CommandLine:'language_server.exe --standalone --enable_sidecars --read_host_bridge_token_from_stdin',Ports:[port]}],
  env:{ANTIGRAVITY_LS_ADDRESS:`localhost:${port}`,ANTIGRAVITY_CSRF_TOKEN:'scoped-234-token'},
 });
 assert.deepEqual(await client.discover(),{port,csrf:'scoped-234-token',pid:11064});
 assert.deepEqual(await client.call('GetUserStatus'),{ok:true});
 assert.equal(seenToken,'scoped-234-token');
});

test('stale env port is rejected when live standalone process is confirmed on a different log port',async()=>{
 const client=new AntigravityClient({
  paths:()=>({log:'fixture'}),
  readLog:async()=>'listening on random port at 7777 for HTTP\n',
  processes:async()=>[{ProcessId:222,CommandLine:'language_server.exe --standalone',Ports:[7777]}],
  env:{ANTIGRAVITY_LS_ADDRESS:'localhost:6666',ANTIGRAVITY_CSRF_TOKEN:'stale-token'},
 });
 await assert.rejects(client.discover(),/本地检测凭据/);
});

test('env credentials recover when language_server.log is ENOENT while standalone process owns env port',async()=>{
 const client=new AntigravityClient({
  paths:()=>({log:'missing.log'}),
  readLog:async()=>{throw Object.assign(new Error('missing'),{code:'ENOENT'});},
  processes:async({expectedPorts})=>{
   assert.deepEqual(expectedPorts,[60599]);
   return [{ProcessId:333,CommandLine:'language_server.exe --standalone',Ports:[60599]}];
  },
  env:{ANTIGRAVITY_LS_ADDRESS:'127.0.0.1:60599',ANTIGRAVITY_CSRF_TOKEN:'scoped-token'},
 });
 assert.deepEqual(await client.discover(),{port:60599,csrf:'scoped-token',pid:333});
});

test('env port disambiguates multiple standalone instances without generation mixing',async()=>{
 const rows=[
  {ProcessId:101,CommandLine:'language_server.exe --standalone',Ports:[5001]},
  {ProcessId:102,CommandLine:'language_server.exe --standalone',Ports:[5002]},
 ];
 assert.deepEqual(
  serverFromDiscovery('listening on random port at 5002 for HTTP\n',rows,{ANTIGRAVITY_LS_ADDRESS:'localhost:5002',ANTIGRAVITY_CSRF_TOKEN:'tok-2'}),
  {port:5002,csrf:'tok-2',pid:102},
 );
 const client=new AntigravityClient({
  paths:()=>({log:'fixture'}),
  readLog:async()=>'listening on random port at 5002 for HTTP\n',
  processes:async()=>rows,
  env:{ANTIGRAVITY_LS_ADDRESS:'localhost:5002',ANTIGRAVITY_CSRF_TOKEN:'tok-2'},
 });
 assert.deepEqual(await client.discover(),{port:5002,csrf:'tok-2',pid:102});
});
