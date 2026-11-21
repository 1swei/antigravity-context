// Self-contained main-world UI. Shadow DOM isolates styling from the host app.
module.exports = function installAgPulseInlineWidget() {
  if (window.__agPulseInlineInstalled) return;
  const report=(stage,details={})=>window.agPulseHost?.report?.({stage,...details});
  if (!document.documentElement) {
    document.addEventListener('DOMContentLoaded',installAgPulseInlineWidget,{once:true});
    return;
  }
  if (!window.agPulseHost) return;
  const localGet=key=>{try{return localStorage.getItem(key);}catch{return null;}};
  const localSet=(key,value)=>{try{localStorage.setItem(key,value);}catch{}};
  const hostLocale=(()=>{const n=typeof navigator!=='undefined'?String(navigator.language||''):'';return /^zh\b/i.test(n)?(/tw|hk|mo|hant/i.test(n)?'zh-TW':'zh-CN'):null;})();
  const language=window.__agPulseI18nFactory(localGet('ag-pulse-language')||hostLocale);
  const theme=window.__agPulseThemeFactory();
  const t=language.t;
  window.__agPulseInlineInstalled=true;
  report('boot',{hostFound:true});
  const ID='ag-pulse-status-bar';
  // Host-specific discovery stays outside the shared widget. The IDE has no
  // /c/<id> URL, and must never inherit the desktop's conversation fallback.
  const surface=window.__agPulseSurface;
  const setMarkup=(element,markup)=>{if(surface?.setMarkup)surface.setMarkup(element,markup);else element.innerHTML=markup;};
  let node=null,root=null,data=null,pending=false,cardName=null,hoverTimer=null,openTimer=null,warmUntil=0,lastConversation=undefined,lastFetch=0,resizeObserver=null,themeController=null,changingCards=false;
  const HOVER_DELAY=250,WARM_WINDOW=350,LEAVE_DELAY=120;
  const isWarm=()=>Boolean(cardName||Date.now()<warmUntil);
  let refreshRequest=null,manualRequest=null,requestEpoch=0,disposed=false;
  let composer=null,layoutFrame=null,modalSyncTimer=null;
  let usageDashboard=null;
  let densityFrame=null,densityMotion=null,densityProbe=null;
  const densityMedia=matchMedia('(prefers-reduced-motion: reduce)');
  const densityEase='cubic-bezier(0.32,0.72,0,1)';
  let usageGuideDismissed=false;
  let hoveredCtxRow=null,baseCtxNoteKey='';
  const SNAP_KEY='ag-pulse-snap-v1',SNAP_TTL=10*60*1000;
  const UPDATE_HANDOVER_KEY='ag-pulse-update-reload-v1',UPDATE_HANDOVER_TTL=2*60*1000,UPDATE_GRACE_MS=15000;
  let pendingUpdateReload=null,awaitingReloadConfirmVersion=undefined,updateGraceUntil=0,lastReloadMeta=null;
  const takeUpdateReload=()=>{
    let found=null;
    try{
      const h=window.__agPulseHandover;
      if(h?.updateReload){found=h.updateReload;delete h.updateReload;}
    }catch{}
    try{
      if(typeof sessionStorage!=='undefined'){
        const raw=sessionStorage.getItem(UPDATE_HANDOVER_KEY);
        if(raw){sessionStorage.removeItem(UPDATE_HANDOVER_KEY);if(!found)found=JSON.parse(raw);}
      }
    }catch{}
    if(!found||typeof found!=='object'||!found.reopenModal)return null;
    const now=Date.now();
    if(!Number.isFinite(found.at)||now-found.at>UPDATE_HANDOVER_TTL||now<found.at-5000)return null;
    return {
      reopenModal:true,
      reopenUpdateMenu:Boolean(found.reopenUpdateMenu),
      toVersion:typeof found.toVersion==='string'&&found.toVersion?found.toVersion:null,
      settled:Boolean(found.settled),
      guideDismissed:Boolean(found.guideDismissed),
      viewState:found.viewState&&typeof found.viewState==='object'?found.viewState:null,
    };
  };
  const sanitizeSnap=value=>{
    if(!value||(!value.speed&&!value.usage))return null;
    return {connection:'stale',speed:value.speed||null,usage:value.usage||null,collection:value.collection||null,groups:value.groups||[],...(value.theme?{theme:value.theme}:{})};
  };
  const saveSessionSnap=(id,value)=>{
    const snap=sanitizeSnap(value);
    if(!id||!snap)return;
    try{
      if(typeof sessionStorage==='undefined')return;
      let cache={};
      try{cache=JSON.parse(sessionStorage.getItem(SNAP_KEY)||'{}')||{};}catch{cache={};}
      if(typeof cache!=='object'||Array.isArray(cache))cache={};
      const now=Date.now();
      cache[id]={data:snap,at:now};
      const entries=Object.entries(cache).filter(([,v])=>v&&Number.isFinite(v.at)&&now-v.at<SNAP_TTL).sort((a,b)=>b[1].at-a[1].at).slice(0,6);
      sessionStorage.setItem(SNAP_KEY,JSON.stringify(Object.fromEntries(entries)));
    }catch{}
  };
  const loadSessionSnap=id=>{
    if(!id)return null;
    try{
      if(typeof sessionStorage==='undefined')return null;
      const cache=JSON.parse(sessionStorage.getItem(SNAP_KEY)||'null');
      const entry=cache?.[id],now=Date.now();
      if(!entry||!entry.data||!Number.isFinite(entry.at)||now-entry.at>SNAP_TTL||now<entry.at-5000)return null;
      return entry.data;
    }catch{return null;}
  };
  function syncGuide(value){if(value?.usageGuideDismissed===true){usageGuideDismissed=true;usageDashboard?.syncGuideDismissed();}}
  const preferences=language.connectPreferences({
    read:async()=>{const value=await window.agPulseHost.getPreferences();syncGuide(value);return value;},
    write:async input=>{const value=await window.agPulseHost.setPreferences(input);syncGuide(value);return value;},
    cache:value=>localSet('ag-pulse-language',value),changed:()=>{if(root){localize();render();position();}},
  });
  void preferences.ready.then(()=>{if(disposed)return;scheduleLayout();});
  const icon=(name)=>({speed:'<path d="M8 14a6 6 0 1 0-6-6 6 6 0 0 0 6 6Z"/><path d="m10 6-2.2 2.2"/>',cache:'<ellipse cx="8" cy="4.2" rx="4.8" ry="1.9"/><path d="M3.2 4.2v7.6c0 1.2 2.1 2 4.8 2s4.8-.8 4.8-2V4.2M3.2 8c0 1.2 2.1 2 4.8 2s4.8-.8 4.8-2"/>'}[name]);
  const svg=name=>`<svg viewBox="0 0 16 16" aria-hidden="true">${icon(name)}</svg>`;
  const pct=(n,empty='0%')=>typeof n==='number'&&Number.isFinite(n)?`${Math.round(n*100)}%`:empty;
  const rate=(n,empty='0')=>typeof n==='number'&&Number.isFinite(n)?(n>=100?String(Math.round(n)):n.toFixed(1).replace(/\.0$/,'')):empty;
  const count=(n,empty='0')=>typeof n==='number'&&Number.isFinite(n)?n.toLocaleString('en-US'):empty;
  const compact=(n,empty='0')=>typeof n!=='number'||!Number.isFinite(n)?empty:n>=1e9?`${(n/1e9).toFixed(1).replace(/\.0$/,'')}B`:n>=1e6?`${(n/1e6).toFixed(1).replace(/\.0$/,'')}M`:n>=1e3?`${(n/1e3).toFixed(1).replace(/\.0$/,'')}K`:String(n);
  const durationCompact=(v)=>{
    const en=language.language==='en',tw=language.language==='zh-TW';
    if(typeof v!=='number'||!Number.isFinite(v)||v<=0)return en?'0s':'0秒';
    if(v<60)return `${v<10?v.toFixed(1).replace(/\.0$/,''):Math.round(v)}${en?'s':'秒'}`;
    const whole=Math.round(v),h=Math.floor(whole/3600),m=Math.floor(whole%3600/60),s=whole%60;
    if(en)return `${h?`${h}h `:''}${m}m ${s}s`;
    return `${h?`${h}${tw?'小時':'小时'}`:''}${m}分${s}秒`;
  };
  const date=language.resetDate;
  const $=id=>root?.getElementById(id);
  const text=(id,value)=>{const e=$(id);if(e&&e.textContent!==String(value))e.textContent=String(value);};
  const attribute=(element,name,value)=>{if(value===null){if(element.hasAttribute(name))element.removeAttribute(name);}else if(element.getAttribute(name)!==String(value))element.setAttribute(name,String(value));};
  const style=(element,name,value)=>{if(element.style.getPropertyValue(name)!==value)element.style.setProperty(name,value);};
  const hidden=(element,value)=>{if(element.hidden!==value)element.hidden=value;};
  const GUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const visibleHostElement=element=>element.isConnected&&!element.closest('[hidden],[inert]')&&element.getClientRects().length>0&&getComputedStyle(element).visibility!=='hidden';
  const sidebarOwners=new WeakMap();
  const conversationId=()=>{
    if(surface&&!surface.useSharedComposer)return surface.conversationId(composer);
    const anchor=composer?.box||composer?.row;
    if(!anchor?.isConnected)return null;
    const readId=element=>{const id=element.getAttribute('data-cascade-id');return GUID.test(id||'')?id.toLowerCase():null;};
    // Full View encloses its input in the conversation owner. The auxiliary
    // subagent tab instead puts the owner on a sibling message area. Search
    // only siblings of this input's ancestor path, never other panes or the
    // transcript. A small wrapper around the message area does not change its
    // ownership; missing/ambiguous/over-budget evidence fails closed.
    const paneBoundary='aside,[role="tabpanel"],[data-aux-pane-open],[data-pane-id]';
    let budget=96,otherComposer=false;
    const markersIn=(scope,branch)=>{
      const markers=[],stack=[];let evidence=false;
      if(scope.childElementCount-1>budget)return {markers,evidence,limited:true};
      for(const element of scope.children)if(element!==branch)stack.push({element,depth:0});
      while(stack.length){
        if(--budget<0)return {markers,evidence,limited:true};
        const {element,depth}=stack.pop();
        if(element.matches('[data-testid="subagent-tab-conversation"]')){evidence=true;if(visibleHostElement(element))markers.push(element);continue;}
        if(element===node||element.closest('[hidden],[inert]'))continue;
        const css=getComputedStyle(element);if(css.display==='none'||css.visibility==='hidden')continue;
        if(element.matches(paneBoundary+', [data-testid="conversation-view"]'))continue;
        if(element.matches('[data-testid="agent-input-box"]')){if(visibleHostElement(element))otherComposer=true;continue;}
        if(element.matches('script,style,template,svg'))continue;
        if((element.childElementCount&&depth>=8)||element.childElementCount+stack.length>budget)return {markers,evidence,limited:true};
        for(const child of element.children)stack.push({element:child,depth:depth+1});
      }
      return {markers,evidence,limited:false};
    };
    const previous=sidebarOwners.get(anchor);
    if(previous&&!previous.contains(anchor))sidebarOwners.delete(anchor);
    let branch=null,hops=0;
    for(let scope=anchor;scope&&scope!==document.body&&scope!==document.documentElement;branch=scope,scope=scope.parentElement){
      if(++hops>32)return null;
      // The host may reuse the old sidebar content root for Full View.
      if(scope.matches('[data-testid="conversation-view"]'))return readId(scope);
      if(scope===anchor&&scope.hasAttribute('data-cascade-id'))return readId(scope);
      if(branch&&composer.kind==='subagent'){
        const {markers,evidence,limited}=markersIn(scope,branch);
        if(limited)return null;
        if(evidence){
          if(!otherComposer)sidebarOwners.set(anchor,scope);
          return !otherComposer&&markers.length===1?readId(markers[0]):null;
        }
      }
      if(sidebarOwners.get(anchor)===scope)return null;
      if(scope.hasAttribute('data-cascade-id'))return readId(scope);
      if(scope.matches(paneBoundary))return null;
    }
    const id=location.pathname.match(/\/c\/([0-9a-f-]{36})/i)?.[1];
    return GUID.test(id||'')?id.toLowerCase():null;
  };
  function syncConversation(){
    const id=conversationId();
    if(id===lastConversation)return false;
    lastConversation=id;requestEpoch++;pending=false;refreshRequest=null;lastFetch=0;
    stopDensityMotion();densityFrame=null;densityProbe=null;
    manualRequest=null;refreshBusy(false);
    let restored=null;
    pendingUpdateReload||=takeUpdateReload();
    try{
      const h=window.__agPulseHandover;
      if(h){
        delete window.__agPulseHandover;
        if(h.conversationId===id&&Number.isFinite(h.at)&&Date.now()-h.at<30000&&Date.now()>=h.at-5000&&h.data){
          restored=sanitizeSnap(h.data);
        }
      }
    }catch{}
    if(!restored&&id)restored=loadSessionSnap(id);
    data=restored||{connection:'connecting',groups:[],speed:null};hide();
    // Navigation has its own refresh budget. A request from the old composer
    // must neither block the new route nor reset its polling clock on arrival.
    queueMicrotask(()=>{if(!disposed)refresh();});return true;
  }
  function localize(){
    attribute(node,'lang',language.language);
    for(const e of root.querySelectorAll('[data-i18n]')){const value=t(e.dataset.i18n);if(e.textContent!==value)e.textContent=value;}
    for(const e of root.querySelectorAll('[data-i18n-aria]'))attribute(e,'aria-label',t(e.dataset.i18nAria));
    for(const e of root.querySelectorAll('[data-i18n-aria][title]'))attribute(e,'title',t(e.dataset.i18nAria));
    const zh=language.language==='zh-CN',tw=language.language==='zh-TW';
    text('usage-today-label',tw?'今日用量':(zh?'今日用量':'Today'));text('usage-month-label',tw?'本月用量':(zh?'本月用量':'This month'));
    text('usage-open-label',tw?'檢視用量統計':(zh?'查看用量统计':'View usage stats'));
    syncContextNote();
  }
  function stopDensityMotion(){
    const motion=densityMotion;densityMotion=null;
    if(!motion)return;
    for(const animation of motion.animations)animation.cancel();
    motion.stage.remove();delete node?.dataset.motion;
  }
  function densitySnapshot(previous){
    const pieces=new Map();
    for(const chip of root.querySelectorAll('.bar .chip'))for(const element of chip.children){
      if(!element.getClientRects().length)continue;
      const style=getComputedStyle(element);
      pieces.set(element,{rect:element.getBoundingClientRect(),opacity:1,font:style.font,color:style.color,icon:element.matches('svg,.context-ring')});
    }
    // Read interrupted copies before changing density. Reading them after the
    // final flex layout moves their parent would bake that shift into the new
    // start position and produce a visible jump on reversal.
    if(previous&&densityMotion)for(const [element,visual]of densityMotion.pieces){
      const piece=pieces.get(element)||densityMotion.sources.get(element);
      if(piece)pieces.set(element,{...piece,rect:visual.getBoundingClientRect(),opacity:Number(getComputedStyle(visual).opacity)});
    }
    return {pieces,rect:node.getBoundingClientRect(),model:composer.model,modelRect:previous?.model===composer.model?previous.modelRect:composer.model?.getBoundingClientRect(),row:composer.row};
  }
  function densityBounds(next){
    const row=next.row.getBoundingClientRect(),target=next.rect;
    let left=Math.max(row.left,composer.anchor?.getBoundingClientRect().right||0),right=Math.min(row.right,innerWidth);
    for(const control of document.querySelectorAll('button,[role="button"],a[href],input,select')){
      if(control===next.model||next.model?.contains(control)||control.contains(next.model))continue;
      const r=control.getBoundingClientRect();
      if(r.width<=0||r.height<=0||Math.min(target.bottom,r.bottom)-Math.max(target.top,r.top)<=1)continue;
      if(control.closest('[hidden],[inert]')||getComputedStyle(control).visibility==='hidden')continue;
      if(!next.row.parentElement.contains(control)){
        if(Math.min(right,r.right)-Math.max(left,r.left)<=0)continue;
        const x=(Math.max(left,r.left)+Math.min(right,r.right))/2,y=(Math.max(target.top,r.top)+Math.min(target.bottom,r.bottom))/2;
        const hit=document.elementFromPoint(x,y);
        if(hit!==control&&!control.contains(hit))continue;
      }
      if(r.right<=target.left+1)left=Math.max(left,r.right);
      else if(r.left>=target.right-1)right=Math.min(right,r.left);
      else return null;
    }
    return right-left>=target.width-2?{left,right}:null;
  }
  function clipDensityMotion(next){
    if(!densityMotion)return;
    const bounds=densityBounds(next);
    if(!bounds){stopDensityMotion();return;}
    // The ribbon follows its parent 1:1 while dragging. Keep its existing
    // compositor animation and clock; only crop to current safe host bounds.
    const stage=densityMotion.stage,r=stage.getBoundingClientRect();
    stage.style.clipPath=`inset(0px ${Math.max(0,r.right-bounds.right)}px 0px ${Math.max(0,bounds.left-r.left)}px)`;
  }
  function animateDensity(previous,next){
    // A narrow composer gives its space straight back to native controls. Only
    // inert visual copies move; the real icons immediately have safe hit boxes.
    // Copies share a clipped ribbon with the model selector's reveal, never the
    // send/mic/add controls. Neither flex widths nor host styles are animated.
    const interrupted=densityMotion;
    const modelOpacity=next.model?getComputedStyle(next.model).opacity:'1';
    stopDensityMotion();
    if(!Element.prototype.animate)return;
    const bounds=densityBounds(next);if(!bounds)return;
    const {left,right}=bounds,target=next.rect;
    const reduce=densityMedia.matches,duration=reduce?120:240;
    const stage=document.createElement('div');stage.className='density-stage';stage.inert=true;stage.setAttribute('aria-hidden','true');
    stage.style.cssText=`left:${left-target.left}px;top:0;width:${right-left}px;height:${target.height}px`;
    root.append(stage);
    const motion={stage,animations:[],pieces:new Map(),sources:new Map([...previous.pieces,...next.pieces])};densityMotion=motion;node.dataset.motion='density';
    const play=(element,frames,options={})=>{const animation=element.animate(frames,{duration,easing:densityEase,...options});motion.animations.push(animation);return animation;};
    for(const element of new Set([...previous.pieces.keys(),...next.pieces.keys()])){
      const from=previous.pieces.get(element),to=next.pieces.get(element),piece=to||from;
      const visual=element.cloneNode(true),end=to?.rect||from.rect;
      for(const part of [visual,...visual.querySelectorAll('*')])for(const attribute of [...part.attributes])if(attribute.name==='id'||attribute.name.startsWith('data-')||attribute.name.startsWith('aria-'))part.removeAttribute(attribute.name);
      const endX=Math.max(left,Math.min(right-end.width,end.left)),endY=end.top-target.top;
      visual.classList.add('density-piece');visual.style.cssText+=`;position:absolute;left:${endX-left}px;top:${endY}px;width:${end.width}px;height:${end.height}px;font:${piece.font};color:${piece.color};margin:0;pointer-events:none;display:block`;
      stage.append(visual);motion.pieces.set(element,visual);
      const start=from?.rect||end;
      const startX=Math.max(left,Math.min(right-start.width,start.left));
      const dx=reduce?0:startX-endX,dy=reduce?0:start.top-end.top;
      const startOpacity=from?.opacity??0,endOpacity=to?1:0;
      play(visual,[{transform:`translate(${dx}px,${dy}px)`,opacity:startOpacity},{transform:'translate(0,0)',opacity:endOpacity}],{fill:'both',...(piece.icon?{}:{duration:to?duration:80})});
      if(to)play(element,[{opacity:0},{opacity:0}],{fill:'both'});
    }
    // The host model name often goes from a caret to a full label as space is
    // returned. Let the outgoing labels leave before revealing that name.
    if(next.model&&previous.model===next.model&&(Math.abs(next.modelRect.width-previous.modelRect.width)>8||interrupted&&Number(modelOpacity)<.999)){
      play(next.model,[{opacity:interrupted?modelOpacity:0},{opacity:1}],{delay:reduce||interrupted?0:100,duration:reduce?120:interrupted?240:140,fill:'backwards'});
    }
    const finish=play(stage,[{opacity:1},{opacity:1}]);
    finish.onfinish=()=>{if(densityMotion===motion){stopDensityMotion();position();}};
  }
  function fit(){
    if(!node?.isConnected)return;
    // A modal owns input while open. Composer collision scans behind its
    // backdrop cannot improve its layout and can hide its hosting strip.
    if(usageDashboard?.isOpen){stopDensityMotion();return;}
    reserveNativeSpace();
    const bar=root.querySelector('.bar'),oldDensity=node.dataset.density,oldReady=node.dataset.layout==='ready';
    let previous=densityFrame;
    const applyDensity=mode=>{
      node.classList.toggle('compact',mode==='compact');
      node.classList.toggle('tight',mode==='tight');
      node.classList.toggle('icons-only',mode==='icons');
    };
    const currentDensity=()=>node.classList.contains('icons-only')?'icons':node.classList.contains('tight')?'tight':node.classList.contains('compact')?'compact':'full';
    if(node.classList.contains('narrow')||node.classList.contains('context-only'))node.classList.remove('narrow','context-only');
    // Flex shrink alone does not constrain nowrap children or protect controls
    // positioned outside the flex flow (e.g. Agent Manager window buttons).
    const fits=()=>{
      const rect=node.getBoundingClientRect(),row=composer.row.getBoundingClientRect();
      const intersects=other=>Math.min(rect.right,other.right)-Math.max(rect.left,other.left)>1&&Math.min(rect.bottom,other.bottom)-Math.max(rect.top,other.top)>1;
      if(bar.scrollWidth>bar.clientWidth+2||rect.width<=0||rect.left< -1||rect.right>innerWidth+1||rect.top< -1||rect.bottom>innerHeight+1||rect.left<row.left-1||rect.right>row.right+1)return false;
      if(!nativeComfortable())return false;
      if(composer.kind==='subagent'&&intersects(composer.anchor.getBoundingClientRect()))return false;
      for(const control of document.querySelectorAll('button,[role="button"],a[href],input,select,[contenteditable="true"]')){
        const other=control.getBoundingClientRect();
        if(other.width<=0||other.height<=0||!intersects(other))continue;
        if(control.closest('[hidden],[inert]')||getComputedStyle(control).visibility==='hidden')continue;
        // Scrolling messages can put clipped/covered links underneath the
        // fixed composer. Their rectangles alone are not a visible collision.
        // Always reserve local actions; other controls must actually paint at
        // the intersection (e.g. a floating jump-to-bottom button).
        if(composer.row.parentElement.contains(control))return false;
        const left=Math.max(rect.left,other.left),right=Math.min(rect.right,other.right),top=Math.max(rect.top,other.top),bottom=Math.min(rect.bottom,other.bottom);
        for(const [x,y]of [[(left+right)/2,(top+bottom)/2],[left+.5,top+.5],[right-.5,top+.5],[left+.5,bottom-.5],[right-.5,bottom-.5]]){
          const hit=document.elementFromPoint(x,y);
          if(hit===control||control.contains(hit))return false;
        }
      }
      return true;
    };
    const rowWidth=composer.row.getBoundingClientRect().width;
    const probeKey=()=>node.style.cssText.replace(/--pulse-native-room:[^;]+;?/g,'')+'|'+language.language+'|'+lastConversation+'|'+bar.textContent+'|'+getComputedStyle(composer.row).gap+'|'+Array.from(composer.row.querySelectorAll('button,[role="button"],a[href],input,select')).filter(c=>c!==composer.model&&!c.contains(composer.model)).map(c=>c.getBoundingClientRect().width).join(',');
    const key=probeKey();
    let safe=fits();
    const compressed=oldDensity&&oldDensity!=='full';
    const shouldReprobe=!compressed||!densityProbe||key!==densityProbe.key||rowWidth>=densityProbe.width+4;
    if((compressed&&shouldReprobe)||!safe){
      previous=densitySnapshot(previous);
      safe=false;
      for(const mode of ['full','compact','tight','icons']){
        applyDensity(mode);
        if(fits()){safe=true;break;}
      }
      if(!safe)applyDensity('icons');
      densityProbe=currentDensity()==='full'?null:{key,width:rowWidth};
    }
    node.dataset.density=currentDensity();
    const state=safe?'ready':'blocked';
    if(node.dataset.layout!==state){node.dataset.layout=state;node.inert=!safe;if(!safe)hide();}
    const changed=safe&&oldReady&&previous?.row===composer.row&&oldDensity!==node.dataset.density;
    const next=changed?densitySnapshot():{rect:node.getBoundingClientRect(),model:composer.model,modelRect:composer.model?.getBoundingClientRect(),row:composer.row};
    if(changed)animateDensity(previous,next);
    else if(!safe||previous?.row!==composer.row||previous?.model!==composer.model)stopDensityMotion();
    else if(densityMotion)clipDensityMotion(next);
    densityFrame=next;
  }
  function badgeTextRects(badge){
    if(!badge?.isConnected)return [];
    const walker=document.createTreeWalker(badge,NodeFilter.SHOW_TEXT),range=document.createRange(),rects=[];
    for(let text=walker.nextNode();text;text=walker.nextNode()){
      if(!text.textContent.trim()||text.parentElement?.closest('svg,[hidden],[inert]')||getComputedStyle(text.parentElement).visibility==='hidden')continue;
      range.selectNodeContents(text);rects.push(...range.getClientRects());
    }
    return rects.filter(r=>r.width>0&&r.height>0);
  }
  function captureNative(found){
    const branch=found.branch,r=branch.getBoundingClientRect();
    const baseline={height:r.height,icons:Array.from(branch.querySelectorAll('svg')).map(icon=>({icon,width:icon.getBoundingClientRect().width})),reserve:0};
    if(found.kind==='ide')baseline.reserve=surface.nativeReserve(found);
    if(found.kind==='subagent'){
      const badge=found.anchor,style=getComputedStyle(badge);
      // Summed glyph fragments recover intrinsic text width even if the host
      // is already wrapping the badge when we first attach.
      const textWidth=badgeTextRects(badge).reduce((sum,rect)=>sum+rect.width,0);
      const iconWidth=badge.querySelector('svg')?.getBoundingClientRect().width||0;
      const natural=textWidth+Math.max(iconWidth,12)+(parseFloat(style.columnGap)||0)+(parseFloat(style.paddingLeft)||0)+(parseFloat(style.paddingRight)||0);
      baseline.reserve=Math.ceil(Math.max(badge.getBoundingClientRect().width,natural)+badge.getBoundingClientRect().left-r.left+(parseFloat(getComputedStyle(branch).paddingRight)||0));
    }
    return baseline;
  }
  function nativeComfortable(){
    const baseline=composer.native;
    if(!baseline)return true;
    if(composer.branch.getBoundingClientRect().height>baseline.height+1)return false;
    if(baseline.icons.some(({icon,width})=>icon.isConnected&&icon.getBoundingClientRect().width<width-.5))return false;
    if(composer.kind==='ide'&&composer.branch.getBoundingClientRect().width<baseline.reserve-1)return false;
    if(composer.kind==='subagent'){
      if(composer.branch.getBoundingClientRect().width<baseline.reserve-1)return false;
      const lines=new Set(badgeTextRects(composer.anchor).map(r=>Math.round(r.top)));
      if(lines.size>1)return false;
    }
    return true;
  }
  function reserveNativeSpace(){
    if(!['subagent','ide'].includes(composer.kind)){if(node.style.getPropertyValue('--pulse-native-room'))node.style.removeProperty('--pulse-native-room');if(node.classList.contains('native-no-room'))node.classList.remove('native-no-room');return;}
    const row=composer.row,style=getComputedStyle(row),siblings=Array.from(row.children).filter(e=>e!==node&&e!==composer.branch&&e.getClientRects().length);
    const room=row.clientWidth-(parseFloat(style.paddingLeft)||0)-(parseFloat(style.paddingRight)||0)-composer.native.reserve-siblings.reduce((sum,e)=>{const s=getComputedStyle(e);return sum+e.getBoundingClientRect().width+(parseFloat(s.marginLeft)||0)+(parseFloat(s.marginRight)||0);},0)-(parseFloat(style.columnGap)||0)*(siblings.length+1)-10;
    const width=`${Math.max(0,Math.floor(room))}px`;if(node.style.getPropertyValue('--pulse-native-room')!==width)node.style.setProperty('--pulse-native-room',width);
    // A hidden ribbon must release its flex space as well as its hit targets.
    // The budget is independent of our own rectangle, so it recovers directly
    // when the sidebar is closed, without probing the native badge each frame.
    node.classList.toggle('native-no-room',room<76);
  }
  function scheduleLayout(){
    if(disposed||layoutFrame!==null)return;
    layoutFrame=requestAnimationFrame(()=>{layoutFrame=null;if(disposed)return;mount();fit();position();});
  }
  function observeComposer(){
    resizeObserver?.disconnect();
    resizeObserver??=new ResizeObserver(scheduleLayout);
    for(const element of new Set([node,composer.row,composer.row.parentElement,composer.branch,composer.editor]))resizeObserver.observe(element);
  }
  function composerLayout({row,editor,branch}){
    // Containment alone can join an app header and a distant message editor.
    // Accept only a horizontal, normal-flow action row local to that editor.
    const style=getComputedStyle(row);
    if(!['flex','inline-flex'].includes(style.display)||style.flexDirection!=='row'||['absolute','fixed'].includes(style.position)||row.closest('header,[role="banner"]'))return false;
    if(['absolute','fixed'].includes(getComputedStyle(branch).position))return false;
    const r=row.getBoundingClientRect(),e=editor.getBoundingClientRect(),p=row.parentElement.getBoundingClientRect();
    const gap=Math.max(0,r.top-e.bottom,e.top-r.bottom);
    const overlap=Math.min(r.bottom,e.bottom)-Math.max(r.top,e.top);
    return r.width>0&&r.height>0&&e.width>0&&e.height>0&&gap<=48&&overlap<=2&&Math.min(r.right,e.right)>Math.max(r.left,e.left)&&p.height<=e.height+r.height+96;
  }
  const cardEngaged=()=>Boolean(root?.activeElement?.matches(':focus-visible')||node?.matches(':hover')||root?.querySelector('.card:not([hidden]):hover'));
  function cardVisibility(element,visible){
    if(visible){hidden(element,false);if(element.hasAttribute('popover')&&!element.matches(':popover-open'))element.showPopover();}
    else {if(element.hasAttribute('popover')&&element.matches(':popover-open'))element.hidePopover();hidden(element,true);}
  }
  function syncContextNote(){
    if(!root)return;
    const card=$('context-card');
    const key=hoveredCtxRow?.key||baseCtxNoteKey;
    const note=key?t(key):'';
    if(card)attribute(card,'data-hover-seg',hoveredCtxRow?.seg||null);
    text('context-note',note);hidden($('context-note'),!note);
  }
  function hide({keepWarm=false}={}){
    clearTimeout(openTimer);openTimer=null;
    clearTimeout(hoverTimer);hoverTimer=null;
    if(!keepWarm)warmUntil=0;
    changingCards=true;
    try{cardName=null;hoveredCtxRow=null;syncContextNote();for(const e of root?.querySelectorAll('[data-card]')||[])e.setAttribute('aria-expanded','false');for(const e of root?.querySelectorAll('.card')||[])cardVisibility(e,false);}
    finally{changingCards=false;}
  }
  function show(name){
    if(disposed||!node?.isConnected||changingCards||usageDashboard?.isOpen||node.dataset.layout==='blocked')return;
    clearTimeout(hoverTimer);hoverTimer=null;
    clearTimeout(openTimer);openTimer=null;
    cardName=name;warmUntil=0;
    for(const e of root.querySelectorAll('[data-card]'))e.setAttribute('aria-expanded',String(e.dataset.card===name));
    changingCards=true;
    try{for(const e of root.querySelectorAll('.card'))cardVisibility(e,e.id===`${name}-card`);}
    finally{changingCards=false;}
    position();
  }
  function hoverChip(name){
    clearTimeout(hoverTimer);
    if(isWarm()){
      clearTimeout(openTimer);openTimer=null;
      show(name);
    }else{
      clearTimeout(openTimer);
      const anchor=node,chip=root?.querySelector(`[data-card="${name}"]`),editor=composer?.editor,conversation=conversationId();
      openTimer=setTimeout(()=>{
        openTimer=null;
        // A host route/composer replacement can detach the chip without a
        // pointerleave. Never show a stale or disconnected top-layer popover.
        if(disposed||node!==anchor||!anchor?.isConnected||!chip?.isConnected||!chip.matches(':hover')||composer?.editor!==editor||conversationId()!==conversation)return;
        show(name);
      },HOVER_DELAY);
    }
  }
  function leaveChip(){
    clearTimeout(openTimer);openTimer=null;
  }
  function scheduleHide(){
    clearTimeout(openTimer);openTimer=null;
    clearTimeout(hoverTimer);
    // Measure the warm window from pointer departure, not the later hide.
    if(cardName)warmUntil=Date.now()+WARM_WINDOW;
    hoverTimer=setTimeout(()=>{hoverTimer=null;if(!cardEngaged())hide({keepWarm:true});},LEAVE_DELAY);
  }
  function position(){
    if(!cardName)return;
    const button=root.querySelector(`[data-card="${cardName}"]`),card=$(`${cardName}-card`),rect=button.getBoundingClientRect();
    const width=Math.min(cardName==='context'?276:300,window.innerWidth-24);style(card,'width',`${width}px`);
    const roomAbove=rect.top-21,roomBelow=window.innerHeight-rect.bottom-21;
    style(card,'overflow-y','auto');
    style(card,'left',`${Math.min(window.innerWidth-width-12,Math.max(12,rect.left+rect.width/2-width/2))}px`);
    // scrollHeight includes clipped content. Expanding maxHeight to measure it
    // on every poll used to reset scrollTop and then shrink the card again.
    const height=card.scrollHeight+card.offsetHeight-card.clientHeight;
    const useAbove=height<=roomAbove || roomAbove>=roomBelow;
    style(card,'max-height',`${Math.max(80,useAbove?roomAbove:roomBelow)}px`);
    style(card,'top',`${Math.max(12,useAbove?rect.top-card.offsetHeight-9:rect.bottom+9)}px`);
  }
  function findComposer(){
    if(surface&&!surface.useSharedComposer)return surface.findComposer(composer);
    const visible=visibleHostElement;
    const semanticEditors=Array.from(document.querySelectorAll('[role="combobox"][contenteditable="true"],[role="textbox"][contenteditable="true"]')).filter(visible);
    const editors=Array.from(new Set([...semanticEditors,...Array.from(document.querySelectorAll('[aria-label="Message input"]')).filter(visible)]));
    const stableModels=Array.from(document.querySelectorAll('[data-testid="model-selector-trigger"]')).filter(visible);
    const models=stableModels.length?stableModels:Array.from(document.querySelectorAll('button[role="combobox"][aria-haspopup],button[aria-label^="Select model"]')).filter(visible);
    const pairs=[];
    const ownsEditor=(element,editor)=>element.closest('[data-testid="agent-input-box"]')===editor.closest('[data-testid="agent-input-box"]');
    for(const model of models)for(const editor of editors){
      if(!ownsEditor(model,editor))continue;
      let row=model.parentElement,distance=1;
      // The toolbar branch and editable branch meet at their nearest common
      // composer ancestor. Action-button labels and generation state are irrelevant.
      while(row?.parentElement&&!row.parentElement.contains(editor)&&row.parentElement!==document.body&&row.parentElement!==document.documentElement){row=row.parentElement;distance++;}
      if(!row||row===document.body||row.contains(editor)||!row.parentElement?.contains(editor)||[document.body,document.documentElement].includes(row.parentElement))continue;
      for(let element=editor;element&&element!==row.parentElement;element=element.parentElement)distance++;
      let branch=model;while(branch.parentElement!==row)branch=branch.parentElement;
      const pair={editor,model,row,branch,box:editor.closest('[data-testid="agent-input-box"]'),distance,kind:'main'};
      if(composerLayout(pair))pairs.push(pair);
    }
    // Subagents have a static identity badge instead of a model selector.
    // Use only a bounded, stable host input box with a semantic send control;
    // never use the auxiliary pane's arbitrary comboboxes as an anchor.
    for(const editor of editors){
      const box=editor.closest('[data-testid="agent-input-box"]');
      if(!box||!visible(box))continue;
      const owned=e=>e.closest('[data-testid="agent-input-box"]')===box;
      const activeEditors=Array.from(box.querySelectorAll('[contenteditable="true"]')).filter(e=>owned(e)&&visible(e));
      if(!activeEditors.includes(editor)||activeEditors.length!==1)continue;
      if(Array.from(box.querySelectorAll('[data-testid="model-selector-trigger"]')).some(e=>owned(e)&&visible(e)))continue;
      const controls=Array.from(box.querySelectorAll('[data-testid="send-button"],[data-tooltip-id*="send-button"],[data-testid="stop-button"],[data-testid="cancel-button"],button[aria-label]'))
        .filter(e=>owned(e)&&visible(e)&&(e.hasAttribute('data-testid')&&/^(send|stop|cancel)-button$/.test(e.dataset.testid)||e.getAttribute('data-tooltip-id')?.includes('send-button')||/^(?:cancel|stop|取消|停止)(?:\b|\s|生成|任务|响应|$)/i.test(e.getAttribute('aria-label')||'')));
      for(const send of controls){
        let row=send.parentElement,distance=1;
        while(row?.parentElement&&row.parentElement!==box&&!row.parentElement.contains(editor)){row=row.parentElement;distance++;}
        if(!row||row.contains(editor)||!row.parentElement?.contains(editor)||!box.contains(row))continue;
        // The smallest static icon+text badge is structural evidence, even
        // without title/span. Icon-only controls and ambiguous badges fail closed.
        const interactive='button,a,input,select,[contenteditable="true"],[role="button"],[role="combobox"],[aria-haspopup]';
        const candidates=Array.from(row.querySelectorAll('*')).filter(e=>owned(e)&&visible(e)&&e.id!==ID&&!e.closest('#'+ID)&&e.querySelector('svg')&&badgeTextRects(e).length&&!e.contains(send)&&!send.contains(e)&&!e.matches(interactive)&&!e.closest(interactive)&&!e.querySelector(interactive));
        const anchors=candidates.filter(e=>!candidates.some(other=>other!==e&&e.contains(other)));
        if(anchors.length!==1)continue;
        const anchor=anchors[0];let branch=anchor;while(branch.parentElement!==row)branch=branch.parentElement;
        if(branch.contains(send))continue;
        for(let element=editor;element&&element!==row.parentElement;element=element.parentElement)distance++;
        const pair={editor,model:null,row,branch,anchor,box,distance,kind:'subagent'};
        if(composerLayout(pair)&&!pairs.some(p=>p.editor===editor&&p.row===row&&p.branch===branch))pairs.push(pair);
      }
    }
    pairs.sort((a,b)=>a.distance-b.distance);
    if(!pairs.length)return null;
    const focused=pairs.filter(pair=>pair.editor===document.activeElement||pair.editor.contains(document.activeElement));
    if(focused.length===1)return focused[0];
    const retained=pairs.filter(pair=>pair.branch===composer?.branch&&pair.editor===composer?.editor);
    if(retained.length===1)return retained[0];
    // Equally plausible visible composers must not place the strip arbitrarily.
    const closest=pairs.filter(pair=>pair.distance===pairs[0].distance);
    if(closest.length===1)return closest[0];
    return closest.find(pair=>pair.editor===document.activeElement)||closest.find(pair=>pair.branch===composer?.branch&&pair.editor===composer?.editor)||null;
  }
  function canKeepMounted(){
    if(surface||!node?.isConnected||!composer?.editor?.isConnected||!composer.row?.isConnected||!composer.branch?.isConnected)return false;
    if(node.parentElement!==composer.row||node.previousElementSibling!==composer.branch||node.dataset.layout==='blocked')return false;
    if(!visibleHostElement(composer.editor))return false;
    const active=document.activeElement;
    if(active&&active!==composer.editor&&!composer.editor.contains(active)&&active.closest?.('[data-testid="agent-input-box"]'))return false;
    return true;
  }
  function mount(){
    if(disposed)return;
    // A replaced instance's delayed preferences/observer callback must never
    // resurrect it. Also remove identifiable leftovers from older runtimes
    // before measuring the native toolbar or attaching this instance's host.
    for(const orphan of document.querySelectorAll('[id="'+ID+'"]')){
      if(orphan!==node&&['speed','cache','context'].every(name=>orphan.shadowRoot?.querySelector('.bar .chip[data-card="'+name+'"]')))orphan.remove();
    }
    // Account usage does not belong to a composer lifecycle. Keep its frame
    // during reflows and park the host if the app replaces the input subtree.
    // Normal discovery reattaches the strip after the user closes the modal.
    if(usageDashboard?.isOpen&&node){
      if(!node.isConnected||!node.getClientRects().length){node.dataset.layout='blocked';document.body.append(node);usageDashboard.restoreModal();}
      return;
    }
    if(canKeepMounted()){if(syncConversation())render();return;}
    const found=findComposer();
    if(!found){
      stopDensityMotion();densityFrame=null;densityProbe=null;composer=null;resizeObserver?.disconnect();
      if(node){
        hide();usageDashboard?.dispose();usageDashboard=null;themeController?.dispose();themeController=null;
        node.remove();node=null;root=null;
        // A disposed dialog cannot be reused with its old strip/listeners.
        // Invalidate this mount's pending requests and rebuild on discovery.
        requestEpoch++;pending=false;refreshRequest=null;manualRequest=null;lastFetch=0;
      }
      return;
    }
    found.native=composer?.branch===found.branch&&composer?.anchor===found.anchor?composer.native:captureNative(found);
    if(found.kind==='ide')found.native.reserve=surface.nativeReserve(found);
    composer=found;
    if(syncConversation())render();
    const {editor,model,row,branch}=found;
    if(node)node.dataset.scope=found.kind;
    if(node?.isConnected&&node.parentElement===row&&node.previousElementSibling===branch)return;
    if(node){stopDensityMotion();densityFrame=null;densityProbe=null;hide();row.insertBefore(node,branch.nextSibling);observeComposer();themeController?.dispose();themeController=theme.attach(node,{embedded:true});if(data?.theme)themeController.setHostTheme(data.theme);fit();position();return;}
    resizeObserver?.disconnect();node?.remove();node=document.createElement('div');node.id=ID;
    node.dataset.scope=found.kind;
    node.style.cssText='display:flex;align-items:center;flex:0 1 auto;min-width:0;max-width:min(100%,var(--pulse-native-room,100%));height:28px;margin:0 5px;position:relative;';
    root=node.attachShadow({mode:'open'});
    setMarkup(root,`<style>${theme.shadowCss()}
      :host{color-scheme:var(--pulse-scheme);font-family:var(--pulse-font,"Google Sans Flex","Google Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif);color:var(--pulse-foreground);font-size:12px;font-variant-numeric:tabular-nums}*{box-sizing:border-box}button,select{font:inherit}button{cursor:pointer}svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.45;stroke-linecap:round;stroke-linejoin:round;flex:none}button:focus-visible,select:focus-visible{outline:2px solid var(--pulse-accent);outline-offset:2px}
      .bar{display:flex;justify-content:flex-start;width:100%;align-items:center;gap:6px;min-height:28px;padding:1px 0;overflow:clip;min-width:0;max-width:100%}.chip{display:inline-flex;align-items:center;gap:5px;color:var(--pulse-muted);background:transparent;border:0;border-radius:7px;padding:4px 8px;white-space:nowrap;font-size:12px;font-weight:450;line-height:16px;min-width:0;transition:background-color 140ms ease,color 140ms ease}.chip svg{color:var(--pulse-muted)}.chip:hover,.chip[aria-expanded=true]{background:var(--pulse-hover);color:var(--pulse-value,var(--pulse-foreground))}.chip:hover svg,.chip[aria-expanded=true] svg{color:var(--pulse-value,var(--pulse-foreground))}.chip .sep{color:var(--pulse-muted);opacity:.75}.chip[hidden]{display:none}
      .card{position:fixed;inset:auto;margin:0;z-index:2147483000;padding:15px 17px 14px;border-radius:14px;background:var(--pulse-card);box-shadow:var(--pulse-card-shadow);border:1px solid var(--pulse-border);color:var(--pulse-foreground);font-size:13px}.card::backdrop{background:transparent;pointer-events:none}.card[hidden]{display:none}dl>[hidden]{display:none}
      .heading{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-bottom:11px;margin-bottom:10px;border-bottom:1px solid var(--pulse-separator);font-size:13px;font-weight:500;color:var(--pulse-foreground)}.heading>span:first-child{display:flex;align-items:center;gap:7px}.heading svg{width:15px;height:15px;color:var(--pulse-foreground)}.heading-value{font-size:13px;font-weight:600;color:var(--pulse-foreground);font-variant-numeric:tabular-nums}
      dl{margin:0}dl>div{display:flex;align-items:baseline;justify-content:space-between;gap:16px;margin:9px 0}dt{color:var(--pulse-muted);font-size:13px;font-weight:400}dd{margin:0;color:var(--pulse-value,var(--pulse-foreground));font-size:13px;font-weight:450;font-variant-numeric:tabular-nums;text-align:right}
      .footnote{font-size:11px;color:var(--pulse-subtle);line-height:1.55;margin:10px 0 0}.footnote[hidden]{display:none}
      .track{height:6px;border-radius:999px;background:var(--pulse-track);margin:10px 0 12px;overflow:hidden;display:flex;gap:1px}
      .ctx-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px}.ctx-title{font-size:13px;color:var(--pulse-muted)}.ctx-title strong{color:var(--pulse-foreground);font-weight:600;margin-left:2px}
      .ctx-seg{display:block;height:100%;width:0;min-width:0;flex:none;transition:width 160ms ease,opacity 140ms ease}.seg-sys{background:#9ca3af}.seg-ext{background:#14b8a6}.seg-tools{background:#a855f7}.seg-msg{background:#3b82f6}.seg-other{background:var(--pulse-accent,#3b82f6)}.seg-other.is-overhead,.dot-other{background-color:color-mix(in srgb,var(--pulse-muted) 34%,transparent);background-image:repeating-linear-gradient(-45deg,color-mix(in srgb,var(--pulse-muted) 32%,transparent) 0 2.5px,transparent 2.5px 5px)}
      .context-card[data-hover-seg] .ctx-seg{opacity:.36}.context-card[data-hover-seg="sys"] .seg-sys,.context-card[data-hover-seg="ext"] .seg-ext,.context-card[data-hover-seg="tools"] .seg-tools,.context-card[data-hover-seg="msg"] .seg-msg,.context-card[data-hover-seg="other"] .seg-other{opacity:1}
      .ctx-breakdown{margin:0}.ctx-breakdown[hidden]{display:none}.ctx-breakdown>div{margin:1px -7px;padding:4px 7px;border-radius:6px;cursor:default;transition:background-color 120ms ease}.ctx-breakdown>div:hover{background:var(--pulse-hover)}.ctx-breakdown>div:hover dt{color:var(--pulse-foreground)}.ctx-breakdown dt{display:flex;align-items:center;transition:color 120ms ease}.ctx-dot{display:inline-block;width:9px;height:9px;border-radius:2.5px;flex:none;margin-right:8px}.dot-sys{background:#9ca3af}.dot-ext{background:#14b8a6}.dot-tools{background:#a855f7}.dot-msg{background:#3b82f6}
      .context-card{padding-bottom:12px}.context-card .footnote{margin-top:8px;padding-top:8px;border-top:1px solid var(--pulse-separator);min-height:25px;transition:color 120ms ease}.context-card[data-hover-seg] .footnote{color:var(--pulse-muted)}
      :host([data-layout=blocked]){visibility:hidden!important;pointer-events:none!important}:host(.native-no-room){flex:0 0 0px!important;width:0!important;max-width:0!important;margin:0!important}
      .density-stage{position:absolute;overflow:clip;pointer-events:none;user-select:none}.density-piece{pointer-events:none!important}
      .scope-note{margin:0 0 10px;color:var(--pulse-muted);font-size:11px}:host([data-scope=main]) .scope-note,:host([data-scope=ide]) .scope-note{display:none}
      .context-ring{display:inline-block;flex:none;width:15px;height:15px;overflow:visible}
      .context-ring circle{fill:none;stroke-width:2.7;stroke-linecap:butt;shape-rendering:geometricPrecision}
      .context-ring-track{stroke:var(--pulse-ring-track)}
      .context-ring-fill{stroke:var(--ctx-ring-color,var(--pulse-value,var(--pulse-muted)));stroke-dasharray:var(--used-dash,0 100)}
      .collection-notice{margin:8px 0 10px;padding:9px 10px;border-left:2px solid var(--pulse-warning);background:var(--pulse-control);border-radius:6px;font-size:11px;line-height:1.55}.collection-notice[hidden]{display:none}.collection-notice p{margin:3px 0}.collection-notice summary{cursor:pointer;color:var(--pulse-label)}.collection-notice a{color:var(--pulse-emphasis);text-decoration:underline}.collection-notice strong{color:var(--pulse-warning)}:host(:not([data-collection=limited])) .collection-warning{display:none!important}.collection-warning,.collection-processing{display:none}.collection-label{display:none}:host([data-collection=limited]) [data-card=cache]{color:var(--pulse-warning)}:host([data-collection=limited]) [data-card=cache]>svg:first-child{display:none}:host([data-collection=limited]) [data-card=cache]>.collection-warning{display:block}:host([data-collection=limited]) [data-card=cache]>:not(svg){display:none}:host([data-collection=limited]) [data-card=cache]>.collection-label{display:inline}:host([data-collection=limited].icons-only) [data-card=cache]>.collection-label{display:none}:host([data-collection=processing]) .collection-notice{border-left-color:var(--pulse-emphasis)}:host([data-collection=processing]) .collection-notice strong,:host([data-collection=processing]) [data-card=cache]{color:var(--pulse-emphasis)}:host([data-collection=processing]) [data-card=cache]>svg:first-child,:host([data-collection=processing]) [data-card=cache]>:not(svg){display:none}:host([data-collection=processing]) [data-card=cache]>.collection-processing{display:block}:host([data-collection=processing]) [data-card=cache]>.collection-label{display:inline}:host([data-collection=processing].icons-only) [data-card=cache]>.collection-label{display:none}
      :host(:not([data-collection=processing])) .collection-processing{display:none!important}[data-card=cache]{position:relative}[data-card=cache][data-task-current-only=true]::after{content:'!';position:absolute;top:0;left:13px;z-index:1;width:9px;height:9px;border-radius:50%;background:var(--pulse-warning);color:var(--pulse-background);font-size:7px;font-weight:700;line-height:9px;text-align:center;pointer-events:none}
      #rate-note{white-space:pre-line}
      [data-card="speed"] .rounds,[data-card="speed"] .sep{display:none}
      :host(.compact) .bar{gap:3px}:host(.compact) .chip{padding:3px 6px;gap:4px;font-size:11.5px}
      :host(.tight) .bar{gap:2px}:host(.tight) .chip{padding:3px 5px;gap:4px;font-size:11.5px}:host(.tight) [data-card="speed"] .rounds,:host(.tight) [data-card="speed"] .sep,:host(.tight) [data-card="cache"] [data-i18n="cache"]{display:none}
      :host(.icons-only) .bar{gap:2px}:host(.icons-only) .chip{flex:0 0 24px;width:24px;min-width:24px;height:24px;padding:0;gap:0;justify-content:center}:host(.icons-only) .chip:focus-visible{outline-offset:-2px}:host(.icons-only) .chip>:not(svg):not(.context-ring){display:none}
      .skel-row{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 4px;flex:none;pointer-events:none;user-select:none}.skel-row[hidden]{display:none}.skel-pill{display:block;height:14px;border-radius:6px;background:var(--pulse-hover);animation:ag-pulse-skel 1.6s ease-in-out infinite}.skel-s{width:58px}.skel-m{width:118px}.skel-xs{width:40px}@keyframes ag-pulse-skel{0%,100%{opacity:.48}50%{opacity:.92}}
      @media(prefers-reduced-motion:reduce){.ctx-seg,.chip{transition:none}.skel-pill{animation:none}}
    </style><div class="bar" data-i18n-aria="strip" aria-label="Dashboard statistics">
      <span class="skel-row" id="skel-row" aria-hidden="true" hidden><i class="skel-pill skel-s"></i><i class="skel-pill skel-m"></i><i class="skel-pill skel-xs"></i></span>
      <button class="chip" data-card="speed" data-i18n-aria="session" hidden aria-controls="speed-card" aria-expanded="false">${svg('speed')}<span class="rounds" id="rounds" hidden>0 轮 0 步</span><span class="sep" aria-hidden="true" hidden>·</span><span id="tps">0</span><span>tok/s</span></button>
      <button class="chip" data-card="cache" data-i18n-aria="cacheTitle" hidden aria-controls="cache-card" aria-expanded="false">${svg('cache')}<svg class="collection-warning" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2 15 14H1ZM8 6v4m0 2v.1"/></svg><svg class="collection-processing" viewBox="0 0 16 16" aria-hidden="true"><path d="M13.5 8A5.5 5.5 0 1 1 8 2.5M8 1v3m3-2v3"/></svg><span class="collection-label"></span><span class="cache-total" id="cache-total">0 tok</span><span class="sep" aria-hidden="true">·</span><span data-i18n="cache">Cache hit</span><span id="cache-rate">0%</span></button>
      <button class="chip" data-card="context" data-i18n-aria="context" hidden aria-controls="context-card" aria-expanded="false"><svg class="context-ring" id="context-ring" viewBox="0 0 16 16" aria-hidden="true"><circle class="context-ring-track" cx="8" cy="8" r="5.6"/><circle class="context-ring-fill" cx="8" cy="8" r="5.6" pathLength="100" transform="rotate(-90 8 8)"/></svg><span id="context-percent">0%</span></button>
    </div><section class="card" id="speed-card" role="region" data-i18n-aria="session" aria-label="Session statistics" hidden>
      <div class="heading"><span>${svg('speed')}<span data-i18n="session">Session statistics</span></span><span class="heading-value" id="samples">0 轮 0 步</span></div>
      <dl>${[['modelTimeShort','model-time'],['toolTime','tool-time'],['ttftLabel','ttft'],['tpsLabel','session-rate']].map(([key,id])=>`<div><dt data-i18n="${key}">${t(key)}</dt><dd id="${id}">—</dd></div>`).join('')}</dl><p class="footnote" id="rate-note" hidden></p>
    </section><section class="card" id="cache-card" role="region" data-i18n-aria="cacheTitle" aria-label="Token usage" hidden>
      <div class="heading"><span>${svg('cache')}<span data-i18n="cacheTitle">Token usage</span></span><strong class="heading-value" id="cache-coverage">0 tok</strong></div>
      <dl>${[['cacheRate','cache-detail-rate'],['cacheMiss','cache-miss'],['cacheRead','cache-read'],['cacheOutput','cache-output'],['cacheWrite','cache-write']].map(([key,id])=>`<div ${id==='cache-write'?'id="cache-write-row" hidden':''}><dt data-i18n="${key}">${t(key)}</dt><dd id="${id}">0 tok</dd></div>`).join('')}<div id="task-own-row" hidden><dt data-i18n="taskOwn">${t('taskOwn')}</dt><dd id="task-own">—</dd></div><div id="task-subagents-row" hidden><dt id="task-subagents-label"></dt><dd id="task-subagents">—</dd></div></dl><p class="footnote" id="cache-note" hidden></p>
    </section><section class="card context-card" id="context-card" role="region" data-i18n-aria="context" hidden>
      <div class="ctx-head"><span class="ctx-title"><span data-i18n="contextUsedLabel">${t('contextUsedLabel')}</span> <strong id="context-summary-pct">0%</strong></span><strong class="heading-value" id="context-tokens">0</strong></div>
      <div class="track ctx-progress" role="progressbar" data-i18n-aria="context" id="context-track"><i class="ctx-seg seg-sys" id="ctx-seg-sys"></i><i class="ctx-seg seg-ext" id="ctx-seg-ext"></i><i class="ctx-seg seg-tools" id="ctx-seg-tools"></i><i class="ctx-seg seg-msg" id="ctx-seg-msg"></i><i class="ctx-seg seg-other" id="ctx-seg-other"></i></div>
      <dl class="ctx-breakdown" id="ctx-breakdown">
        <div id="ctx-sys-row" data-seg="sys" data-desc-key="breakdownSystemDesc"><dt><i class="ctx-dot dot-sys" aria-hidden="true"></i><span data-i18n="breakdownSystem">${t('breakdownSystem')}</span></dt><dd id="ctx-sys-val">0</dd></div>
        <div id="ctx-ext-row" data-seg="ext" data-desc-key="breakdownExtensionsDesc" hidden><dt><i class="ctx-dot dot-ext" aria-hidden="true"></i><span data-i18n="breakdownExtensions">${t('breakdownExtensions')}</span></dt><dd id="ctx-ext-val">0</dd></div>
        <div id="ctx-tools-row" data-seg="tools" data-desc-key="breakdownToolsDesc"><dt><i class="ctx-dot dot-tools" aria-hidden="true"></i><span data-i18n="breakdownTools">${t('breakdownTools')}</span></dt><dd id="ctx-tools-val">0</dd></div>
        <div id="ctx-msg-row" data-seg="msg" data-desc-key="breakdownMessagesDesc"><dt><i class="ctx-dot dot-msg" aria-hidden="true"></i><span data-i18n="breakdownMessages">${t('breakdownMessages')}</span></dt><dd id="ctx-msg-val">0</dd></div>
        <div id="ctx-other-row" data-seg="other" data-desc-key="breakdownOtherDesc" hidden><dt><i class="ctx-dot dot-other" aria-hidden="true"></i><span data-i18n="breakdownOther">${t('breakdownOther')}</span></dt><dd id="ctx-other-val">0</dd></div>
      </dl>
      <p class="footnote" id="context-note" hidden></p>
    </section>`);
    row.insertBefore(node,branch.nextSibling);
    for(const card of root.querySelectorAll('.card')){const anchor=card.querySelector('.heading,.ctx-head');const note=document.createElement('p');note.className='scope-note';note.dataset.i18n='subagentStats';if(anchor)anchor.after(note);}
    for(const card of root.querySelectorAll('.card')){
      const notice=document.createElement('section');notice.className='collection-notice';notice.hidden=true;
      setMarkup(notice,'<strong class="collection-state"></strong><p data-i18n="collectionReason"></p><details><summary data-i18n="collectionDetails"></summary><p class="collection-budget-kind"></p><p class="collection-budget-size"></p><p data-i18n="collectionNoPartial"></p></details>');
      const docs=document.createElement('a');docs.href='https://github.com/1swei/antigravity-context/blob/main/docs/LONG_CONVERSATIONS.md';docs.target='_blank';docs.rel='noopener noreferrer';docs.dataset.i18n='collectionDocs';notice.querySelector('details').append(docs);
      const anchor=card.querySelector('.heading,.ctx-head');if(anchor)anchor.after(notice);
      notice.querySelector('details').addEventListener('toggle',()=>{if(!disposed)position();});
    }
    // Escape ancestor stacking/paint contexts; ordinary z-index cannot do this.
    if(typeof HTMLElement==='function'&&typeof HTMLElement.prototype.showPopover==='function')for(const card of root.querySelectorAll('.card'))card.setAttribute('popover','manual');
    themeController=theme.attach(node,{embedded:true});
    if(data?.theme)themeController.setHostTheme(data.theme);
    report('mounted',{editorFound:true,composerFound:true});
    observeComposer();
    for(const chip of root.querySelectorAll('[data-card]')){
      chip.addEventListener('pointerenter',()=>hoverChip(chip.dataset.card));chip.addEventListener('pointerleave',leaveChip);chip.addEventListener('focus',()=>{if(chip.matches(':focus-visible'))show(chip.dataset.card);});chip.addEventListener('click',()=>show(chip.dataset.card));
    }
    for(const card of root.querySelectorAll('.card')){
      card.addEventListener('pointerenter',()=>clearTimeout(hoverTimer));card.addEventListener('pointerleave',scheduleHide);
    }
    const breakdownList=$('ctx-breakdown');
    if(breakdownList){
      for(const rowEl of ['ctx-sys-row','ctx-ext-row','ctx-tools-row','ctx-msg-row','ctx-other-row'].map(id=>$(id)).filter(Boolean)){
        rowEl.addEventListener('pointerenter',()=>{hoveredCtxRow={seg:rowEl.dataset.seg,key:rowEl.dataset.descKey};syncContextNote();});
        rowEl.addEventListener('pointerleave',()=>{if(hoveredCtxRow?.seg===rowEl.dataset.seg){hoveredCtxRow=null;syncContextNote();}});
      }
      breakdownList.addEventListener('pointerleave',()=>{if(hoveredCtxRow){hoveredCtxRow=null;syncContextNote();}});
    }
    // A host composer may focus its editor on bubbled clicks. Keep plugin
    // controls' mouse actions inside the shadow root while retaining their
    // default focus/click behavior and document-level outside-click dismissal.
    for(const type of ['pointerdown','mousedown','click'])root.addEventListener(type,event=>event.stopPropagation());
    node.addEventListener('pointerenter',()=>clearTimeout(hoverTimer));node.addEventListener('pointerleave',scheduleHide);
    root.addEventListener('focusout',()=>setTimeout(()=>{if(!cardEngaged())hide();},0));
    if(window.__agPulseUsageFactory){
      const section=document.createElement('div');section.id='usage-entry';section.hidden=true;
      setMarkup(section,'<dl class="usage-summary"><div><dt id="usage-today-label"></dt><dd><strong id="usage-today"></strong><span class="usage-unit">Token</span></dd></div><div><dt id="usage-month-label"></dt><dd><strong id="usage-month"></strong><span class="usage-unit">Token</span></dd></div></dl><button type="button" id="open-usage"><span class="usage-open-main"><span id="usage-open-label"></span><span id="usage-update-dot" class="usage-update-dot" hidden></span></span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4"/></svg></button>');$('cache-card').append(section);
      const css=document.createElement('style');css.textContent='#usage-entry{border-top:1px solid var(--pulse-separator);padding-top:7px;margin-top:12px}#usage-entry[hidden]{display:none}#open-usage{width:100%;display:flex;justify-content:space-between;padding:8px 10px;margin-top:9px;border:1px solid var(--pulse-border);border-radius:7px;background:var(--pulse-control);color:var(--pulse-foreground);font:inherit;transition:background 140ms ease,transform 120ms ease}#open-usage:hover{background:var(--pulse-hover)}#open-usage:active{transform:scale(.98)}';root.append(css);
      css.textContent+=`
        #usage-entry{padding-top:13px;margin-top:14px}.usage-summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;padding-bottom:13px;border-bottom:1px solid var(--pulse-separator)}
        .usage-summary>div{display:block;min-width:0;margin:0}.usage-summary dt{font-size:10px;line-height:16px;color:var(--pulse-muted);margin:0 0 5px}.usage-summary dd{display:flex;align-items:baseline;justify-content:flex-start;gap:5px;margin:0;white-space:nowrap;text-align:left;line-height:24px}
        .usage-summary strong{font-size:20px;font-weight:550;letter-spacing:-.5px;color:var(--pulse-foreground);font-variant-numeric:tabular-nums}.usage-unit{font-size:9px;letter-spacing:0;color:var(--pulse-muted)}
        #open-usage{align-items:center;min-height:34px;gap:12px;width:calc(100% + 12px);margin:5px -6px -3px;padding:7px 6px;border:0;border-radius:6px;background:transparent;color:var(--pulse-label);font-size:11px;text-align:left;line-height:20px}#open-usage:hover{background:var(--pulse-hover);color:var(--pulse-foreground)}#open-usage svg{width:14px;height:14px;color:var(--pulse-muted);flex:none}
        .usage-open-main{display:inline-flex;align-items:center;gap:6px;min-width:0}.usage-update-dot{width:6px;height:6px;border-radius:50%;background:#ef4444;flex:none}.usage-update-dot[hidden]{display:none}
      `;
      pendingUpdateReload||=takeUpdateReload();
      if(pendingUpdateReload?.guideDismissed||window.__agPulseHandover?.guideDismissed)usageGuideDismissed=true;
      usageDashboard=window.__agPulseUsageFactory({root,language,setMarkup,hostLabel:surface?.usageHostLabel||'Antigravity',guideDismissed:usageGuideDismissed,onDismissGuide:async()=>{const saved=await window.agPulseHost.setPreferences({usageGuideDismissed:true});if(saved?.usageGuideDismissed!==true)throw Error('Usage guide could not be saved');syncGuide(saved);},onLanguage:next=>preferences.choose(next),onRefresh:()=>refreshManually('refresh'),onUpdate:typeof window.agPulseHost?.updatePlugin==='function'?input=>window.agPulseHost.updatePlugin(input):null});
      $('open-usage').addEventListener('click',()=>{const trigger=root.querySelector('[data-card=cache]'),conversation=conversationId();hide();const cachedUsage=data?.usage?{...data.usage,syncing:false,syncMode:null,syncProgress:null}:data?.usage;usageDashboard.open(cachedUsage,trigger,data?.update);void window.agPulseHost.getMetrics({conversationId:conversation,force:true,usageCheck:true}).then(result=>{if(disposed)return;if(result?.usage){data=result;usageDashboard.update(result.usage,result.update);}const modalSync=Boolean(usageDashboard?.isOpen&&!document.hidden&&(result?.usage?.syncMode||(result?.usage?.syncing&&result?.usage?.summaryStale!==true)));if(modalSync&&!modalSyncTimer){modalSyncTimer=setTimeout(()=>{modalSyncTimer=null;if(!disposed&&usageDashboard?.isOpen&&!document.hidden)refresh();},250);modalSyncTimer.unref?.();}}).catch(()=>{});});
    }
    localize();
    render();refresh();
  }
  function render(){
    if(!root||!data)return;
    syncConversation();
    if(usageDashboard){
      const available=Boolean(data.usage);hidden($('usage-entry'),!available);
      text('usage-today',compact(data.usage?.todayTokens,'0'));text('usage-month',compact(data.usage?.monthTokens,'0'));usageDashboard.update(data.usage,data?.update);
      if($('usage-update-dot'))$('usage-update-dot').hidden=data?.update?.state!=='available';
      if(pendingUpdateReload?.reopenModal&&data.usage){
        const handover=pendingUpdateReload;
        pendingUpdateReload=null;
        updateGraceUntil=Date.now()+UPDATE_GRACE_MS;
        const liveUpdate=data?.update;
        const settled=Boolean(handover.settled||(liveUpdate&&!['installing','installed','reloading'].includes(liveUpdate.state)));
        const resolvedVersion=liveUpdate?.currentVersion||handover.toVersion||null;
        lastReloadMeta={toVersion:resolvedVersion,reopenUpdateMenu:handover.reopenUpdateMenu,settled,viewState:handover.viewState||null};
        if(data?.theme)themeController?.setHostTheme(data.theme);
        const trigger=root.querySelector('[data-card=cache]');
        const cachedUsage={...data.usage,syncing:false,syncMode:null,syncProgress:null};
        const initialUpdate=liveUpdate||(resolvedVersion?{state:settled?'current':'reloading',host:'app',currentVersion:resolvedVersion,latestVersion:resolvedVersion,...(settled?{}:{progress:{phase:'complete'}})}:undefined);
        hide();
        usageDashboard.open(cachedUsage,trigger,initialUpdate,{viewState:handover.viewState||null,settledVersion:settled?resolvedVersion:null});
        if(handover.reopenUpdateMenu){
          usageDashboard.showUpdateMenu({
            ...(settled?{reloadedVersion:resolvedVersion}:{reloadingVersion:resolvedVersion}),
            instant:true,
          });
        }
        try{window.__agPulseRetireModal?.();}catch{}
        awaitingReloadConfirmVersion=settled?undefined:handover.toVersion;
      }else if(awaitingReloadConfirmVersion!==undefined){
        const liveUpdate=data?.update;
        if(liveUpdate&&!['installing','installed','reloading'].includes(liveUpdate.state)){
          const version=liveUpdate.currentVersion||awaitingReloadConfirmVersion||null;
          awaitingReloadConfirmVersion=undefined;
          if(usageDashboard.isOpen)usageDashboard.confirmUpdateReloaded(version);
          if(lastReloadMeta){if(version)lastReloadMeta.toVersion=version;lastReloadMeta.settled=true;}
        }
      }
    }
    const speed=data.speed,collection=data.collection;
    const taskUsage=Number.isSafeInteger(speed?.taskUsage?.subagents)&&speed.taskUsage.subagents>0?speed.taskUsage:null;
    const limited=collection?.state==='limited'&&collection.code==='budget-exceeded';
    const processing=collection?.state==='processing'&&collection.code==='background-collection',collectionActive=limited||processing;
    attribute(node,'data-collection',processing?'processing':limited?'limited':null);
    const cacheChip=root.querySelector('[data-card="cache"]');
    const currentOnly=!collectionActive&&taskUsage?.state==='partial'&&taskUsage.loadedSubagents===0;
    const cacheLabel=collectionActive?t(processing?'collectionProcessing':'collectionLimited'):currentOnly?t('taskCurrentOnly'):t('cacheTitle');
    attribute(cacheChip,'data-task-current-only',currentOnly?'true':null);
    attribute(cacheChip,'aria-label',cacheLabel);
    attribute(cacheChip,'title',collectionActive||currentOnly?cacheLabel:null);
    attribute(cacheChip,'aria-busy',processing?'true':null);
    const collectionLabel=root.querySelector('.collection-label'),collectionText=t(processing?'collectionProcessing':'collectionLimited');
    if(collectionLabel.textContent!==collectionText)collectionLabel.textContent=collectionText;
    for(const notice of root.querySelectorAll('.collection-notice')){
      hidden(notice,!collectionActive);if(!collectionActive){notice.querySelector('details').open=false;continue;}
      const set=(selector,value)=>{const element=notice.querySelector(selector);if(element.textContent!==value)element.textContent=value;};
      set('.collection-state',collection.freshness==='saved'&&Number.isFinite(Date.parse(collection.lastSuccessAt))?t('collectionSavedAt',{time:date(collection.lastSuccessAt)}):t(collection.freshness==='saved'?'collectionSaved':'collectionLimited'));
      set('[data-i18n="collectionReason"]',t(processing?'collectionProcessingReason':collection.reason?(collection.retryable===false?'collectionBackgroundHalted':'collectionBackgroundFailed'):'collectionReason'));
      set('summary',t(processing?'collectionProgress':'collectionDetails'));
      hidden(notice.querySelector('[data-i18n="collectionNoPartial"]'),processing);
      hidden(notice.querySelector('a'),processing);
      if(processing){
        if(collection.freshness!=='saved')set('.collection-state',t('collectionProcessing'));
        const stages={queued:'collectionQueued',steps:'collectionSteps',generators:'collectionGenerators',reducing:'collectionReducing',publishing:'collectionPublishing'};
        set('.collection-budget-kind',t(stages[collection.stage]||'collectionQueued'));
        const valid=n=>Number.isSafeInteger(n)&&n>=0,steps=collection.processedSteps,requests=collection.processedGenerators;
        hidden(notice.querySelector('.collection-budget-size'),!valid(steps)||!valid(requests));
        if(valid(steps)&&valid(requests))set('.collection-budget-size',t('collectionProgressCounts',{steps:count(steps),requests:count(requests)}));
        continue;
      }
      set('.collection-budget-kind',t(collection.kind==='projected-json'?'collectionProjected':collection.kind==='field'?'collectionField':'collectionRetained'));
      const characters=collection.unit==='characters',limit=characters?collection.limit:collection.limitBytes,observed=characters?collection.observed:collection.observedBytes;
      const valid=n=>Number.isSafeInteger(n)&&n>=0;
      const format=n=>characters?t('collectionCharacters',{n:count(n)}):`${(Math.floor(n/1048576*100)/100).toFixed(2)} MiB (${count(n)} B)`;
      const size=notice.querySelector('.collection-budget-size');hidden(size,!valid(limit)||!valid(observed));
      if(valid(limit)&&valid(observed))set('.collection-budget-size',t('collectionObserved',{observed:format(observed),limit:format(limit)}));
    }
    const waitingInitial=data?.connection==='connecting'&&!data.speed&&!data.usage;
    hidden($('skel-row'),!waitingInitial);
    const hideSessionChips=waitingInitial||(!lastConversation&&!surface?.showEmpty&&!data.usage&&data.connection!=='live');
    hidden(root.querySelector('[data-card="speed"]'),hideSessionChips);
    hidden(root.querySelector('[data-card="cache"]'),hideSessionChips);
    const context=speed?.context,hasCapacity=typeof context?.usedFraction==='number'&&Number.isFinite(context.usedFraction);
    const usedFraction=hasCapacity?Math.max(0,Math.min(1,context.usedFraction)):null;
    const usedPct=usedFraction!==null?Math.round(usedFraction*100):0;
    const hasUsedTokens=typeof context?.usedTokens==='number'&&Number.isFinite(context.usedTokens);
    hidden(root.querySelector('[data-card="context"]'),waitingInitial);
    text('context-percent',`${usedPct}%`);
    const usedDash=usedFraction===null||usedFraction<=0?'0 100':usedFraction>=1?'none':`${(usedFraction*100).toFixed(2)} 100`;
    style($('context-ring'),'--used-dash',usedDash);
    style($('context-ring'),'--ctx-ring-color',usedFraction>=.9?'var(--pulse-danger)':usedFraction>=.75?'var(--pulse-warning)':'var(--pulse-value,var(--pulse-muted))');
    text('context-summary-pct',`${usedPct}%`);
    if(context&&hasUsedTokens){
      const prefix=context.estimated?'~':'';
      const maxPart=context.maxTokens!==null&&Number.isFinite(context.maxTokens)?` / ${compact(context.maxTokens,'0')}`:'';
      text('context-tokens',`${prefix}${compact(context.usedTokens,'0')}${maxPart}`);
    }else{
      text('context-tokens',context?.maxTokens!==null&&Number.isFinite(context?.maxTokens)?`0 / ${compact(context.maxTokens,'0')}`:'0');
    }
    const cb=speed?.contextBreakdown;
    const hasHostBreakdown=Boolean(cb?.source==='host-breakdown'&&cb.totalTokens>0);
    const ts=speed?.transcriptStats;
    const rawSys=ts?.activeSystemTokens??ts?.systemTokens??0;
    const rawTool=ts?.activeToolTokens??ts?.toolTokens??0;
    const rawMsg=(ts?.activeUserTokens??ts?.userTokens??0)+(ts?.activeAssistantTokens??ts?.assistantTokens??0);
    const rawSum=rawSys+rawTool+rawMsg;
    const hasTranscriptBreakdown=Boolean(ts&&rawSum>0);
    const hasBreakdown=hasHostBreakdown||hasTranscriptBreakdown;
    const barDenomBase=hasUsedTokens&&context.usedTokens>0?context.usedTokens:0;
    let sysTok=0,extTok=0,toolTok=0,msgTok=0,otherTok=0,ctxNoteKey='';
    if(hasHostBreakdown){
      const scale=barDenomBase>0?barDenomBase/cb.totalTokens:1;
      sysTok=Math.round(cb.systemTokens*scale);
      extTok=Math.round(cb.extensionsTokens*scale);
      toolTok=Math.round(cb.toolsTokens*scale);
      msgTok=Math.round(cb.messagesTokens*scale);
      if(barDenomBase>0){
        const diff=barDenomBase-(sysTok+extTok+toolTok+msgTok);
        if(diff!==0){
          const buckets=[['sys',sysTok],['ext',extTok],['tools',toolTok],['msg',msgTok]].sort((a,b)=>b[1]-a[1]);
          const top=buckets[0][0];
          if(top==='sys')sysTok=Math.max(0,sysTok+diff);
          else if(top==='ext')extTok=Math.max(0,extTok+diff);
          else if(top==='tools')toolTok=Math.max(0,toolTok+diff);
          else msgTok=Math.max(0,msgTok+diff);
        }
      }
      ctxNoteKey='contextBreakdownHint';
    }else if(hasTranscriptBreakdown){
      const cap=barDenomBase>0&&rawSum>barDenomBase?barDenomBase/rawSum:1;
      sysTok=Math.round(rawSys*cap);
      toolTok=Math.round(rawTool*cap);
      msgTok=Math.round(rawMsg*cap);
      otherTok=hasUsedTokens?Math.max(0,context.usedTokens-(sysTok+toolTok+msgTok)):0;
      ctxNoteKey=cb?.compactedPending?'contextBreakdownCompacted':'contextBreakdownFallback';
    }else if(hasUsedTokens&&context.usedTokens>0){
      const running=/RUNNING/i.test(String(speed?.status||''));
      ctxNoteKey=cb?.compactedPending?'contextBreakdownCompacted'
        :(ts?.status==='loading'||running)?'contextBreakdownPending'
        :'contextBreakdownUnavailable';
    }
    const showRows=hasBreakdown||!hasUsedTokens||context.usedTokens===0;
    if(showRows&&!ctxNoteKey)ctxNoteKey='contextBreakdownHint';
    baseCtxNoteKey=ctxNoteKey;
    const fmtSeg=n=>n>0?(hasHostBreakdown?compact(n,'0'):`~${compact(n,'0')}`):'0';
    hidden($('ctx-breakdown'),!showRows);
    text('ctx-sys-val',fmtSeg(sysTok));
    text('ctx-ext-val',fmtSeg(extTok));
    text('ctx-tools-val',fmtSeg(toolTok));
    text('ctx-msg-val',fmtSeg(msgTok));
    text('ctx-other-val',otherTok>0?`~${compact(otherTok,'0')}`:'0');
    const showTranscriptMode=!hasHostBreakdown&&hasTranscriptBreakdown;
    hidden($('ctx-ext-row'),showTranscriptMode);
    hidden($('ctx-other-row'),!(showTranscriptMode&&otherTok>0));
    if(!showRows)hoveredCtxRow=null;
    syncContextNote();
    const barDenom=context?.maxTokens>0?context.maxTokens:(sysTok+extTok+toolTok+msgTok+otherTok);
    const segPct=n=>barDenom>0&&n>0?`${Math.min(100,(n/barDenom)*100).toFixed(2)}%`:'0%';
    $('ctx-seg-other').classList?.toggle?.('is-overhead',showTranscriptMode);
    if(hasBreakdown&&barDenom>0){
      style($('ctx-seg-sys'),'width',segPct(sysTok));
      style($('ctx-seg-ext'),'width',segPct(extTok));
      style($('ctx-seg-tools'),'width',segPct(toolTok));
      style($('ctx-seg-msg'),'width',segPct(msgTok));
      style($('ctx-seg-other'),'width',segPct(otherTok));
    }else{
      style($('ctx-seg-sys'),'width','0%');
      style($('ctx-seg-ext'),'width','0%');
      style($('ctx-seg-tools'),'width','0%');
      style($('ctx-seg-msg'),'width','0%');
      style($('ctx-seg-other'),'width',usedFraction!==null&&usedFraction>0?`${Math.min(100,usedFraction*100).toFixed(2)}%`:'0%');
    }
    attribute($('context-track'),'aria-valuenow',String(usedPct));attribute($('context-track'),'aria-valuemin','0');attribute($('context-track'),'aria-valuemax','100');
    const roundsStr=t('roundsCompact',{rounds:speed?.rounds??0,steps:speed?.steps??0});
    text('rounds',roundsStr);
    text('tps',speed?.latestRateStatus==='legacy'?'0':rate(speed?.tps,'0'));
    text('samples',roundsStr);
    text('model-time',durationCompact(speed?.modelSeconds));
    text('tool-time',durationCompact(speed?.toolSeconds));
    text('ttft',durationCompact(speed?.ttftSeconds));
    text('session-rate',speed?.latestRateStatus==='legacy'?t('ratePending'):speed?.latestRateStatus==='unreliable'?t('timingUnreliable'):`${rate(speed?.tps,'0')} tok/s`);
    const savedNote=!collectionActive&&speed?.restoredFromHistory?t('savedStats',{time:speed.savedAt?language.resetDate(speed.savedAt):'—'}):'';
    const saveWarning=data.persistenceError?t('saveFailed'):'';
    const rateWarn=speed?.latestRateStatus==='legacy'?language.rateNote(speed):'';
    const errText=language.errorMessage(data.error||(collectionActive?null:data.sessionError));
    const speedFooter=[errText,rateWarn,savedNote,saveWarning].filter(Boolean).join(' ');
    text('rate-note',speedFooter);hidden($('rate-note'),!speedFooter);
    const usage=taskUsage||speed,cache=usage?.cache;
    text('cache-rate',pct(cache?.hitRate,'0%'));text('cache-detail-rate',pct(cache?.hitRate,'0%'));
    const tokens=usage?.tokens || cache;
    const hasTotal=tokens?.measuredRequests&&Number.isSafeInteger(tokens.totalTokens)&&tokens.totalTokens>=0;
    text('cache-total',hasTotal?`${compact(tokens.totalTokens,'0')} tok`:'0 tok');
    text('cache-coverage',hasTotal?`${count(tokens.totalTokens,'0')} tok`:'0 tok');
    const inputCoverage={uncachedTokens:'uncachedRequests',cachedTokens:'cachedRequests',cacheWriteTokens:'cacheWriteRequests'};
    for(const [field,id]of[['cachedTokens','cache-read'],['uncachedTokens','cache-miss'],['cacheWriteTokens','cache-write'],['outputTokens','cache-output']]) {
      const available=field==='outputTokens'?(tokens?.outputAvailable??(tokens?.outputRequests??tokens?.measuredRequests)):(tokens?.[inputCoverage[field]]??tokens?.inputRequests??tokens?.measuredRequests);
      const known=Number.isSafeInteger(tokens?.[field])&&tokens[field]>=0;
      text(id,available&&known?`${count(tokens[field],'0')} tok`:(!speed||!tokens?.measuredRequests?'0 tok':'—'));
    }
    hidden($('cache-write-row'),!(tokens?.cacheWriteTokens>0));
    hidden($('task-own-row'),!taskUsage);hidden($('task-subagents-row'),!taskUsage);
    text('task-subagents-label',taskUsage?t('taskSubagents',{n:count(taskUsage.subagents,'0')}):'');
    for(const [field,id]of[['ownTokens','task-own'],['subagentTokens','task-subagents']]){
      const value=taskUsage?.[field],known=field!=='subagentTokens'||taskUsage?.loadedSubagents>0;
      text(id,known&&Number.isSafeInteger(value)&&value>=0?`${count(value,'0')} tok`:'0 tok');
    }
    const taskNote=taskUsage?.state==='loading'?t('taskLoading'):taskUsage?.state==='partial'?t(taskUsage.loadedSubagents===0?'taskCurrentOnly':'taskPartial'):'';
    text('cache-note',taskNote);hidden($('cache-note'),!taskNote);
    fit();position();
    if(data.connection==='live'&&(data.speed||data.usage))saveSessionSnap(lastConversation,data);
  }
  function refreshBusy(busy){
    for(const button of root?.querySelectorAll('.refresh')||[]){
      button.setAttribute('aria-busy',String(busy));button.setAttribute('aria-disabled',String(busy));
      button.dataset.i18nAria=busy?'refreshing':'refresh';button.title=t(button.dataset.i18nAria);button.setAttribute('aria-label',button.title);
    }
  }
  function refreshManually(syncUsage=false){
    if(manualRequest)return manualRequest.promise;
    refreshBusy(true);const started=performance.now();
    const epoch=requestEpoch,request={};manualRequest=request;
    request.promise=(async()=>{
      try{if(pending)await refreshRequest;if(!disposed&&epoch===requestEpoch)await refresh(true,syncUsage);}
      finally{
        if(manualRequest===request)manualRequest=null;
        const remaining=250-(performance.now()-started);
        const stopBusy=()=>{if(!disposed&&!manualRequest)refreshBusy(false);};
        if(remaining>0)setTimeout(stopBusy,remaining);
        else stopBusy();
      }
    })();
    return request.promise;
  }
  function refresh(force=false,syncUsage=false){
    if(disposed)return;
    if(syncConversation())render();
    if(pending)return refreshRequest;
    if(!node?.isConnected)return;
    const conversation=conversationId();
    const epoch=requestEpoch;
    const current=()=>!disposed&&epoch===requestEpoch&&conversation===conversationId()&&conversation===lastConversation&&node?.isConnected;
    pending=true;lastFetch=Date.now();
    refreshRequest=(async()=>{
      try{const syncParam=syncUsage===true?{usageSync:true}:syncUsage==='refresh'?{usageRefresh:true}:{};const result=await window.agPulseHost.getMetrics({conversationId:conversation,force,...syncParam});if(!current())return;node.style.visibility=result.enabled===false?'hidden':'';if(result.enabled===false){hide();return;}if(!conversation||result.speed&&result.speed.conversationId!==conversation)result.speed=null;if(result.connection==='offline'&&!result.speed&&data?.speed&&data.speed.conversationId===conversation){data={...data,...result,connection:'stale',speed:data.speed,usage:result.usage??data.usage,collection:result.collection??data.collection};}else{data=result;}if(result.preferences){syncGuide(result.preferences);preferences.sync(result.preferences);}if(Object.hasOwn(result,'theme'))themeController?.setHostTheme(result.theme);render();
        const modalSync=Boolean(usageDashboard?.isOpen&&!document.hidden&&(data?.usage?.syncMode||(data?.usage?.syncing&&data?.usage?.summaryStale!==true)));
        clearTimeout(modalSyncTimer);modalSyncTimer=null;
        if(modalSync){modalSyncTimer=setTimeout(()=>{modalSyncTimer=null;if(!disposed&&usageDashboard?.isOpen&&!document.hidden)refresh();},250);modalSyncTimer.unref?.();}
      }
      catch{if(current()&&data){data.connection='stale';data.error=t('reconnecting');render();}}
      finally{if(epoch===requestEpoch){pending=false;refreshRequest=null;}}
    })();
    return refreshRequest;
  }
  const observer=new MutationObserver(records=>{if(records.some(record=>record.target!==node&&!node?.contains(record.target)))scheduleLayout();});observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['style','class','hidden','inert','data-cascade-id','data-testid','data-tooltip-id','aria-label','role','contenteditable']});
  const onKey=e=>{if(e.key==='Escape')hide();}, onPointer=e=>{if(node&&!e.composedPath().includes(node))hide();};
  const onFocus=e=>{if(!node||!e.composedPath().includes(node))scheduleLayout();};
  document.addEventListener('keydown',onKey);document.addEventListener('pointerdown',onPointer);document.addEventListener('focusin',onFocus);
  window.addEventListener('resize',scheduleLayout);document.addEventListener('scroll',scheduleLayout,true);
  densityMedia.addEventListener('change',stopDensityMotion);
  const timerId=setInterval(()=>{mount();fit();position();if(conversationId()!==lastConversation||Date.now()-lastFetch>(document.hidden?10000:2200))refresh();},1000);
  window.__agPulseDispose=()=>{
    const dashUpdate=usageDashboard?.getUpdateState?.();
    const updState=dashUpdate?.state||data?.update?.state;
    const isUpdatingReload=['installed','reloading'].includes(updState)||(updState==='installing'&&dashUpdate?.busy)||(Date.now()<updateGraceUntil);
    const reloadViewState=isUpdatingReload&&usageDashboard?.isOpen?(usageDashboard.getViewState?.()||lastReloadMeta?.viewState||null):null;
    const updateReload=isUpdatingReload&&usageDashboard?.isOpen?{
      reopenModal:true,
      reopenUpdateMenu:Boolean(dashUpdate?.menuOpen||lastReloadMeta?.reopenUpdateMenu),
      toVersion:dashUpdate?.currentVersion||dashUpdate?.latestVersion||data?.update?.currentVersion||data?.update?.latestVersion||lastReloadMeta?.toVersion||null,
      settled:Boolean(lastReloadMeta?.settled&&awaitingReloadConfirmVersion===undefined),
      guideDismissed:Boolean(usageGuideDismissed),
      ...(reloadViewState?{viewState:reloadViewState}:{}),
      at:Date.now(),
    }:null;
    if(updateReload){try{if(typeof sessionStorage!=='undefined')sessionStorage.setItem(UPDATE_HANDOVER_KEY,JSON.stringify(updateReload));}catch{}}
    if(data?.speed||data?.usage||updateReload){try{window.__agPulseHandover={conversationId:lastConversation,data,at:Date.now(),...(usageGuideDismissed?{guideDismissed:true}:{}),...(updateReload?{updateReload}:{})};}catch{}saveSessionSnap(lastConversation,data);}
    else{try{delete window.__agPulseHandover;}catch{}}
    disposed=true;requestEpoch++;pending=false;refreshRequest=null;stopDensityMotion();densityFrame=null;densityProbe=null;
    clearInterval(timerId);clearTimeout(modalSyncTimer);modalSyncTimer=null;clearTimeout(hoverTimer);clearTimeout(openTimer);if(layoutFrame!==null)cancelAnimationFrame(layoutFrame);observer.disconnect();resizeObserver?.disconnect();themeController?.dispose();preferences.dispose();hide();
    if(updateReload&&node&&usageDashboard){
      try{window.__agPulseRetireModal?.();}catch{}
      const parkedNode=node,parkedDash=usageDashboard,parkedMenu=Boolean(updateReload.reopenUpdateMenu);
      const bar=root?.querySelector?.('.bar');if(bar)bar.hidden=true;
      parkedNode.id='';parkedNode.removeAttribute('id');
      for(const [k,v] of [['position','fixed'],['left','0'],['top','0'],['width','0'],['height','0'],['max-width','none'],['margin','0'],['overflow','visible'],['pointer-events','none'],['z-index','2147482999']])style(parkedNode,k,v);
      document.body?.append?.(parkedNode);
      let retireTimer=null;
      const retire=()=>{
        clearTimeout(retireTimer);retireTimer=null;
        if(window.__agPulseRetireModal===retire)delete window.__agPulseRetireModal;
        parkedDash.dispose();parkedNode.remove();
      };
      retireTimer=setTimeout(retire,20000);retireTimer.unref?.();
      window.__agPulseRetireModal=retire;
      parkedDash.parkForReload(parkedMenu,()=>{
        updateGraceUntil=0;lastReloadMeta=null;
        try{if(window.__agPulseHandover?.updateReload)delete window.__agPulseHandover.updateReload;}catch{}
        try{if(typeof sessionStorage!=='undefined')sessionStorage.removeItem(UPDATE_HANDOVER_KEY);}catch{}
        retire();
      },reloadViewState?.scrollTop??null);
    }else{
      usageDashboard?.dispose();node?.remove();
    }
    document.removeEventListener('keydown',onKey);document.removeEventListener('pointerdown',onPointer);document.removeEventListener('focusin',onFocus);
    document.removeEventListener('scroll',scheduleLayout,true);window.removeEventListener('resize',scheduleLayout);
    densityMedia.removeEventListener('change',stopDensityMotion);
    document.removeEventListener('DOMContentLoaded',mount);node=null;root=null;composer=null;
    window.__agPulseInlineInstalled=false;delete window.__agPulseDispose;
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
};
