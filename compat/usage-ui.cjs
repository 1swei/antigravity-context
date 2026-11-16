// Shared local usage views. Values and model labels are inserted as text.
module.exports = function createUsageDashboard({root,language,setMarkup,hostLabel='Antigravity',guideDismissed=false,onDismissGuide,onLanguage,onRefresh,onUpdate=null}) {
  const dialog=document.createElement('dialog');dialog.id='usage-dashboard';dialog.setAttribute('popover','manual');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-label',language.language==='zh-TW'?'用量統計':language.language==='zh-CN'?'用量统计':'Token usage');
  dialog.style.cssText='width:min(1000px,calc(100vw - 40px));max-width:none;height:auto;max-height:min(840px,calc(100dvh - 64px));min-height:min(500px,calc(100dvh - 64px));box-sizing:border-box;overflow:hidden;visibility:visible;pointer-events:auto;padding:0;border:1px solid var(--pulse-border);border-radius:16px;background:var(--pulse-background);color:var(--pulse-foreground);box-shadow:0 20px 64px rgba(0,0,0,.22)';
  const shell=document.createElement('div'),view=shell.attachShadow({mode:'open'});shell.style.height='auto';shell.style.maxHeight='inherit';dialog.append(shell);root.append(dialog);
  const backdrop=document.createElement('style');backdrop.textContent='#usage-dashboard{position:fixed;inset:0;margin:auto}#usage-dashboard::backdrop{background:rgba(10,10,12,.38);backdrop-filter:blur(2px);pointer-events:auto}';root.append(backdrop);
  const css=document.createElement('style');css.textContent=`
    :host{display:block;max-height:inherit;color:var(--pulse-foreground);font:13px/1.5 var(--pulse-font,"Google Sans Flex","Google Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif);font-variant-numeric:tabular-nums}
    *{box-sizing:border-box}button,select{font:inherit;color:inherit}button{cursor:pointer}
    button{border:1px solid transparent;background:transparent;border-radius:8px;transition:background-color 140ms ease,border-color 140ms ease,color 140ms ease,transform 120ms cubic-bezier(.23,1,.32,1)}
    button:active:not([disabled]){transform:scale(.97)}button:focus-visible,select:focus-visible{outline:2px solid var(--pulse-accent);outline-offset:2px}button[disabled]{opacity:.35;cursor:default}
    .page{max-height:min(840px,calc(100dvh - 64px));padding:22px 24px 16px;overflow:auto;display:flex;flex-direction:column;background:var(--pulse-background);scrollbar-gutter:stable;scrollbar-width:thin;scrollbar-color:var(--pulse-border) transparent}.page>*{flex:none}
    .top{display:flex;justify-content:space-between;gap:16px;align-items:center}
    .title-group{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
    h1{font-size:18px;letter-spacing:-.02em;line-height:1.3;margin:0;font-weight:500}
    .sub{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--pulse-muted)}
    .live-dot{display:inline-block;width:6px;height:6px;background:var(--pulse-success);border-radius:50%}
    .actions{display:flex;gap:6px;align-items:center}
    .actions button{position:relative;display:inline-flex;align-items:center;justify-content:center;height:28px;min-width:28px;padding:0;color:var(--pulse-muted);border-radius:8px}
    .update-dot{position:absolute;top:3px;right:3px;width:6px;height:6px;border-radius:50%;background:#ef4444;box-shadow:0 0 0 1.5px var(--pulse-background);pointer-events:none}.update-dot[hidden]{display:none}
    .actions button#locale{min-width:34px;padding:0 10px;border-radius:9999px;background:var(--pulse-control);border-color:var(--pulse-separator);color:var(--pulse-foreground);font-size:12px;font-weight:450}
    .actions button:hover{background:var(--pulse-hover);color:var(--pulse-foreground)}
    .actions button#locale:hover{border-color:var(--pulse-border)}
    .actions svg,.range svg,.menu-chevron,.menu-check,.intro-mark svg{display:block;fill:currentColor;stroke:none;flex:none}
    .actions svg{width:17px;height:17px}
    .locale-label{display:block;line-height:16px;text-align:center;font-size:12px}
    .totals{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:14px 0 18px}
    .metric{padding:11px 14px;border-radius:10px;background:var(--pulse-control);border:1px solid var(--pulse-separator);min-width:0}
    .metric label{display:block;color:var(--pulse-muted);font-size:11px;font-weight:450;line-height:1.3}
    .value{font-size:21px;letter-spacing:-.025em;line-height:1.25;margin:3px 0 0;font-weight:500}
    .unit{font-size:11px;color:var(--pulse-muted);margin-left:4px;font-weight:400;letter-spacing:0}
    .metric-sub{font-size:10.5px;color:var(--pulse-muted);margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .usage-content[hidden]{display:none}
    .breakdown-section{margin-top:16px;padding-top:16px;border-top:1px solid var(--pulse-separator)}
    .section-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 12px;flex-wrap:wrap}
    .section-title{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    h2{font-size:13px;font-weight:500;letter-spacing:-.01em;margin:0}
    .range-badge{display:inline-flex;align-items:center;height:20px;padding:0 7px;border-radius:6px;background:var(--pulse-control);border:1px solid var(--pulse-separator);color:var(--pulse-muted);font-size:10.5px;font-family:var(--pulse-mono,ui-monospace,monospace)}
    .muted{font-size:11px;color:var(--pulse-muted);margin-top:2px}
    .seg{display:inline-flex;padding:2px;background:var(--pulse-control);border:1px solid var(--pulse-separator);border-radius:8px;gap:2px}
    .seg button{border:1px solid transparent;padding:3px 10px;height:24px;border-radius:6px;font-size:11px;font-weight:450;color:var(--pulse-muted);display:inline-flex;align-items:center;gap:3px;white-space:nowrap}
    .seg button:hover{color:var(--pulse-foreground)}
    .seg button[aria-pressed=true]{background:var(--pulse-background);border-color:var(--pulse-border);color:var(--pulse-foreground);box-shadow:0 1px 2px rgba(0,0,0,.05)}
    .seg .menu-chevron{width:14px;height:14px;opacity:.8}
    .seg button[aria-expanded=true] .menu-chevron{transform:rotate(180deg)}
    .heat-wrap{overflow-x:auto;padding:2px 2px 6px}.calendar{min-width:660px}.months{display:grid;margin-left:30px;font-size:10px;color:var(--pulse-muted);margin-bottom:6px;font-family:var(--pulse-mono,ui-monospace,monospace)}.months button.heat-month{border:0;border-radius:4px;padding:1px 4px;margin-left:-4px;height:18px;font-size:10px;color:var(--pulse-muted);white-space:nowrap;justify-self:start;text-align:left;background:transparent}.months button.heat-month:hover:not([disabled]){background:var(--pulse-hover);color:var(--pulse-foreground)}.months button.heat-month[data-active=true]{color:var(--pulse-accent);font-weight:600}.months button.heat-month[disabled]{opacity:.35}
    .heat-row{display:flex;gap:8px}.weekdays{display:grid;grid-template-rows:repeat(7,1fr);width:22px;flex:none;font-size:9px;color:var(--pulse-muted);font-family:var(--pulse-mono,ui-monospace,monospace)}.heat{display:grid;grid-auto-flow:column;grid-template-rows:repeat(7,1fr);gap:3px;width:100%}
    .heat button{border:0;border-radius:3px;padding:0;min-width:0;aspect-ratio:1;background:var(--pulse-hover);outline-offset:1px}.heat button:hover:not(.future){outline:1.5px solid var(--pulse-accent)}.heat button[data-selected=true]{outline:1.5px solid var(--pulse-foreground)}
    .heat button[data-level="1"],.swatch[data-level="1"]{background:color-mix(in srgb,var(--pulse-accent) 24%,var(--pulse-hover))}.heat button[data-level="2"],.swatch[data-level="2"]{background:color-mix(in srgb,var(--pulse-accent) 46%,var(--pulse-hover))}.heat button[data-level="3"],.swatch[data-level="3"]{background:color-mix(in srgb,var(--pulse-accent) 70%,var(--pulse-hover))}.heat button[data-level="4"],.swatch[data-level="4"]{background:var(--pulse-accent)}.heat button.future{opacity:.22;cursor:default}
    .heat-footer{display:flex;justify-content:space-between;align-items:center;gap:14px;margin:8px 0 0;font-size:11px;color:var(--pulse-muted)}.scale{display:flex;align-items:center;gap:4px}.swatch{width:10px;height:10px;border-radius:2.5px;background:var(--pulse-hover)}
    .chart-controls{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
    .legend{display:flex;flex-wrap:wrap;gap:6px 8px;margin:0 0 12px}.legend button{display:inline-flex;align-items:center;gap:6px;padding:4px 9px;border-radius:9999px;font-size:11px;font-weight:450;border-color:var(--pulse-separator);background:var(--pulse-control);color:var(--pulse-foreground)}.legend button:hover{background:var(--pulse-hover)}.legend button[aria-pressed=false]{opacity:.4;text-decoration:line-through}.dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex:none;background:var(--model-color)}
    .chart-wrap{overflow-x:auto;border-bottom:1px solid var(--pulse-separator);padding:6px 0 14px;margin-bottom:14px}.chart{height:232px;display:flex;gap:10px;min-width:680px}.axis{width:42px;flex:none;position:relative;font-size:10px;color:var(--pulse-muted);font-family:var(--pulse-mono,ui-monospace,monospace)}.axis span{position:absolute;right:0;transform:translateY(50%)}.plot{position:relative;flex:1;display:flex;align-items:stretch;gap:4px;padding:0 2px}.plot[data-mode="7d"]{gap:12px}.plot[data-mode=year]{gap:8px}.grid-line{position:absolute;left:0;right:0;border-top:1px solid var(--pulse-separator);opacity:.55;pointer-events:none}.grid-line:first-child{opacity:.9}
    .bar-column{position:relative;flex:1;min-width:0;display:flex;align-items:flex-end;border:0;border-radius:4px;background:transparent;padding:0;margin-bottom:20px}.bar-column:active:not([disabled]){transform:none}.bar-column:hover{background:color-mix(in srgb,var(--pulse-hover) 55%,transparent)}.bar-column[data-active=true]{background:color-mix(in srgb,var(--pulse-accent) 10%,transparent)}
    .stack{display:flex;flex-direction:column-reverse;width:72%;max-width:28px;margin-inline:auto;gap:0;pointer-events:none;border-radius:4px 4px 0 0;overflow:hidden}.plot[data-mode="7d"] .stack{width:54%;max-width:46px}.plot[data-mode=year] .stack{width:58%;max-width:36px}.bar-column[data-active=true] .stack{outline:1.5px solid var(--pulse-accent);outline-offset:1px}.bar-segment{display:block;flex:none;width:100%;background:var(--model-color);min-height:0;pointer-events:auto;transition:opacity 140ms ease}.plot[data-highlight] .bar-segment:not([data-highlight=true]){opacity:.25}
    .x-label{position:absolute;top:calc(100% + 5px);left:50%;transform:translateX(-50%);font-size:9.5px;color:var(--pulse-muted);white-space:nowrap;font-family:var(--pulse-mono,ui-monospace,monospace);letter-spacing:-.02em}.bar-column[data-today=true] .x-label{color:var(--pulse-accent);font-weight:600}.bar-column[data-active=true] .x-label{color:var(--pulse-foreground);font-weight:600}.bar-column[data-month-start=true] .x-label{color:var(--pulse-foreground);font-weight:500}.empty-bar{height:1.5px;width:100%;background:var(--pulse-track);opacity:.4;border-radius:2px}.chart-empty{position:absolute;left:0;right:0;top:40%;text-align:center;color:var(--pulse-muted);font-size:12px;pointer-events:none}
    .chart-summary{font-size:11px;color:var(--pulse-muted);margin-top:2px}.chart-summary strong{color:var(--pulse-foreground);font-weight:500}
    .table-wrap{overflow:auto;border:1px solid var(--pulse-separator);border-radius:10px}.table{width:100%;border-collapse:collapse;text-align:right;font-size:12px;white-space:nowrap}
    .table th{font-weight:450;font-size:11px;color:var(--pulse-muted);background:var(--pulse-control);padding:8px 11px;border-bottom:1px solid var(--pulse-separator)}.table td{padding:9px 11px;border-bottom:1px solid var(--pulse-separator)}.table td:not(:first-child){font-family:var(--pulse-mono,ui-monospace,monospace);font-size:11.5px}.table th:first-child,.table td:first-child{text-align:left;padding-left:14px}.table th:last-child,.table td:last-child{padding-right:14px}.table td:first-child span{margin-right:7px}.table tbody tr:hover td{background:var(--pulse-hover)}.table tbody tr:last-child td{border-bottom:0}.table tfoot td{font-weight:500;background:var(--pulse-control);border-top:1px solid var(--pulse-separator);border-bottom:0;color:var(--pulse-foreground)}
    .share-cell{display:inline-flex;align-items:center;gap:6px;justify-content:flex-end}.share-bar{width:34px;height:4px;border-radius:999px;background:var(--pulse-hover);overflow:hidden;display:inline-block}.share-bar i{display:block;height:100%;background:var(--model-color)}
    .footer{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-top:18px;padding-top:12px;border-top:1px solid var(--pulse-separator);font-size:11px;color:var(--pulse-muted)}
    .alert{color:var(--pulse-warning);margin-top:10px;font-size:11px}
    .tip{position:fixed;z-index:20;max-width:280px;padding:10px 12px;border:1px solid var(--pulse-border);border-radius:10px;background:var(--pulse-menu);box-shadow:0 8px 28px var(--pulse-shadow);color:var(--pulse-foreground);font-size:11px;pointer-events:none}.tip[hidden]{display:none}.tip .tip-title{font-size:10px;color:var(--pulse-muted);margin-bottom:4px;font-family:var(--pulse-mono,ui-monospace,monospace)}.tip strong{font-size:15px;font-weight:500}.tip-model{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:2px 0;margin-top:3px}.tip-model .dot{margin-right:6px}.tip-model.dimmed{opacity:.5}.tip-model.active{font-weight:500}.model-share{font-size:10px;color:var(--pulse-muted);margin-left:8px;font-family:var(--pulse-mono,ui-monospace,monospace)}
    .usage-waiting{display:grid;place-items:center;min-height:240px;color:var(--pulse-muted);font-size:12px}.usage-waiting[hidden]{display:none}
    .year-picker{position:relative;flex:none}.year-trigger{display:inline-flex;align-items:center;justify-content:space-between;gap:6px;min-width:74px;height:28px;padding:0 8px 0 10px;background:var(--pulse-control);border:1px solid var(--pulse-separator);color:var(--pulse-foreground);font-size:11px;font-weight:450;border-radius:8px;font-family:var(--pulse-mono,ui-monospace,monospace)}.year-trigger:hover,.year-trigger[aria-expanded=true]{background:var(--pulse-hover);border-color:var(--pulse-border)}.menu-chevron{width:16px;height:16px;color:var(--pulse-muted);transition:transform 160ms cubic-bezier(.23,1,.32,1)}.year-trigger[aria-expanded=true] .menu-chevron{transform:rotate(180deg)}
    .menu-list{position:fixed;inset:auto;margin:0;padding:4px;min-width:108px;max-height:240px;overflow-y:auto;border:1px solid var(--pulse-border);border-radius:10px;background:var(--pulse-menu);color:var(--pulse-foreground);box-shadow:0 8px 26px var(--pulse-shadow);transform-origin:top right;opacity:1;transform:scale(1);transition:opacity 140ms ease,transform 160ms cubic-bezier(.23,1,.32,1)}.menu-list::backdrop{background:transparent;pointer-events:none}.menu-list.month-menu{min-width:168px}.menu-list.custom-menu{width:236px;max-height:none;padding:12px;overflow:visible}
    .menu-list.update-menu{width:292px;max-height:none;padding:14px;overflow:visible}
    .upd-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px}.upd-head strong{font-size:13px;font-weight:550;color:var(--pulse-foreground)}
    .upd-meta{margin:0 0 10px;display:flex;flex-direction:column;gap:5px}.upd-meta>div{display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:11px}.upd-meta dt{color:var(--pulse-muted)}.upd-meta dd{margin:0;font-family:var(--pulse-mono,ui-monospace,monospace);font-size:11.5px}
    .upd-prog-wrap{margin:10px 0}.upd-prog-wrap[hidden]{display:none}.upd-prog-head{display:flex;justify-content:space-between;gap:8px;font-size:10.5px;color:var(--pulse-muted);margin-bottom:5px;font-family:var(--pulse-mono,ui-monospace,monospace)}
    .upd-prog-track{position:relative;height:4px;border-radius:999px;background:var(--pulse-track);overflow:hidden}#upd-prog-fill{position:absolute;inset:0;border-radius:inherit;background:var(--pulse-accent);transform-origin:left;transform:scaleX(0);transition:transform 220ms cubic-bezier(.23,1,.32,1)}
    .upd-prog-wrap[data-indeterminate=true] #upd-prog-fill{animation:upd-indet 1.2s linear infinite}
    @keyframes upd-indet{from{transform:translateX(-40%) scaleX(.4)}to{transform:translateX(100%) scaleX(.4)}}
    .upd-notes{margin:8px 0 0;padding:8px 10px;border-radius:7px;background:var(--pulse-control);border:1px solid var(--pulse-separator);font-size:11px;line-height:1.5;color:var(--pulse-muted);white-space:pre-line;max-height:96px;overflow:auto}.upd-notes[hidden]{display:none}
    .upd-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px;padding-top:10px;border-top:1px solid var(--pulse-separator)}.upd-foot span{font-size:10.5px;color:var(--pulse-muted);line-height:1.35;min-width:0}
    .upd-foot button{flex:none;height:26px;padding:0 11px;border-radius:7px;font-size:11px;font-weight:500;border:1px solid var(--pulse-border);background:var(--pulse-control);color:var(--pulse-foreground)}.upd-foot button:hover:not([disabled]){background:var(--pulse-hover)}.upd-foot button.primary{border-color:transparent;background:var(--pulse-accent);color:#fff}.upd-foot button.primary:hover:not([disabled]){filter:brightness(1.06)}.upd-foot button[hidden]{display:none}
    .custom-fields{display:flex;flex-direction:column;gap:10px}.custom-field{display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--pulse-muted)}.custom-field input{height:30px;padding:0 8px;border:1px solid var(--pulse-border);border-radius:7px;background:var(--pulse-control);color:var(--pulse-foreground);font:12px/1.2 var(--pulse-mono,ui-monospace,monospace);color-scheme:inherit}.custom-field input:focus-visible{outline:2px solid var(--pulse-accent);outline-offset:1px}
    .custom-actions{display:flex;justify-content:flex-end;gap:6px;margin-top:2px}.custom-actions button{height:26px;padding:0 11px;border-radius:7px;font-size:11px;font-weight:450;border:1px solid var(--pulse-separator);background:var(--pulse-control);color:var(--pulse-foreground)}.custom-actions button:hover{background:var(--pulse-hover)}.custom-actions button.primary{border-color:transparent;background:var(--pulse-accent);color:#fff;font-weight:500}.custom-actions button.primary:hover{filter:brightness(1.06)}
    .menu-option{width:100%;border:0;border-radius:6px;padding:6px 8px;display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:12px;text-align:left;background:transparent;color:var(--pulse-foreground);font-family:var(--pulse-mono,ui-monospace,monospace)}.menu-option:hover,.menu-option:focus-visible{background:var(--pulse-hover)}.menu-option[aria-selected=true]{background:color-mix(in srgb,var(--pulse-accent) 12%,var(--pulse-menu));font-weight:500}.menu-meta{display:inline-flex;align-items:center;gap:6px;font-size:11px;color:var(--pulse-muted)}.menu-check{color:var(--pulse-accent);width:15px;height:15px;opacity:0}.menu-option[aria-selected=true] .menu-check{opacity:1}
    @starting-style{.menu-list:popover-open{opacity:0;transform:scale(.97)}}
    .usage-intro{display:flex;align-items:center;gap:10px;margin:12px 0 0;padding:9px 12px;border:1px solid var(--pulse-separator);border-radius:10px;background:var(--pulse-control);font-size:11.5px;line-height:1.5;color:var(--pulse-muted)}.usage-intro[hidden]{display:none}
    .intro-mark{display:flex;color:var(--pulse-accent);flex:none}.intro-mark svg{width:16px;height:16px}
    .intro-copy{flex:1;min-width:0}.intro-copy p{margin:0}
    .intro-error{color:var(--pulse-warning);font-size:11px;white-space:nowrap}.intro-error:empty{display:none}
    #usage-intro-done{flex:none;padding:0 11px;height:26px;border:1px solid var(--pulse-border);border-radius:9999px;background:var(--pulse-background);color:var(--pulse-foreground);font-size:11px;font-weight:450}#usage-intro-done:hover{background:var(--pulse-hover)}#usage-intro-done:disabled{opacity:.55;cursor:wait}
    @media(max-width:650px){.page{padding:18px 16px}.totals{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.value{font-size:19px}.section-head{align-items:flex-start;flex-wrap:wrap}.chart-controls{width:100%;justify-content:flex-end}.footer{align-items:flex-start;flex-direction:column;gap:4px}.usage-intro{flex-wrap:wrap}.chart{gap:8px}}
    @media(prefers-reduced-motion:reduce){button,.menu-list,.menu-chevron{transition:none}button:active{transform:none}}
  `;view.append(css);
  const page=document.createElement('div');page.className='page';
  setMarkup(page,`<header class="top"><div class="title-group"><h1 id="title"></h1><div class="sub"><span class="live-dot"></span><span id="subtitle"></span></div></div><div class="actions"><button id="locale" type="button" aria-label="Language"><span id="locale-label" class="locale-label">中</span></button><button id="update-btn" type="button" aria-label="Check for updates" aria-haspopup="dialog" aria-controls="update-menu" aria-expanded="false"><svg viewBox="0 -960 960 960" aria-hidden="true"><path d="M480-320 280-520l56-58 104 104v-326h80v326l104-104 56 58-200 200ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z"/></svg><span id="update-dot" class="update-dot" hidden></span></button><button id="refresh" type="button" aria-label="Refresh"><svg viewBox="0 -960 960 960" aria-hidden="true"><path d="M480-180q-125 0-212.5-87.5T180-480q0-125 87.5-212.5T480-780q71 0 132.5 31.5T716-662v-118h60v226H550v-60h128q-34-48-85.5-77T480-720q-100 0-170 70t-70 170q0 100 70 170t170 70q77 0 139-44t87-116h64q-28 97-107 158.5T480-180Z"/></svg></button><button id="close" type="button" aria-label="Close"><svg viewBox="0 -960 960 960" aria-hidden="true"><path d="m256-213.85-42.15-42.15L437.85-480l-224-224L256-746.15l224 224 224-224L746.15-704l-224 224 224 224L704-213.85l-224-224-224 224Z"/></svg></button><div id="update-menu" class="menu-list update-menu" role="dialog" aria-label="Plugin update" popover="manual"><div class="upd-head"><strong id="upd-status"></strong></div><dl class="upd-meta"><div><dt id="upd-cur-lbl"></dt><dd id="upd-cur">—</dd></div><div><dt id="upd-lat-lbl"></dt><dd id="upd-lat">—</dd></div></dl><div id="upd-prog-wrap" class="upd-prog-wrap" hidden><div class="upd-prog-head"><span id="upd-prog-lbl"></span><span id="upd-prog-val"></span></div><div class="upd-prog-track"><i id="upd-prog-fill"></i></div></div><p id="upd-notes" class="upd-notes" hidden></p><div class="upd-foot"><span id="upd-feedback" role="status"></span><button id="upd-action" type="button"></button></div></div></div></header><div class="totals" id="totals"></div><section id="usage-waiting" class="usage-waiting" role="status" hidden></section><div id="usage-content" class="usage-content" hidden><section id="activity-section"><div class="section-head"><div><h2 id="activity-title"></h2><div class="muted" id="heat-sub"></div></div><div class="chart-controls"><div class="year-picker"><button id="year" type="button" class="year-trigger" aria-label="Year" aria-haspopup="listbox" aria-controls="year-menu" aria-expanded="false"><span id="year-label"></span><svg class="menu-chevron" viewBox="0 -960 960 960" aria-hidden="true"><path d="M480-357.85 253.85-584 296-626.15l184 184 184-184L706.15-584 480-357.85Z"/></svg></button><div id="year-menu" class="menu-list" role="listbox" aria-label="Year" popover="manual"></div></div></div></div><div class="heat-wrap"><div class="calendar"><div class="months" id="months"></div><div class="heat-row"><div class="weekdays" id="weekdays"></div><div class="heat" id="heat"></div></div></div></div><div class="heat-footer"><span id="heat-summary"></span><div class="scale"><span id="less"></span><i class="swatch"></i><i class="swatch" data-level="1"></i><i class="swatch" data-level="2"></i><i class="swatch" data-level="3"></i><i class="swatch" data-level="4"></i><span id="more"></span></div></div></section><section id="breakdown-section" class="breakdown-section"><div class="section-head"><div><div class="section-title"><h2 id="detail-title"></h2><span class="range-badge" id="range-display"></span></div><div class="chart-summary" id="chart-summary"></div></div><div class="chart-controls"><div class="seg" id="date-filter"><button type="button" data-range="7d"></button><button type="button" data-range="30d"></button><button type="button" id="month-preset" data-range="month" aria-haspopup="listbox" aria-controls="month-menu" aria-expanded="false"><span id="month-preset-label"></span><svg class="menu-chevron" viewBox="0 -960 960 960" aria-hidden="true"><path d="M480-357.85 253.85-584 296-626.15l184 184 184-184L706.15-584 480-357.85Z"/></svg></button><button type="button" id="year-preset" data-range="year"></button><button type="button" id="custom-preset" data-range="custom" aria-haspopup="dialog" aria-controls="custom-menu" aria-expanded="false"><span id="custom-preset-label"></span><svg class="menu-chevron" viewBox="0 -960 960 960" aria-hidden="true"><path d="M480-357.85 253.85-584 296-626.15l184 184 184-184L706.15-584 480-357.85Z"/></svg></button></div><div id="month-menu" class="menu-list month-menu" role="listbox" aria-label="Month" popover="manual"></div><div id="custom-menu" class="menu-list custom-menu" role="dialog" aria-label="Custom date range" popover="manual"><div class="custom-fields"><label class="custom-field"><span id="custom-from-label"></span><input id="custom-from" type="date" /></label><label class="custom-field"><span id="custom-to-label"></span><input id="custom-to" type="date" /></label><div class="custom-actions"><button id="custom-cancel" type="button"></button><button id="custom-apply" type="button" class="primary"></button></div></div></div></div></div><div class="legend" id="legend"></div><div class="chart-wrap"><div class="chart"><div class="axis" id="axis"></div><div class="plot" id="plot"></div></div></div><div class="table-wrap"><table class="table"><thead><tr id="table-head"></tr></thead><tbody id="table-body"></tbody><tfoot id="table-foot"></tfoot></table></div></section></div><div class="alert" id="alert" hidden></div><footer class="footer"><span id="coverage"></span><span id="timezone"></span></footer><div class="tip" id="tip" role="status" hidden></div>`);view.append(page);
  const intro=document.createElement('section');intro.id='usage-intro';intro.className='usage-intro';intro.hidden=true;
  setMarkup(intro,'<span class="intro-mark" aria-hidden="true"><svg viewBox="0 -960 960 960"><path d="M480-280q17 0 28.5-11.5T520-320v-160q0-17-11.5-28.5T480-520q-17 0-28.5 11.5T440-480v160q0 17 11.5 28.5T480-280Zm0-320q17 0 28.5-11.5T520-640q0-17-11.5-28.5T480-680q-17 0-28.5 11.5T440-640q0 17 11.5 28.5T480-600Zm0 520q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Z"/></svg></span><div class="intro-copy"><p id="usage-intro-text"></p></div><span id="usage-intro-error" class="intro-error" role="status"></span><button id="usage-intro-done" type="button"></button>');
  page.querySelector('.top').after(intro);
  const $=id=>view.getElementById(id),text=(id,value)=>{if($(id).textContent!==value)$(id).textContent=value;};
  let value=null,rangeMode='30d',year=null,anchorMonth=null,customFrom=null,customTo=null,selectedDate=null,disabledModels=new Set(),lastKey='',busy=false,opener=null;
  let disposed=false,refreshMotion=null,refreshDelay=null,finishRefresh=null,accountKey=null,tipTarget=null,tipModel=null;
  let updateState={state:'idle'},updateBusy=false,updateTimer=null;
  const zh=()=>language.language==='zh-CN'||language.language==='zh-TW',tw=()=>language.language==='zh-TW',w=(cn,en,twText)=>(tw()&&twText!==undefined)?twText:(zh()?cn:en);
  const EFFORT_PAREN_RE=/\s*\((?:x?high|medium|med|low|minimal|none|thinking|adaptive|reasoning|fast|default)\)\s*$/i;
  const EFFORT_SLUG_RE=/(?:-(?:n|a|b|trial|x?high|medium|med|low|minimal|none|thinking|adaptive|reasoning|fast|tiered|control|exp(?:-[a-z0-9]+)?|\d{8}))+$/i;
  const METRIC_KEYS=['total','requests','uncached','cacheRead','cacheWrite','output'];
  function normalizeModel(raw){
    let name=String(raw||'').trim().replace(EFFORT_PAREN_RE,'').trim();
    if(!name)return '';
    if(/^[a-z0-9._-]+$/i.test(name)&&!/\s/.test(name)){
      name=name.replace(EFFORT_SLUG_RE,'');
      let m;
      if((m=name.match(/^gemini-(\d+(?:\.\d+)?)-(pro|flash)$/i)))return `Gemini ${m[1]} ${m[2][0].toUpperCase()}${m[2].slice(1).toLowerCase()}`;
      if((m=name.match(/^gemini-4-(argon|hydrogen|carbon)$/i)))return `Gemini 4 ${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()}`;
      if((m=name.match(/^claude-(sonnet|opus|haiku)-(\d+)[._-](\d+)$/i)))return `Claude ${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()} ${m[2]}.${m[3]}`;
      if((m=name.match(/^gpt-oss-(\d+[a-z]?)$/i)))return `GPT-OSS ${m[1].toUpperCase()}`;
      if(name.includes('-')&&/[a-z]/.test(name)){
        return name.replace(/^gemini-/i,'Gemini ').replace(/^claude-/i,'Claude ').replace(/^gpt-oss-/i,'GPT-OSS ').replace(/^gpt-/i,'GPT ').replace(/-/g,' ').replace(/\b([a-z])([a-z0-9]*)/gi,(_,a,b)=>a.toUpperCase()+b);
      }
    }
    return name.replace(/\s+/g,' ');
  }
  function normalizeUsage(raw){
    if(!raw)return null;
    const modelTotals=new Map(),days=[];
    for(const day of raw.days||[]){
      const merged={};
      for(const [rawModel,stats]of Object.entries(day.models||{})){
        const canonical=normalizeModel(rawModel)||rawModel;
        const target=(merged[canonical]||={total:0,requests:0,uncached:0,cacheRead:0,cacheWrite:0,output:0});
        for(const k of METRIC_KEYS)target[k]+=Number(stats?.[k]||0);
        modelTotals.set(canonical,(modelTotals.get(canonical)||0)+Number(stats?.total||0));
      }
      days.push({...day,models:merged});
    }
    for(const m of raw.models||[]){const canonical=normalizeModel(m)||m;if(!modelTotals.has(canonical))modelTotals.set(canonical,0);}
    const models=[...modelTotals.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).map(([m])=>m);
    return {...raw,days,models};
  }
  let guideSaving=false,guideError=false,guideSignature=null;
  const replayGuide=window.__agPulseUsageGuidePreview===true;
  function renderGuide(){
    const signature=language.language+'|'+themeSignature();
    if(replayGuide&&signature!==guideSignature){guideDismissed=false;guideError=false;}
    guideSignature=signature;intro.hidden=guideDismissed;
    intro.setAttribute('aria-label',w('统计说明','Usage note','統計說明'));
    text('usage-intro-text',w('仅统计本机已记录的 Token（北京时间），不含已删记录或云端账单。','Locally recorded tokens (UTC+8); excludes deleted chats and cloud billing.','僅統計本機已記錄的 Token（UTC+8），不含已刪記錄或雲端帳單。'));
    text('usage-intro-done',guideSaving?w('保存中…','Saving…','儲存中…'):w('知道了','Got it','我知道了'));
    text('usage-intro-error',guideError?w('未能保存，请重试','Save failed, retry','未能儲存，請重試'):'');
    $('usage-intro-done').disabled=guideSaving;$('usage-intro-done').setAttribute('aria-busy',String(guideSaving));
  }
  function dismissGuide(){
    if(disposed)return;const focused=view.activeElement===$('usage-intro-done');guideDismissed=true;renderGuide();
    if(focused&&dialog.open)$('locale').focus({preventScroll:true});
  }
  $('usage-intro-done').addEventListener('click',async()=>{
    if(guideSaving||disposed)return;guideSaving=true;guideError=false;renderGuide();
    try{await onDismissGuide();dismissGuide();}catch{if(!disposed)guideError=true;}
    finally{guideSaving=false;if(!disposed)renderGuide();}
  });
  const full=n=>Number(n||0).toLocaleString(language.language==='en'?'en-US':language.language);
  const compact=n=>{n=Number(n||0);const limits=[[1e9,'B'],[1e6,'M'],[1e3,'K']];for(const [base,suffix]of limits)if(n>=base)return (n/base).toFixed(1).replace(/\.0$/,'')+suffix;return full(n);};
  const add=(date,days)=>{const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);};
  const week=date=>{const d=new Date(date+'T00:00:00Z');return add(date,-((d.getUTCDay()+6)%7));};
  const month=(date,shift)=>{const d=new Date(date.slice(0,7)+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+shift);return d.toISOString().slice(0,10);};
  const modelName=model=>normalizeModel(model)||model;
  const themeSignature=()=>{const s=getComputedStyle(root.host||dialog);return [s.getPropertyValue('--pulse-accent'),s.getPropertyValue('--pulse-background'),root.host?.dataset.pulseTheme].join('|');};
  let paletteKey='',modelColors=new Map();
  const colorCanvas=document.createElement('canvas');colorCanvas.width=colorCanvas.height=1;
  const colorContext=colorCanvas.getContext('2d',{willReadFrequently:true});
  const rgb=css=>{colorContext.clearRect(0,0,1,1);colorContext.fillStyle='#000';colorContext.fillStyle=css;colorContext.fillRect(0,0,1,1);return [...colorContext.getImageData(0,0,1,1).data].slice(0,3);};
  const luminance=a=>a.reduce((sum,v,i)=>{v/=255;return sum+(v<=.04045?v/12.92:((v+.055)/1.055)**2.4)*[.2126,.7152,.0722][i];},0);
  const contrast=(a,b)=>(Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
  const hsl=a=>{const [r,g,b]=a.map(v=>v/255),hi=Math.max(r,g,b),lo=Math.min(r,g,b),d=hi-lo,l=(hi+lo)/2;return [d?((hi===r?(g-b)/d+(g<b?6:0):hi===g?(b-r)/d+2:(r-g)/d+4)*60):0,d?d/(1-Math.abs(2*l-1)):0,l];};
  const fromHsl=(h,s,l)=>{const a=s*Math.min(l,1-l),f=n=>{const k=(n+h/30)%12;return Math.round(255*(l-a*Math.max(-1,Math.min(k-3,9-k,1))));};return [f(0),f(8),f(4)];};
  function syncPalette(){
    const models=value?.models||[],key=themeSignature()+'|'+models.join('|');if(key===paletteKey)return;paletteKey=key;modelColors.clear();
    const style=getComputedStyle(root.host||dialog),base=rgb(style.getPropertyValue('--pulse-accent').trim()||'#85a8ff'),background=rgb(style.getPropertyValue('--pulse-background').trim()||'#1c1d1f'),[h,s]=hsl(base);
    // An analogous scale stays harmonious as the host accent changes. Tonal
    // variation distinguishes adjacent series without provider brand colors.
    const dark=luminance(background)<.35,offsets=[0,-18,18,-36,36,-9,9,-27,27],tones=dark?[.64,.52,.73,.59,.68]:[.43,.33,.51,.38,.47];
    const end=contrast([255,255,255],background)>contrast([0,0,0],background)?1:0;
    models.forEach((model,i)=>{const hue=(h+offsets[i%offsets.length]+360)%360,saturation=s<.08?.07:Math.max(.28,Math.min(.55,s*.72));let lightness=tones[i%tones.length],c=fromHsl(hue,saturation,lightness);
      // Chart marks (including small legend dots) need contrast on the actual
      // custom background, rather than relying solely on dark/light labels.
      for(let step=0;contrast(c,background)<3&&step<100;step++){lightness+=end? .005:-.005;lightness=Math.max(0,Math.min(1,lightness));c=fromHsl(hue,saturation,lightness);}
      modelColors.set(model,'rgb('+c.join(' ')+')');
    });
  }
  const color=model=>modelColors.get(model)||'var(--pulse-accent)';
  const hitText=r=>{
    const input=(r?.uncached||0)+(r?.cacheRead||0)+(r?.cacheWrite||0);
    if(!input)return '—';
    const rate=(r.cacheRead||0)/input;
    return (rate*100).toFixed(rate>=.995||rate===0?0:1).replace(/\.0$/,'')+'%';
  };
  const totals=(from,to,filter=false)=>{
    const models={};let total=0,requests=0,uncached=0,cacheRead=0,cacheWrite=0,output=0;
    for(const day of value?.days||[])if(day.date>=from&&day.date<=to)for(const [model,r]of Object.entries(day.models)){
      if(filter&&disabledModels.has(model))continue;
      models[model]||={total:0,requests:0,uncached:0,cacheRead:0,cacheWrite:0,output:0};for(const key of Object.keys(models[model]))models[model][key]+=r[key]||0;
    }
    for(const r of Object.values(models)){
      total+=r.total;requests+=r.requests;uncached+=r.uncached;cacheRead+=r.cacheRead;cacheWrite+=r.cacheWrite;output+=r.output;
    }
    const input=uncached+cacheRead+cacheWrite;
    return {from,to,models,total,requests,uncached,cacheRead,cacheWrite,output,hitRate:input>0?cacheRead/input:null};
  };
  const node=(tag,className,content)=>{const n=document.createElement(tag);if(className)n.className=className;if(content!==undefined)n.textContent=content;return n;};
  function tooltip(bucket,target,activeSeries=null){
    if(!$('tip').hidden&&tipTarget===target&&tipModel===activeSeries)return;tipTarget=target;tipModel=activeSeries;
    highlightModel(activeSeries);
    const tip=$('tip');
    tip.replaceChildren(
      node('div','tip-title',bucket.from===bucket.to?bucket.from:bucket.from+' – '+bucket.to),
      node('strong','',full(bucket.total)+' Token'),
      node('div','muted',w(`${bucket.requests} 次请求 · 命中 ${hitText(bucket)}`,`${bucket.requests} requests · ${hitText(bucket)} hit`,`${bucket.requests} 次請求 · 命中 ${hitText(bucket)}`))
    );
    for(const [model,r]of Object.entries(bucket.models).sort((a,b)=>b[1].total-a[1].total)){
      const row=node('div','tip-model'+(activeSeries?(activeSeries===model?' active':' dimmed'):'')),label=node('span',''),dot=node('i','dot'),amount=node('span','',compact(r.total));dot.style.setProperty('--model-color',color(model));label.append(dot,document.createTextNode(modelName(model)));amount.append(node('span','model-share',bucket.total?(r.total/bucket.total*100).toFixed(1)+'%':'0%'));row.append(label,amount);tip.append(row);
    }
    tip.hidden=false;const rect=target.getBoundingClientRect(),bounds=dialog.getBoundingClientRect(),r=tip.getBoundingClientRect();
    tip.style.left=Math.min(bounds.right-r.width-12,Math.max(bounds.left+12,rect.left+rect.width/2-r.width/2))+'px';
    tip.style.top=Math.max(bounds.top+12,rect.top-r.height-10)+'px';
  }
  const bindBucket=(button,bucket,source='chart',chartKind='day')=>{
    button.setAttribute('aria-label',(bucket.from===bucket.to?bucket.from:bucket.from+' – '+bucket.to)+': '+full(bucket.total)+' Token');
    button.addEventListener('pointerenter',()=>tooltip(bucket,button,null));button.addEventListener('pointerleave',()=>{$('tip').hidden=true;highlightModel(null);});button.addEventListener('focus',()=>tooltip(bucket,button,null));button.addEventListener('blur',()=>{$('tip').hidden=true;highlightModel(null);});
    button.addEventListener('pointermove',event=>{const series=event.target.closest?.('.bar-segment')?.dataset.model||null;tooltip(bucket,button,series);});
    button.addEventListener('click',()=>{
      if(source==='heat'){
        selectedDate=bucket.from;anchorMonth=bucket.from.slice(0,7);year=bucket.from.slice(0,4);rangeMode='month';
        syncYear();renderHeat();renderChart();
        $('breakdown-section')?.scrollIntoView?.({behavior:'smooth',block:'nearest'});
        return;
      }
      if(chartKind==='month'){
        anchorMonth=bucket.from.slice(0,7);year=anchorMonth.slice(0,4);selectedDate=null;rangeMode='month';
        syncYear();renderHeat();renderChart();
        return;
      }
      if(chartKind==='day'){
        selectedDate=selectedDate===bucket.from?null:bucket.from;
        for(const b of $('heat').children)if(b.dataset.from)b.setAttribute('data-selected',String(selectedDate?b.dataset.from===selectedDate:b.dataset.from===value.today));
        for(const b of $('plot').querySelectorAll('.bar-column'))b.setAttribute('data-active',String(Boolean(selectedDate&&b.dataset.from===selectedDate)));
        return;
      }
      for(const b of $('plot').querySelectorAll('.bar-column'))b.setAttribute('data-active',String(b.dataset.from===bucket.from&&b.dataset.to===bucket.to));
    });
  };
  function renderHeat(){
    if(!value)return;
    const start=week(year+'-01-01'),end=year+'-12-31',weeks=Math.floor((Date.parse(end)-Date.parse(start))/604800000)+1;
    $('heat').replaceChildren();$('months').replaceChildren();$('weekdays').replaceChildren();
    $('heat').style.gridTemplateColumns=`repeat(${weeks},minmax(0,1fr))`;
    const buckets=[];for(let i=0;i<weeks*7;i++){const date=add(start,i);buckets.push(totals(date,date));}
    const max=Math.max(1,...buckets.map(b=>b.total)),activeDate=selectedDate||value.today;
    for(const bucket of buckets){
      const button=node('button','');button.type='button';const future=bucket.from>value.today||bucket.from<year+'-01-01'||bucket.from>year+'-12-31';
      button.dataset.level=bucket.total===0?'0':String(Math.min(4,Math.ceil(bucket.total/max*4)));
      if(!future){
        button.dataset.from=bucket.from;button.dataset.to=bucket.to;
        if(bucket.from===activeDate)button.dataset.selected='true';
        bindBucket(button,bucket,'heat','day');
      }else{button.className='future';button.disabled=true;}
      button.tabIndex=-1;$('heat').append(button);
    }
    const usable=[...$('heat').children].filter(b=>!b.disabled),lastActive=[...$('heat').children].reverse().find(b=>!b.disabled&&b.dataset.level!=='0');
    if(usable.length)(lastActive||usable.at(-1)).tabIndex=0;
    $('months').style.gridTemplateColumns=`repeat(${weeks},minmax(0,1fr))`;
    const todayYm=value.today.slice(0,7);
    for(let m=1;m<=12;m++){
      const ym=`${year}-${String(m).padStart(2,'0')}`,date=ym+'-01',col=Math.floor((Date.parse(date)-Date.parse(start))/604800000)+1;
      const btn=node('button','heat-month',zh()?m+'月':['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m-1]);
      btn.type='button';btn.dataset.ym=ym;btn.style.gridColumn=col;btn.style.gridRow=1;
      if(ym>todayYm)btn.disabled=true;
      if(rangeMode==='month'&&anchorMonth===ym)btn.dataset.active='true';
      btn.addEventListener('click',()=>{anchorMonth=ym;selectedDate=null;rangeMode='month';renderHeat();renderChart();$('breakdown-section')?.scrollIntoView?.({behavior:'smooth',block:'nearest'});});
      $('months').append(btn);
    }
    for(let i=0;i<7;i++)$('weekdays').append(node('span','',i%2===0?(zh()?['一','','三','','五','','日'][i]:['M','','W','','F','','S'][i]):''));
    text('heat-sub',w('年度贡献 · 点击月份或日期联动筛选下方明细','Annual activity · click month or day to filter below','年度貢獻 · 點擊月份或日期聯動篩選下方明細'));
    let activeDays=0,peakDay=0;
    for(const day of value.days||[])if(day.date>=year+'-01-01'&&day.date<=year+'-12-31'){
      let dayTotal=0;for(const r of Object.values(day.models))dayTotal+=r.total||0;
      if(dayTotal>0){activeDays++;if(dayTotal>peakDay)peakDay=dayTotal;}
    }
    const annual=totals(year+'-01-01',year+'-12-31');
    text('heat-summary',`${year} · ${full(annual.total)} tok${activeDays?` · ${w(`活跃 ${activeDays} 天 · 峰值 ${compact(peakDay)}`,`${activeDays} active days · peak ${compact(peakDay)}`,`活躍 ${activeDays} 天 · 峰值 ${compact(peakDay)}`)}`:''} · ${w('命中','Hit','命中')} ${hitText(annual)}`);
  }
  function highlightModel(model){
    if(model)$('plot').dataset.highlight=model;else delete $('plot').dataset.highlight;
    for(const bar of $('plot').querySelectorAll('.bar-segment')){if(model&&bar.dataset.model===model)bar.dataset.highlight='true';else delete bar.dataset.highlight;}
  }
  const latestMonthInYear=y=>{
    const active=(value?.days||[]).map(d=>d.date.slice(0,7)).filter(ym=>ym.startsWith(y+'-')&&ym<=value.today.slice(0,7)).sort();
    if(active.length)return active.at(-1);
    return y===value.today.slice(0,4)?value.today.slice(0,7):y+'-12';
  };
  function computeBuckets(){
    const buckets=[],rollingDayLabel=(date,i)=>{
      const d=Number(date.slice(8)),m=Number(date.slice(5,7));
      return i===0||date.endsWith('-01')?`${m}/${d}`:String(d);
    };
    if(rangeMode==='7d'){
      for(let i=-6;i<=0;i++){const d=add(value.today,i);buckets.push({bucket:totals(d,d,true),label:d.slice(5),monthStart:false});}
      return {buckets,kind:'day',display:buckets[0].bucket.from+' ~ '+buckets.at(-1).bucket.to};
    }
    if(rangeMode==='30d'){
      for(let i=-29;i<=0;i++){const d=add(value.today,i);buckets.push({bucket:totals(d,d,true),label:rollingDayLabel(d,i+29),monthStart:i===-29||d.endsWith('-01')});}
      return {buckets,kind:'day',display:buckets[0].bucket.from+' ~ '+buckets.at(-1).bucket.to};
    }
    if(rangeMode==='month'){
      const start=anchorMonth+'-01',end=add(month(start,1),-1);
      for(let d=start,i=0;d<=end;d=add(d,1),i++)buckets.push({bucket:totals(d,d,true),label:String(i+1),monthStart:false});
      return {buckets,kind:'day',display:start+' ~ '+end};
    }
    if(rangeMode==='year'){
      for(let m=1;m<=12;m++){
        const ym=`${year}-${String(m).padStart(2,'0')}`,from=ym+'-01',to=add(month(from,1),-1);
        buckets.push({bucket:totals(from,to,true),label:zh()?m+'月':['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m-1],monthStart:false});
      }
      return {buckets,kind:'month',display:`${year}-01-01 ~ ${year}-12-31`};
    }
    let from=customFrom||add(value.today,-29),to=customTo||value.today;
    if(from>to)[from,to]=[to,from];
    if(to>value.today)to=value.today;
    if(from>to)from=to;
    const spanDays=Math.round((Date.parse(to)-Date.parse(from))/86400000)+1;
    if(spanDays<=45){
      for(let d=from,i=0;d<=to;d=add(d,1),i++)buckets.push({bucket:totals(d,d,true),label:spanDays<=14?d.slice(5):rollingDayLabel(d,i),monthStart:spanDays>14&&(i===0||d.endsWith('-01'))});
      return {buckets,kind:'day',display:from+' ~ '+to};
    }
    if(spanDays<=180){
      for(let cur=week(from);cur<=to;cur=add(cur,7)){
        const bFrom=cur<from?from:cur,bTo=add(cur,6)>to?to:add(cur,6);
        buckets.push({bucket:totals(bFrom,bTo,true),label:bFrom.slice(5),monthStart:false});
      }
      return {buckets,kind:'week',display:from+' ~ '+to};
    }
    for(let cur=from.slice(0,7)+'-01';cur.slice(0,7)<=to.slice(0,7);cur=month(cur,1)){
      const mEnd=add(month(cur,1),-1),bFrom=cur<from?from:cur,bTo=mEnd>to?to:mEnd;
      buckets.push({bucket:totals(bFrom,bTo,true),label:cur.slice(0,7),monthStart:false});
    }
    return {buckets,kind:'month',display:from+' ~ '+to};
  }
  function renderChart(){
    if(!value)return;syncPalette();$('tip').hidden=true;highlightModel(null);
    const {buckets,kind,display}=computeBuckets();
    const firstFrom=buckets[0].bucket.from,lastTo=buckets.at(-1).bucket.to;
    const rangeTotals=totals(firstFrom,lastTo,true),unfilteredRange=totals(firstFrom,lastTo,false);
    text('detail-title',w('模型明细','Model breakdown','模型明細'));
    text('range-display',display);
    text('month-preset-label',anchorMonth);
    text('year-preset',w(`${year}年`,String(year),`${year}年`));
    text('custom-preset-label',w('自定义','Custom','自訂'));
    for(const option of $('month-menu').children)option.setAttribute('aria-selected',String(option.dataset.month===anchorMonth));
    for(const b of $('date-filter').querySelectorAll('[data-range]'))b.setAttribute('aria-pressed',String(b.dataset.range===rangeMode));
    $('legend').replaceChildren();
    const activeModels=value.models.filter(m=>unfilteredRange.models[m]?.total>0||disabledModels.has(m));
    for(const model of activeModels){
      const button=node('button',''),dot=node('i','dot');dot.style.setProperty('--model-color',color(model));button.append(dot,document.createTextNode(modelName(model)));button.type='button';button.setAttribute('aria-pressed',String(!disabledModels.has(model)));
      button.addEventListener('click',()=>{if(disabledModels.has(model))disabledModels.delete(model);else disabledModels.add(model);renderChart();});
      button.addEventListener('pointerenter',()=>highlightModel(disabledModels.has(model)?null:model));button.addEventListener('pointerleave',()=>highlightModel(null));$('legend').append(button);
    }
    const max=Math.max(1,...buckets.map(item=>item.bucket.total)),ceiling=max>1?Math.ceil(max/(10**Math.floor(Math.log10(max))))*10**Math.floor(Math.log10(max)):1;
    $('axis').replaceChildren();$('plot').replaceChildren();$('plot').dataset.mode=rangeMode;
    for(let i=0;i<=4;i++){const label=node('span','',compact(ceiling*i/4));label.style.bottom=(19+(236-19)*i/4)+'px';$('axis').append(label);const line=node('i','grid-line');line.style.bottom=(19+(236-19)*i/4)+'px';$('plot').append(line);}
    for(const {bucket,label,monthStart}of buckets){
      const button=node('button','bar-column');button.type='button';button.dataset.from=bucket.from;button.dataset.to=bucket.to;
      if(bucket.from<=value.today&&bucket.to>=value.today)button.dataset.today='true';
      if(selectedDate&&kind==='day'&&bucket.from===selectedDate)button.dataset.active='true';
      if(monthStart)button.dataset.monthStart='true';
      const stack=node('div','stack');
      const segments=value.models.filter(model=>bucket.models[model]?.total>0);
      for(const [j,model]of segments.entries()){const r=bucket.models[model],bar=node('i','bar-segment'),height=r.total/ceiling*217;bar.dataset.model=model;bar.setAttribute('aria-hidden','true');bar.style.setProperty('--model-color',color(model));bar.style.height=height+'px';if(j&&height>=3)bar.style.boxShadow='inset 0 -1px 0 color-mix(in srgb,var(--pulse-background) 48%,transparent)';stack.append(bar);}
      if(!bucket.total)stack.append(node('i','empty-bar'));button.append(stack);
      button.append(node('span','x-label',label));
      bindBucket(button,bucket,'chart',kind);$('plot').append(button);
    }
    if(!buckets.some(item=>item.bucket.total>0))$('plot').append(node('div','chart-empty',w('所选时段暂无用量记录','No usage recorded in this period','所選時段尚無用量記錄')));
    $('table-head').replaceChildren(...[w('模型','Model','模型'),w('占比','Share','佔比'),w('总计','Total','總計'),w('未缓存','Uncached','未快取'),w('缓存读','Cache read','快取讀'),w('缓存写','Cache write','快取寫'),w('输出','Output','輸出'),w('请求','Req','請求'),w('命中率','Hit','命中率')].map(label=>node('th','',label)));
    $('table-body').replaceChildren();$('table-foot').replaceChildren();
    $('chart-summary').replaceChildren(node('strong','',compact(rangeTotals.total)+' tok'),document.createTextNode(' · '+w(`${full(rangeTotals.requests)} 次请求 · 命中 ${hitText(rangeTotals)}`,`${full(rangeTotals.requests)} requests · ${hitText(rangeTotals)} hit`,`${full(rangeTotals.requests)} 次請求 · 命中 ${hitText(rangeTotals)}`)));
    const sortedRows=Object.entries(rangeTotals.models).sort((a,b)=>b[1].total-a[1].total);
    for(const [model,r]of sortedRows){
      const row=node('tr',''),label=node('td',''),dot=node('span','dot');dot.style.setProperty('--model-color',color(model));label.append(dot,document.createTextNode(modelName(model)));
      const share=rangeTotals.total>0?(r.total/rangeTotals.total*100):0;
      const shareTd=node('td',''),shareWrap=node('span','share-cell'),bar=node('span','share-bar'),barFill=node('i','');
      bar.style.setProperty('--model-color',color(model));barFill.style.width=Math.max(2,share).toFixed(1)+'%';bar.append(barFill);
      shareWrap.append(bar,document.createTextNode(share.toFixed(share>=10?0:1).replace(/\.0$/,'')+'%'));shareTd.append(shareWrap);
      row.append(label,shareTd,...[r.total,r.uncached,r.cacheRead,r.cacheWrite,r.output,r.requests].map(n=>node('td','',full(n))),node('td','',hitText(r)));$('table-body').append(row);
    }
    if(sortedRows.length>1){
      const foot=node('tr','');foot.append(node('td','',w('合计','Total','合計')),node('td','','100%'),...[rangeTotals.total,rangeTotals.uncached,rangeTotals.cacheRead,rangeTotals.cacheWrite,rangeTotals.output,rangeTotals.requests].map(n=>node('td','',full(n))),node('td','',hitText(rangeTotals)));
      $('table-foot').append(foot);
    }
  }
  function render(){
    renderGuide();
    renderUpdate();
    if(!value){
      closeMenus();$('tip').hidden=true;$('usage-content').hidden=true;$('usage-waiting').hidden=false;
      text('usage-waiting',w('正在连接统计…','Connecting…','正在連線統計資料…'));text('subtitle',w('连接本机统计','Connecting local data','連線本機統計'));text('coverage','');text('timezone','');$('alert').hidden=true;
      for(const metric of $('totals').children){metric.title='';metric.querySelector('.value')?.replaceChildren(node('span','','—'));}
      return;
    }
    $('usage-waiting').hidden=true;$('usage-content').hidden=false;
    syncPalette();
    text('title',w('用量统计','Token usage','用量統計'));dialog.setAttribute('aria-label',w('用量统计','Token usage','用量統計'));text('subtitle',w(`本机 ${hostLabel}`,`Local ${hostLabel}`,`本機 ${hostLabel}`));
    text('activity-title',w('活跃度','Activity','活躍度'));
    languagePicker.update();for(const [id,label]of [['locale',language.t('language')],['refresh',w('刷新','Refresh','重新整理')],['close',w('关闭','Close','關閉')]]){$(id).setAttribute('aria-label',label);$(id).title=label;}text('less',w('少','Less','少'));text('more',w('多','More','多'));
    for(const b of $('date-filter').querySelectorAll('[data-range]')){
      if(b.dataset.range==='7d')b.textContent=w('近7天','7D','近7天');
      else if(b.dataset.range==='30d')b.textContent=w('近30天','30D','近30天');
    }
    text('custom-from-label',w('开始日期','Start date','開始日期'));text('custom-to-label',w('结束日期','End date','結束日期'));
    text('custom-cancel',w('取消','Cancel','取消'));text('custom-apply',w('应用','Apply','套用'));
    $('custom-from').min=value.firstDate||'';$('custom-from').max=value.today;$('custom-to').min=value.firstDate||'';$('custom-to').max=value.today;
    const tToday=totals(value.today,value.today),tWeek=totals(week(value.today),value.today),tMonth=totals(value.today.slice(0,7)+'-01',value.today),tAll=totals(value.firstDate||'0000-01-01',value.today);
    $('totals').replaceChildren();for(const [label,total,stats,reqOverride]of [[w('今日','Today','今日'),value.todayTokens,tToday,null],[w('本周','This week','本週'),value.weekTokens,tWeek,null],[w('本月','This month','本月'),value.monthTokens,tMonth,null],[w('累计','All time','累積'),value.totalTokens,tAll,value.requests]]){
      const req=reqOverride??stats.requests;
      const metric=node('div','metric'),n=node('div','value',compact(total));n.append(node('span','unit','tok'));
      const sub=node('div','metric-sub',w(`${full(req)} 次请求`,`${full(req)} requests`,`${full(req)} 次請求`)+(stats.hitRate!==null?` · ${w('命中','Hit','命中')} ${hitText(stats)}`:''));
      metric.append(node('label','',label),n,sub);metric.title=full(total)+' Token';$('totals').append(metric);
    }
    const years=[];const first=Number(value.firstDate?.slice(0,4)||value.today.slice(0,4)),currentYear=Number(value.today.slice(0,4)),minimum=Math.max(first,currentYear-10);for(let y=currentYear;y>=minimum;y--)years.push(y);
    if($('year').dataset.years!==years.join(',')){
      $('year-menu').replaceChildren(...years.map(y=>{const option=node('button','menu-option');option.type='button';option.dataset.year=String(y);option.setAttribute('role','option');option.tabIndex=-1;
        setMarkup(option,'<span></span><svg class="menu-check" viewBox="0 -960 960 960" aria-hidden="true"><path d="M382-267.69 183.23-466.46 225.38-508.62 382-352l336-336 42.15 42.15L382-267.69Z"/></svg>');option.firstElementChild.textContent=String(y);
        option.addEventListener('click',()=>{
          year=String(y);selectedDate=null;
          if(rangeMode==='month')anchorMonth=latestMonthInYear(year);
          else if(year!==value.today.slice(0,4)&&(rangeMode==='7d'||rangeMode==='30d'))rangeMode='year';
          syncYear();closeYear();renderHeat();renderChart();
        });return option;}));$('year').dataset.years=years.join(',');
    }
    const monthTotals=new Map(),startMonth=(value.firstDate||value.today).slice(0,7),endMonth=value.today.slice(0,7);
    for(const day of value.days||[]){const ym=day.date.slice(0,7);let t=0;for(const r of Object.values(day.models))t+=r.total||0;monthTotals.set(ym,(monthTotals.get(ym)||0)+t);}
    const months=[];let cursor=endMonth+'-01';
    for(let i=0;i<36&&cursor.slice(0,7)>=startMonth;i++){months.push(cursor.slice(0,7));cursor=month(cursor,-1);}
    if(!months.length)months.push(endMonth);
    const monthSig=months.map(m=>m+':'+(monthTotals.get(m)||0)).join(',');
    if($('month-preset').dataset.months!==monthSig){
      $('month-menu').replaceChildren(...months.map(ym=>{
        const option=node('button','menu-option');option.type='button';option.dataset.month=ym;option.setAttribute('role','option');option.tabIndex=-1;
        const tot=monthTotals.get(ym)||0;
        setMarkup(option,'<span></span><span class="menu-meta"><span class="menu-val"></span><svg class="menu-check" viewBox="0 -960 960 960" aria-hidden="true"><path d="M382-267.69 183.23-466.46 225.38-508.62 382-352l336-336 42.15 42.15L382-267.69Z"/></svg></span>');
        option.firstElementChild.textContent=ym;option.querySelector('.menu-val').textContent=tot?compact(tot):'0';
        option.addEventListener('click',()=>{anchorMonth=ym;year=ym.slice(0,4);selectedDate=null;rangeMode='month';syncYear();closeMonth();renderHeat();renderChart();});
        return option;
      }));
      $('month-preset').dataset.months=monthSig;
    }
    syncYear();
    text('coverage',w(`${full(value.requests)} 次请求${value.firstDate?' · 始于 '+value.firstDate:''}`,`${full(value.requests)} requests${value.firstDate?' · since '+value.firstDate:''}`,`${full(value.requests)} 次請求${value.firstDate?' · 始於 '+value.firstDate:''}`));
    text('timezone',value.timeZone+' · '+(value.syncing||value.retryingConversations>0?w('同步历史中…','Syncing…','同步中…'):w('本机存储','Local only','本機儲存')));
    const alerts=[];if(value.unknownRequests)alerts.push(w(`${value.unknownRequests} 次请求日期未知，共 ${compact(value.unknownTokens)} Token`,`${value.unknownRequests} undated requests · ${compact(value.unknownTokens)} tokens`,`${value.unknownRequests} 次請求日期未知，共 ${compact(value.unknownTokens)} Token`));
    const confirmedMissing=value.confirmedMissingConversations??(value.syncing?0:value.missingConversations);
    if(value.partialRequests||value.unreadableFiles||confirmedMissing>0&&!value.syncing||value.persistenceError)alerts.push(w('部分记录暂不可读取，用量可能不完整','Some records are unavailable; usage may be incomplete','部分記錄暫無法讀取，用量可能不完整'));
    $('alert').hidden=!alerts.length;text('alert',alerts.join(' · '));
    renderHeat();renderChart();
  }
  function syncYear(){
    text('year-label',String(year));$('year').setAttribute('aria-label',w('选择年份','Select year','選取年份')+' · '+year);$('year-menu').setAttribute('aria-label',w('年份','Year','年份'));
    for(const option of $('year-menu').children)option.setAttribute('aria-selected',String(option.dataset.year===String(year)));
  }
  const menus=[];
  function bindMenu(trigger,menu,{listbox=true,onBeforeOpen}={}){
    const close=(restore=true)=>{if(!menu.matches(':popover-open'))return;menu.hidePopover();trigger.setAttribute('aria-expanded','false');if(restore)trigger.focus({preventScroll:true});};
    const position=()=>{
      if(!menu.matches(':popover-open'))return;const r=trigger.getBoundingClientRect(),bounds=dialog.getBoundingClientRect(),width=menu.offsetWidth,height=menu.offsetHeight;
      menu.style.left=Math.max(bounds.left+12,Math.min(r.right-width,bounds.right-width-12))+'px';const below=r.bottom+7;
      menu.style.top=(below+height<=bounds.bottom-12?below:Math.max(bounds.top+12,r.top-height-7))+'px';
    };
    const open=()=>{
      onBeforeOpen?.();
      for(const other of menus)if(other.menu!==menu)other.close(false);
      $('tip').hidden=true;menu.showPopover();trigger.setAttribute('aria-expanded','true');position();
      if(listbox)([...menu.children].find(o=>o.getAttribute('aria-selected')==='true')||menu.firstElementChild)?.focus({preventScroll:true});
      else menu.querySelector('input,button')?.focus({preventScroll:true});
    };
    if(listbox){
      trigger.addEventListener('keydown',event=>{if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();open();if(event.key==='Home')menu.firstElementChild?.focus();if(event.key==='End')menu.lastElementChild?.focus();}});
      menu.addEventListener('keydown',event=>{
        const options=[...menu.children],current=options.indexOf(view.activeElement);let next=null;
        if(event.key==='ArrowDown')next=Math.min(options.length-1,current+1);else if(event.key==='ArrowUp')next=Math.max(0,current-1);else if(event.key==='Home')next=0;else if(event.key==='End')next=options.length-1;
        if(next!==null){event.preventDefault();options[next]?.focus({preventScroll:true});}else if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}else if(event.key==='Tab')close();
      });
    }else{
      menu.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}});
    }
    const onPointer=event=>{const path=event.composedPath();if(!path.includes(trigger)&&!path.includes(menu))close(false);};
    const onScroll=()=>close(false);
    view.addEventListener('pointerdown',onPointer);page.addEventListener('scroll',onScroll,{passive:true});window.addEventListener('resize',position);
    const handle={menu,listbox,open,close,position,isOpen:()=>menu.matches(':popover-open'),dispose(){close(false);view.removeEventListener('pointerdown',onPointer);page.removeEventListener('scroll',onScroll);window.removeEventListener('resize',position);}};
    menus.push(handle);return handle;
  }
  const yearMenu=bindMenu($('year'),$('year-menu'),{listbox:true});
  const monthMenu=bindMenu($('month-preset'),$('month-menu'),{listbox:true});
  const customMenu=bindMenu($('custom-preset'),$('custom-menu'),{listbox:false,onBeforeOpen:()=>{
    if(!value)return;$('custom-from').value=customFrom||add(value.today,-29);$('custom-to').value=customTo||value.today;
  }});
  const updateMenu=bindMenu($('update-btn'),$('update-menu'),{listbox:false});
  function formatBytes(n){return n>=1048576?`${(n/1048576).toFixed(1)} MB`:n>=1024?`${Math.round(n/1024)} KB`:`${n} B`;}
  function stopUpdatePoll(){clearInterval(updateTimer);updateTimer=null;}
  function renderUpdate(){
    const btn=$('update-btn'),dot=$('update-dot');
    if(!btn)return;
    const s=updateState||{state:'idle'},st=s.state||'idle',hasNew=st==='available'||st==='installed';
    if(dot)dot.hidden=!hasNew;
    btn.hidden=typeof onUpdate!=='function'&&!s.currentVersion&&st==='idle';
    const tipTitle=hasNew?w('发现新版本 · 点击查看更新','Update available · Click to update','發現新版本 · 點擊查看更新'):w('检查插件更新','Check for updates','檢查外掛更新');
    btn.setAttribute('aria-label',tipTitle);btn.title=tipTitle;
    $('update-menu').setAttribute('aria-label',w('插件更新','Plugin update','外掛更新'));
    const statusMap={
      idle:w('检查更新','Check for updates','檢查更新'),
      checking:w('正在检查更新…','Checking for updates…','正在檢查更新…'),
      current:w('已是最新版本','You’re up to date','已是最新版本'),
      available:w(`发现新版本 v${s.latestVersion||''}`,`Update available: v${s.latestVersion||''}`,`發現新版本 v${s.latestVersion||''}`),
      installing:w('正在下载并安装…','Downloading and installing…','正在下載並安裝…'),
      installed:w('更新已安装，需要重载','Update installed; reload required','更新已安裝，需要重新載入'),
      reloading:w('正在重新加载插件…','Reloading plugin…','正在重新載入外掛…'),
      error:w('更新检查或安装失败','Update incomplete','更新未完成'),
    };
    text('upd-status',statusMap[st]||statusMap.error);
    text('upd-cur-lbl',w('当前版本','Installed','目前版本'));
    text('upd-lat-lbl',w('最新版本','Latest','最新版本'));
    text('upd-cur',s.currentVersion?'v'+s.currentVersion:'—');
    text('upd-lat',s.latestVersion?'v'+s.latestVersion:'—');
    const prog=s.progress||{},inProg=['checking','installing','reloading'].includes(st);
    const progWrap=$('upd-prog-wrap');progWrap.hidden=!inProg;
    if(inProg){
      const phaseLabels={
        check:w('连接 GitHub…','Checking GitHub…','連線至 GitHub…'),
        verify:w('校验签名与安装包…','Verifying package…','驗證安裝套件…'),
        download:w('正在下载…','Downloading…','正在下載…'),
        extract:w('正在解压…','Extracting…','正在解壓縮…'),
        backup:w('备份当前版本…','Backing up…','備份目前版本…'),
        install:w('写入更新文件…','Installing…','寫入更新檔案…'),
        recover:w('正在恢复备份…','Restoring backup…','正在還原備份…'),
        complete:w('完成','Complete','完成'),
      };
      text('upd-prog-lbl',phaseLabels[prog.phase]||statusMap[st]);
      const known=prog.phase==='download'&&Number.isSafeInteger(prog.total)&&prog.total>0&&Number.isSafeInteger(prog.received)&&prog.received>=0;
      progWrap.dataset.indeterminate=known?'false':'true';
      text('upd-prog-val',known?`${Math.min(100,Math.round(prog.received/prog.total*100))}% · ${formatBytes(prog.received)}/${formatBytes(prog.total)}`:'');
      $('upd-prog-fill').style.setProperty('transform',known?`scaleX(${Math.max(0.02,Math.min(1,prog.received/prog.total))})`:'');
    }
    const notesText=(s.notes||'').split(/\r?\n/).map(l=>l.trim())
      .filter(l=>l&&!l.startsWith('#')&&!/^\*{0,2}Full Changelog\*{0,2}\s*:/i.test(l))
      .map(l=>l.replace(/^[-*]\s+/,'• ').replace(/\[([^\]]+)\]\([^)]+\)/g,'$1').replace(/\*\*([^*]+)\*\*/g,'$1').replace(/`([^`]+)`/g,'$1'))
      .slice(0,4).join('\n');
    $('upd-notes').hidden=st!=='available'||!notesText;text('upd-notes',notesText);
    const errMap={
      network:w('网络请求失败，请检查代理或网络','Connection failed. Check network/proxy.','網路連線失敗，請檢查代理或網路'),
      python:w('未找到可用的 Python 3.10+','Python 3.10+ is required.','需要 Python 3.10+'),
      verification:w('安装包校验未通过','Package verification failed.','安裝套件驗證未通過'),
      location:w('插件安装目录校验未通过','Plugin location mismatch.','外掛安裝目錄驗證未通過'),
      busy:w('已有更新正在进行中','Another update is in progress.','已有更新正在進行中'),
      install:w('安装确认失败，请重试','Installation could not be confirmed.','未能確認安裝完成'),
      rollback:w('更新失败且已自动回滚','Update failed and rolled back.','更新失敗且已還原'),
      timeout:w('连接 GitHub 超时，请稍后重试','Request timed out.','連線逾時'),
      dns:w('无法解析 GitHub 地址','Could not resolve GitHub.','無法解析 GitHub 位址'),
      certificate:w('HTTPS 证书校验失败','Certificate verification failed.','憑證驗證失敗'),
      proxy:w('代理连接失败','Proxy connection failed.','代理連線失敗'),
      http:w('GitHub 下载请求被拒绝','GitHub rejected the download.','GitHub 拒絕下載'),
      connection:w('下载连接中断','Download interrupted.','下載連線中斷'),
      permission:w('插件目录被占用或无写入权限','Plugin directory locked or unwritable.','外掛目錄被占用或無寫入權限'),
      'python-version':w('需要 Python 3.10 或更高版本','Python 3.10+ is required.','需要 Python 3.10 或更新版本'),
      'python-missing':w('未找到 Python，无法在线安装','Python 3.10+ was not found.','找不到可用的 Python'),
      'install-location':w('插件路径校验失败（不支持符号链接）','Plugin path validation failed.','外掛路徑驗證失敗'),
      'plan-expired':w('更新信息已过期，请重新检查','Update plan expired; check again.','更新資訊已過期，請重新檢查'),
    };
    const fb=st==='error'?(errMap[s.errorDetail]||errMap[s.error]||errMap.network):st==='available'?'':st==='installed'?w('点击重载后即可生效','Reload to activate new version','點擊重新載入即可生效'):w('自动后台检查已开启','Auto-check enabled','已開啟自動檢查');
    text('upd-feedback',fb);
    const act=$('upd-action');
    act.hidden=inProg;act.disabled=updateBusy||inProg||typeof onUpdate!=='function';
    act.className=(st==='available'||st==='installed')?'primary':'';
    text('upd-action',st==='available'?w('立即更新','Update now','立即更新'):st==='installed'?w('重新加载插件','Reload plugin','重新載入外掛'):st==='error'?w('重试','Retry','重試'):w('检查更新','Check now','檢查更新'));
    if(updateMenu.isOpen()&&inProg){if(!updateTimer)updateTimer=setInterval(()=>void sendUpdate({action:'status'}),300);}
    else stopUpdatePoll();
  }
  async function sendUpdate(payload){
    if(disposed||typeof onUpdate!=='function')return;
    const isStatus=payload?.action==='status';
    if(!isStatus)updateBusy=true;
    try{const next=await onUpdate(payload);if(!disposed&&next&&typeof next==='object')updateState=next;}
    catch{if(!disposed&&!isStatus)updateState={...updateState,state:'error',error:'network'};}
    finally{if(!isStatus)updateBusy=false;if(!disposed)renderUpdate();}
  }
  $('update-btn').addEventListener('click',()=>{
    if(updateMenu.isOpen()){updateMenu.close();return;}
    updateMenu.open();renderUpdate();
    if(['idle','current','error'].includes(updateState?.state||'idle'))void sendUpdate({action:'check'});
  });
  $('upd-action').addEventListener('click',()=>{
    if(updateBusy||disposed)return;
    const st=updateState?.state||'idle';
    if(st==='available'&&updateState.latestVersion)void sendUpdate({action:'apply',version:updateState.latestVersion});
    else if(st==='installed')void sendUpdate({action:'reload'});
    else void sendUpdate({action:'check'});
  });
  const closeYear=(restore=true)=>yearMenu.close(restore);
  const closeMonth=(restore=true)=>monthMenu.close(restore);
  const closeCustom=(restore=true)=>customMenu.close(restore);
  const closeMenus=()=>{for(const m of menus)m.close(false);};
  $('year').addEventListener('click',()=>{$('year-menu').matches(':popover-open')?closeYear():yearMenu.open();});
  for(const b of $('date-filter').querySelectorAll('[data-range]'))b.addEventListener('click',()=>{
    if(!value)return;
    const target=b.dataset.range;
    if(target==='month'){
      if(rangeMode!=='month'){$('month-menu').matches(':popover-open')||closeMenus();rangeMode='month';selectedDate=null;year=anchorMonth.slice(0,4);syncYear();renderHeat();renderChart();}
      else if(monthMenu.isOpen())closeMonth();else monthMenu.open();
      return;
    }
    if(target==='custom'){if(customMenu.isOpen())closeCustom();else customMenu.open();return;}
    closeMenus();
    rangeMode=target;selectedDate=null;
    if(target==='7d'||target==='30d'){year=value.today.slice(0,4);syncYear();}
    renderHeat();renderChart();
  });
  function applyCustomRange(){
    if(!value)return;
    const valid=s=>/^\d{4}-\d{2}-\d{2}$/.test(s);
    let from=$('custom-from').value,to=$('custom-to').value;
    if(!valid(from))from=customFrom||add(value.today,-29);
    if(!valid(to))to=customTo||value.today;
    if(from>to)[from,to]=[to,from];
    if(value.firstDate&&from<value.firstDate)from=value.firstDate;
    if(to>value.today)to=value.today;
    if(from>to)from=to;
    customFrom=from;customTo=to;selectedDate=null;rangeMode='custom';
    closeCustom();renderHeat();renderChart();
  }
  $('custom-apply').addEventListener('click',applyCustomRange);
  $('custom-cancel').addEventListener('click',()=>closeCustom());
  for(const id of ['custom-from','custom-to'])$(id).addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();applyCustomRange();}});
  $('heat').addEventListener('keydown',event=>{
    const buttons=[...$('heat').children],index=buttons.indexOf(event.target);if(index<0)return;
    const delta={ArrowLeft:-7,ArrowRight:7,ArrowUp:-1,ArrowDown:1};
    let next=event.key==='Home'?buttons.findIndex(b=>!b.disabled):event.key==='End'?buttons.findLastIndex(b=>!b.disabled):index+(delta[event.key]??NaN);
    if(!Number.isFinite(next)||next<0||next>=buttons.length||buttons[next].disabled)return;event.preventDefault();event.target.tabIndex=-1;buttons[next].tabIndex=0;buttons[next].focus();
  });
  const languagePicker=language.mountLanguagePicker({button:$('locale'),label:$('locale-label'),parent:dialog,choose:onLanguage});
  $('refresh').addEventListener('click',async()=>{
    if(busy||disposed)return;busy=true;const button=$('refresh'),turn=600,started=performance.now();button.disabled=true;button.setAttribute('aria-busy','true');
    refreshMotion=button.querySelector('svg').animate([{transform:'rotate(0deg)'},{transform:'rotate(360deg)'}],{duration:turn,iterations:Infinity});
    try{await onRefresh();}
    catch{if(!disposed){text('alert',w('暂时无法刷新，请稍后重试','Refresh unavailable. Try again shortly.','暫時無法重新整理，請稍後重試'));$('alert').hidden=false;}}
    finally{
      // Fast requests still paint one whole turn. Slow requests finish their
      // current turn, so cancel never snaps a half-rotated icon back to zero.
      if(!disposed){const elapsed=performance.now()-started,remaining=Math.max(turn,Math.ceil(elapsed/turn)*turn)-elapsed;
        await new Promise(resolve=>{finishRefresh=resolve;refreshDelay=setTimeout(resolve,Math.max(0,remaining));});}
      clearTimeout(refreshDelay);refreshDelay=null;finishRefresh=null;refreshMotion?.cancel();refreshMotion=null;busy=false;
      if(!disposed){button.disabled=false;button.setAttribute('aria-busy','false');}
    }
  });
  // Native showModal()/close() changes inertness across the complete host DOM.
  // In long chats this alone can block Chromium for seconds. A top-layer
  // popover keeps the same backdrop without touching every background node.
  // Contain pointer, focus, Tab, Escape and scrolling explicitly instead.
  function present(){
    if(dialog.matches(':popover-open'))return;
    dialog.removeAttribute('open');dialog.showPopover();dialog.setAttribute('open','');
    $('locale').focus({preventScroll:true});
  }
  function conceal(){
    if(dialog.matches(':popover-open'))dialog.hidePopover();dialog.removeAttribute('open');
  }
  function close(){languagePicker.close(false);stopUpdatePoll();closeMenus();conceal();$('tip').hidden=true;opener?.focus({preventScroll:true});}
  $('close').addEventListener('click',close);dialog.addEventListener('cancel',event=>{event.preventDefault();close();});dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();}});
  const contentKey=data=>JSON.stringify([{...data,updatedAt:undefined},language.language,themeSignature()]);
  const within=event=>event.composedPath().includes(dialog);
  function containFocus(event){if(!disposed&&dialog.open&&!within(event)){$('locale').focus({preventScroll:true});}}
  function containKeys(event){
    if(disposed||!dialog.open)return;
    if(event.key==='Escape'){
      event.preventDefault();event.stopImmediatePropagation();
      const openMenu=menus.find(m=>m.isOpen());
      if(openMenu)openMenu.close();else close();return;
    }
    if(event.key!=='Tab')return;
    for(const m of menus)if(m.listbox&&m.isOpen())m.close(false);
    if(customMenu.isOpen()||updateMenu.isOpen()){
      const box=[...(customMenu.isOpen()?$('custom-menu'):$('update-menu')).querySelectorAll('input,button')].filter(n=>!n.disabled&&!n.hidden);
      if(box.length){
        const i=box.indexOf(view.activeElement);
        if(i<0||event.shiftKey&&i===0||!event.shiftKey&&i===box.length-1){event.preventDefault();event.stopImmediatePropagation();(event.shiftKey?box.at(-1):box[0]).focus({preventScroll:true});}
      }
      return;
    }
    const controls=[...view.querySelectorAll('button,input,select,a[href],[tabindex]')].filter(n=>n.tabIndex>=0&&!n.disabled&&n.getClientRects().length&&getComputedStyle(n).visibility!=='hidden');
    if(!controls.length){event.preventDefault();return;}
    const index=controls.indexOf(view.activeElement);
    if(index<0||event.shiftKey&&index===0||!event.shiftKey&&index===controls.length-1){
      event.preventDefault();event.stopImmediatePropagation();(event.shiftKey?controls.at(-1):controls[0]).focus({preventScroll:true});
    }
  }
  function containScroll(event){if(!disposed&&dialog.open&&!within(event))event.preventDefault();}
  function containPointer(event){
    if(disposed||!dialog.open)return;
    const r=dialog.getBoundingClientRect();
    const backdropHit=event.composedPath()[0]===dialog;
    if(!within(event)||backdropHit&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)){event.preventDefault();event.stopImmediatePropagation();if(event.type==='click')close();}
  }
  document.addEventListener('focusin',containFocus,true);document.addEventListener('keydown',containKeys,true);
  document.addEventListener('wheel',containScroll,{capture:true,passive:false});document.addEventListener('touchmove',containScroll,{capture:true,passive:false});
  for(const type of ['pointerdown','mousedown','click'])document.addEventListener(type,containPointer,true);
  // CSS surfaces update immediately; JS model colors must follow in the same
  // theme change, rather than waiting for the next metrics poll.
  const themeObserver=new MutationObserver(()=>{if(!disposed&&value&&dialog.open){const key=contentKey(value);if(key!==lastKey){lastKey=key;render();}}});
  if(root.host)themeObserver.observe(root.host,{attributes:true,attributeFilter:['data-pulse-theme','style']});
  return {open(data,trigger,nextUpdate){if(nextUpdate!==undefined)updateState=nextUpdate;if(!data||disposed)return;accountKey=data.accountKey;value=normalizeUsage(data);opener=trigger;year||=value.today.slice(0,4);anchorMonth||=value.today.slice(0,7);if(!customFrom){const d30=add(value.today,-29);customFrom=value.firstDate&&d30<value.firstDate?value.firstDate:d30;}customTo||=value.today;lastKey=contentKey(data);render();present();},
    update(data,nextUpdate){if(disposed)return;if(nextUpdate!==undefined){updateState=nextUpdate;renderUpdate();}if(!data){if(!value)return;value=null;lastKey='';if(dialog.open)render();return;}if(accountKey&&accountKey!==data.accountKey){selectedDate=null;disabledModels.clear();year=data.today.slice(0,4);anchorMonth=data.today.slice(0,7);const d30=add(data.today,-29);customFrom=data.firstDate&&d30<data.firstDate?data.firstDate:d30;customTo=data.today;}accountKey=data.accountKey;value=normalizeUsage(data);if(!dialog.open)return;const key=contentKey(data);if(key===lastKey)return;lastKey=key;render();},
    restoreModal(){if(!disposed&&dialog.open&&dialog.isConnected&&!dialog.matches(':popover-open')){closeMenus();present();}},
    close,syncGuideDismissed(){if(!replayGuide)dismissGuide();},dispose(){disposed=true;stopUpdatePoll();languagePicker.dispose();themeObserver.disconnect();clearTimeout(refreshDelay);finishRefresh?.();refreshMotion?.cancel();for(const m of menus)m.dispose();document.removeEventListener('focusin',containFocus,true);document.removeEventListener('keydown',containKeys,true);document.removeEventListener('wheel',containScroll,true);document.removeEventListener('touchmove',containScroll,true);for(const type of ['pointerdown','mousedown','click'])document.removeEventListener(type,containPointer,true);conceal();dialog.remove();backdrop.remove();},get isOpen(){return dialog.open;}};
};
