// Sidebar (Level Up extension look) first, then the popup layer (Translator / Fluent 2 look, see ui-service.ts).
export const CSS_TEXT = `
:host{--bg:#1a1a1a;--paper:#302f2e;--line:#3c3b39;--text:#fff;--muted:#f3f2f1;--purple:#b794f6;--disabled:rgba(255,255,255,.5);--footer:#252423;--error:#e57373;--error-light:#ffcdd2;--success:#81c784;--hover:rgba(183,148,246,.08);--selected:rgba(183,148,246,.16);--ibg:rgba(183,148,246,.05);--ibhover:rgba(183,148,246,.12);--ibline:var(--line);--ibshadow:0 2px 8px rgba(183,148,246,.3);--contrast:#000;font-family:"Segoe UI",-apple-system,BlinkMacSystemFont,"Roboto","Helvetica Neue",Arial,sans-serif;font-size:14px}
*{box-sizing:border-box}
button,input,select,textarea{font-family:inherit}
.d365lu-panel,.d365lu-panel button{user-select:none}
.d365lu-panel{pointer-events:auto;position:absolute;inset:0;width:100%;height:100vh;background:var(--bg);color:var(--text);display:flex;flex-direction:column;border-left:1px solid var(--line);font-size:14px;color-scheme:dark}
.d365lu-panel.light,.d365lu-chrome.light{color-scheme:light}
.d365lu-panel.light,.d365lu-chrome.light{--bg:#faf9f8;--paper:#fff;--line:#edebe9;--text:#323130;--muted:#605e5c;--purple:#742774;--disabled:rgba(0,0,0,.38);--footer:#fff;--error:#d13438;--error-light:#f7d4d6;--success:#107c10;--hover:rgba(116,39,116,.04);--selected:rgba(116,39,116,.08);--ibg:#0000;--ibhover:rgba(116,39,116,.06);--ibline:#0000;--ibshadow:none;--contrast:#fff}
.d365lu-chrome{pointer-events:auto;position:absolute;top:4px;right:6px;z-index:5}
.d365lu-chrome{color-scheme:dark}
.d365lu-chrome .d365lu-tool{width:28px;height:28px}
.d365lu-scroll{flex:1;overflow-y:auto;overflow-x:hidden;padding:6px}
.d365lu-section{background:var(--paper);border:1px solid var(--line);border-radius:8px;margin:0 0 6px;overflow:hidden}
.d365lu-section.featured{margin-bottom:8px}
.d365lu-section-head{min-height:44px;padding:8px 16px;display:flex;align-items:center;gap:8px;background:var(--hover);cursor:pointer}
.d365lu-section.featured .d365lu-section-head{padding-top:12px;padding-bottom:12px}
.d365lu-section-head:hover{background:var(--selected)}
.d365lu-section-head>svg{color:var(--purple);flex:none}
.d365lu-section-head h2{font-size:15.2px;line-height:1.3;margin:0;font-weight:600;color:var(--text)}
.d365lu-badge{height:20px;min-width:20px;display:inline-flex;align-items:center;justify-content:center;background:var(--purple);color:var(--contrast);border:1px solid #605e5c;border-radius:16px;padding:0 8px;font-size:11.2px;font-weight:600}
.light .d365lu-badge{border:0}
.d365lu-query{height:20px;display:inline-flex;align-items:center;gap:3px;border:1px solid #605e5c;border-radius:10px;background:#3c3b39;color:var(--text);padding:0 6px;font-size:11.2px;font-weight:500;cursor:pointer}
.light .d365lu-query{background:rgba(0,0,0,.1);border-color:#0000}
.d365lu-grow{flex:1}
.d365lu-section-body{padding:12px 16px 16px}
.d365lu-icon-btn,.d365lu-tool{width:34px;height:34px;border:1px solid var(--ibline);border-radius:6px;background:var(--ibg);color:var(--muted);padding:0;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;flex:none;transition:all .2s ease-in-out}
.d365lu-icon-btn{width:32px;height:32px}
.light .d365lu-icon-btn{width:30px;height:30px}
.d365lu-icon-btn.expanded{transform:rotate(180deg)}
.d365lu-icon-btn:hover,.d365lu-tool:hover{background:var(--ibhover);border-color:var(--purple);color:var(--purple);transform:translateY(-1px);box-shadow:var(--ibshadow)}
.light .d365lu-icon-btn:hover,.light .d365lu-tool:hover{border-color:#0000}
.d365lu-icon-btn.expanded:hover{transform:rotate(180deg) translateY(1px)}
.d365lu-tool.selected{background:var(--purple);border-color:var(--purple);color:var(--contrast)}
.d365lu-tool:disabled{color:#605e5c;background:rgba(255,255,255,.02);opacity:1;cursor:default}
.light .d365lu-tool:disabled{color:#a19f9d;background:#0000}
.d365lu-recent-clear{margin-left:8px}
.d365lu-searchrow{display:flex;gap:8px;margin-bottom:16px;align-items:center}
.d365lu-search{height:32px;flex:1;min-width:0;display:flex;align-items:center;gap:8px;padding:0 10px;border:1px solid var(--line);border-radius:4px;background:rgba(255,255,255,.05);color:var(--muted);transition:background-color .2s,border-color .2s}
.d365lu-search:hover{background:rgba(255,255,255,.08);border-color:#605e5c}
.d365lu-search:focus-within{background:rgba(255,255,255,.1);border-color:var(--purple)}
.light .d365lu-search{background:rgba(255,255,255,.8)}
.light .d365lu-search:hover{background:rgba(255,255,255,.9)}
.light .d365lu-search:focus-within{background:#fff}
.d365lu-input,.d365lu-select{width:100%;border:1px solid var(--line);border-radius:4px;background:var(--paper);color:var(--text);padding:8px 10px;font-size:13px;outline:none}
.d365lu-search .d365lu-input{height:30px;border:0;background:#0000;padding:6px 0;min-width:0}
.d365lu-search-clear{width:24px;height:24px;border:0;background:#0000;color:var(--muted);padding:0;cursor:pointer}
.d365lu-input::placeholder{color:var(--muted);opacity:.55}
textarea.d365lu-input{resize:vertical}
.d365lu-layout{display:flex}
.d365lu-layout .d365lu-tool{height:32px;width:36px;border:1px solid var(--line);border-radius:0;background:#0000}
.d365lu-layout .d365lu-tool:first-child{border-radius:4px 0 0 4px}
.d365lu-layout .d365lu-tool:last-child{border-radius:0 4px 4px 0;margin-left:-1px}
.d365lu-layout .d365lu-tool.selected{background:var(--purple);color:var(--contrast)}
.d365lu-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.d365lu-list{display:flex;flex-direction:column;gap:8px}
.d365lu-tile-wrap{position:relative;min-width:0;text-align:center;display:flex;flex-direction:column;align-items:center}
.d365lu-tile{width:77px;height:77px;max-width:100%;margin:0;border:1px solid var(--line);border-radius:8px;background:transparent;color:var(--text);padding:6px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;cursor:pointer;font-size:11.2px;font-weight:500;line-height:1.2;transition:all .2s ease-in-out;position:relative;overflow:hidden}
.d365lu-tile>svg{width:22.4px;height:22.4px;flex:none}
.d365lu-tile:hover{background:var(--hover);color:var(--purple);transform:translateY(-1px);box-shadow:0 2px 1px -1px rgba(0,0,0,.2),0 1px 1px rgba(0,0,0,.14),0 1px 3px rgba(0,0,0,.12)}
.d365lu-tile:active:not([aria-disabled="true"]){background:var(--selected);transform:translateY(0) scale(.97);transition-duration:.06s}
.d365lu-tile:after{content:"";position:absolute;left:50%;top:50%;width:100%;height:100%;border-radius:50%;background:currentColor;pointer-events:none;opacity:0;transform:translate(-50%,-50%) scale(1.7);transition:transform .3s ease-out,opacity .4s ease-out}
.d365lu-tile:active:not([aria-disabled="true"]):after{opacity:.14;transform:translate(-50%,-50%) scale(.05);transition:0s}
.d365lu-tile[aria-disabled="true"]{opacity:.3;cursor:default}
.d365lu-tile[aria-disabled="true"]:hover{background:transparent;color:var(--text);transform:none;box-shadow:none}
.d365lu-tile-wrap[hidden],.d365lu-empty[hidden]{display:none}
.d365lu-tile:focus-visible,.d365lu-tool:focus-visible,.d365lu-icon-btn:focus-visible,.d365lu-fav:focus-visible,.d365lu-status:focus-visible,.d365lu-query:focus-visible{outline:2px solid var(--purple);outline-offset:2px}
.d365lu-dock{display:none}
:host(.d365lu-floating) .d365lu-dock{display:inline-flex;margin-right:4px}
:host(.d365lu-floating) .d365lu-panel{height:100%;border:1px solid var(--line);border-radius:8px;overflow:hidden;box-shadow:0 16px 32px rgba(0,0,0,.3)}
.d365lu-tile span{max-width:100%;text-align:center;white-space:normal;overflow-wrap:break-word;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.d365lu-stack-label{display:block!important;width:auto!important;overflow:visible!important;-webkit-line-clamp:unset!important}
.d365lu-favorite-dragging{opacity:.35}
.d365lu-favorite-drop-before .d365lu-tile{box-shadow:-4px 0 0 var(--purple)}
.d365lu-favorite-drop-after .d365lu-tile{box-shadow:4px 0 0 var(--purple)}
.d365lu-list .d365lu-favorite-drop-before .d365lu-tile{box-shadow:0 -3px 0 var(--purple)}
.d365lu-list .d365lu-favorite-drop-after .d365lu-tile{box-shadow:0 3px 0 var(--purple)}
.d365lu-fav,.d365lu-more{position:absolute;top:-6px;right:calc(50% - 45px);width:20px;height:20px;border:1px solid var(--line);border-radius:50%;background:var(--paper);color:var(--muted);opacity:.6;padding:3px;cursor:pointer;z-index:2;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.15)}
.d365lu-fav{color:var(--disabled);transition:all .2s ease-in-out}
.d365lu-fav:hover{background:var(--error-light);transform:scale(1.2);color:var(--error);opacity:1;box-shadow:0 3px 10px rgba(244,67,54,.3)}
.d365lu-fav.subtle{opacity:.9;box-shadow:0 1px 3px rgba(0,0,0,.08);transition-duration:.18s}
.d365lu-fav.subtle:hover{transform:scale(1.15);box-shadow:0 3px 8px rgba(244,67,54,.18)}
.d365lu-age{font-size:10.4px;color:var(--muted);opacity:.7;margin-top:4px;text-align:center}
.d365lu-list .d365lu-tile-wrap{align-items:stretch}
.d365lu-list .d365lu-tile{width:100%;height:auto;min-height:64px;max-width:none;flex-direction:row;justify-content:flex-start;padding:12px;gap:16px;font-size:12.8px;font-weight:600}
.d365lu-list .d365lu-tile span{flex:1;text-align:left}
.d365lu-list .d365lu-tile .d365lu-stack-label{flex:0 0 auto;text-align:center}
.d365lu-list .d365lu-fav{right:8px;top:20px}
.d365lu-empty{color:var(--muted);text-align:center;padding:12px}
.d365lu-tooltip{position:fixed;z-index:20;pointer-events:none;width:max-content;max-width:min(300px,calc(100vw - 12px));padding:4px 8px;border-radius:4px;background:rgba(97,97,97,.92);color:#fff;font-size:11px;font-weight:500;line-height:1.4;text-align:center;white-space:normal;transform-origin:center bottom;animation:d365lu-tip-in .12s ease-out}
.d365lu-tooltip[hidden]{display:none}
.d365lu-tooltip:after{content:"";position:absolute;left:var(--tip-arrow-left,50%);bottom:-5px;margin-left:-5px;border:5px solid transparent;border-top-color:rgba(97,97,97,.9);border-bottom:0}
.d365lu-tooltip.below{transform-origin:center top}
.d365lu-tooltip.below:after{top:-5px;bottom:auto;border-top:0;border-bottom:5px solid rgba(97,97,97,.9)}
@keyframes d365lu-tip-in{from{opacity:0;transform:scale(.9)}}
.d365lu-footer{height:44px;flex:none;border-top:1px solid var(--line);background:var(--footer);display:flex;align-items:center;padding:4px 10px;gap:8px}
.d365lu-footer .d365lu-tool{width:34px;height:34px}
.d365lu-status{display:flex;align-items:center;gap:10px;font-weight:600;min-width:0;flex:1;border:0;background:transparent;color:var(--text);cursor:pointer;text-align:left;padding:4px 0}
.d365lu-dot{width:15px;height:15px;border-radius:50%;background:var(--success);flex:none}
.d365lu-dot.off{background:var(--error)}
.d365lu-theme{display:flex}
.d365lu-footer .d365lu-theme .d365lu-tool{width:40px;min-width:40px;background:#0000;color:var(--muted);border:1px solid var(--line);box-shadow:none}
.d365lu-theme .d365lu-tool:first-child{border-radius:20px 0 0 20px}
.d365lu-theme .d365lu-tool:last-child{border-radius:0 20px 20px 0;margin-left:-1px}
.d365lu-theme .d365lu-tool.selected{background:var(--selected);color:var(--text)}
.d365lu-recent-clear{width:32px;height:32px}
.light .d365lu-recent-clear{width:30px;height:30px}
.d365lu-layer{display:contents;
--brand:#0f6cbd;--brand-h:#115ea3;--brand-p:#0f548c;--brand-fg:#0f6cbd;--brand-bg:#ebf3fc;--brand-bg2:#dcebfb;--brand-s:#b4d6fa;--link:#115ea3;--link-h:#0f548c;
--fg1:#242424;--fg2:#424242;--fg3:#616161;--fg4:#707070;--fg-dis:#bdbdbd;
--bg1:#fff;--bg2:#fafafa;--bg3:#f5f5f5;--bg4:#ebebeb;--bg-dis:#f0f0f0;--canvas:#f5f5f5;--row-h:#fafafa;
--s1:#d1d1d1;--s1h:#c7c7c7;--s2:#e0e0e0;--s3:#f0f0f0;--s-acc:#616161;--s-dis:#e0e0e0;
--red:#c50f1f;--red-bg:#fdf3f4;--red-s:#eeacb2;--danger:#c50f1f;--danger-h:#a80d1a;--danger-p:#8e0b16;
--green:#0e700e;--green-bg:#f1faf1;--green-s:#9fd89f;--amber:#8a3707;--amber-bg:#fff9f5;--amber-s:#fdcfb4;
--focus-o:#000;--focus-i:#fff;--scrim:rgba(0,0,0,.4);--edge:transparent;
--sh8:0 0 2px rgba(0,0,0,.12),0 8px 16px rgba(0,0,0,.14);--sh64:0 0 2px rgba(0,0,0,.12),0 32px 64px rgba(0,0,0,.24);
--mono:"Cascadia Mono",Consolas,monospace;--ease:cubic-bezier(.1,.9,.2,1);
--chev:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'><path d='M6 8l4 4 4-4' fill='none' stroke='%23616161' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/></svg>");
--clr:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'><path d='M5 5l10 10M15 5 5 15' stroke='%23616161' stroke-width='1.6' stroke-linecap='round'/></svg>");
font:14px/20px "Segoe UI","Segoe UI Web (West European)",-apple-system,BlinkMacSystemFont,Roboto,"Helvetica Neue",sans-serif;color:var(--fg1);color-scheme:light;text-align:left;letter-spacing:normal;text-transform:none;white-space:normal;-webkit-font-smoothing:antialiased}
.d365lu-layer.dark{
--brand:#115ea3;--brand-h:#0f6cbd;--brand-p:#0c3b5e;--brand-fg:#479ef5;--brand-bg:#082338;--brand-bg2:#0c3b5e;--brand-s:#0e4775;--link:#479ef5;--link-h:#62abf5;
--fg1:#fff;--fg2:#d6d6d6;--fg3:#adadad;--fg4:#999;--fg-dis:#5c5c5c;
--bg1:#292929;--bg2:#1f1f1f;--bg3:#333;--bg4:#3d3d3d;--bg-dis:#141414;--canvas:#1f1f1f;--row-h:#333;
--s1:#666;--s1h:#757575;--s2:#525252;--s3:#3d3d3d;--s-acc:#adadad;--s-dis:#424242;
--red:#e37d80;--red-bg:#3f1011;--red-s:#8b2a30;--danger:#c50f1f;--danger-h:#d13438;--danger-p:#a80d1a;
--green:#54b054;--green-bg:#052505;--green-s:#107c10;--amber:#faa06b;--amber-bg:#4a1e04;--amber-s:#8a3707;
--focus-o:#fff;--focus-i:#000;--scrim:rgba(0,0,0,.5);--edge:#3d3d3d;
--sh8:0 0 2px rgba(0,0,0,.24),0 8px 16px rgba(0,0,0,.28);--sh64:0 0 8px rgba(0,0,0,.24),0 32px 64px rgba(0,0,0,.28);
--chev:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'><path d='M6 8l4 4 4-4' fill='none' stroke='%23adadad' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/></svg>");
--clr:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'><path d='M5 5l10 10M15 5 5 15' stroke='%23adadad' stroke-width='1.6' stroke-linecap='round'/></svg>");
color-scheme:dark}
.d365lu-layer [hidden]{display:none!important}
.d365lu-layer :focus-visible{outline:2px solid var(--focus-o);outline-offset:1px}
.d365lu-layer .d365lu-modal:focus-visible{outline:0}
.d365lu-modal-layer{pointer-events:auto;position:fixed;inset:0;z-index:30;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--scrim);animation:d365lu-fade .12s ease-out}
.d365lu-modal{position:relative;display:flex;flex-direction:column;width:min(560px,100%);max-height:min(880px,100%);margin:0;overflow:hidden;background:var(--bg1);color:var(--fg1);border:1px solid var(--edge);border-radius:8px;box-shadow:var(--sh64);font-size:14px;outline:0;animation:d365lu-rise .18s var(--ease)}
.d365lu-modal.is-sm{width:min(440px,100%)}
.d365lu-modal.is-wide{width:min(880px,100%)}
.d365lu-modal.is-xl{width:min(1200px,100%);height:min(880px,100%)}
.d365lu-modal.is-full,.d365lu-table-wide{width:min(1400px,100%);height:100%;max-width:none;max-height:100%}
.d365lu-modal-head{display:flex;align-items:flex-start;gap:8px;flex:none;padding:20px 16px 0 24px;background:none;color:var(--fg1);font-size:inherit;font-weight:400}
.d365lu-modal-icon{display:grid;place-items:center;flex:none;width:32px;height:32px;border-radius:8px;background:var(--brand-bg);color:var(--brand-fg)}
.d365lu-modal-titles{flex:1;min-width:0}
.d365lu-modal-head h2{margin:0;font-size:20px;line-height:28px;font-weight:600;color:var(--fg1);overflow-wrap:anywhere}
.d365lu-modal-sub{margin:2px 0 0;font-size:12px;line-height:16px;color:var(--fg3);overflow-wrap:anywhere}
.d365lu-modal-actions{display:flex;align-items:center;gap:4px;flex:none}
.d365lu-modal-close,.d365lu-modal-action{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:32px;min-width:32px;padding:0;border:1px solid transparent;border-radius:4px;background:transparent;color:var(--fg2);font:inherit;font-size:13px;font-weight:600;line-height:1;cursor:pointer}
.d365lu-modal-action{padding:0 10px;height:28px}
.d365lu-modal-close:hover,.d365lu-modal-action:hover{background:var(--bg3);color:var(--fg1);border-color:transparent}
.d365lu-modal-close:active,.d365lu-modal-action:active{background:var(--bg4)}
.d365lu-modal.is-xl .d365lu-modal-head,.d365lu-modal.is-full .d365lu-modal-head,.d365lu-table-wide .d365lu-modal-head{align-items:center;min-height:56px;padding:8px 8px 8px 20px;border-bottom:1px solid var(--s2)}
.d365lu-modal.is-xl .d365lu-modal-head h2,.d365lu-modal.is-full .d365lu-modal-head h2,.d365lu-table-wide .d365lu-modal-head h2{font-size:16px;line-height:22px}
.d365lu-modal-body{flex:1 1 auto;min-height:0;overflow:auto;overscroll-behavior:contain;background:none;color:var(--fg2);user-select:text}
.d365lu-modal-body p{margin:0}
.d365lu-dialog-pad{display:flex;flex-direction:column;gap:12px;padding:16px 24px}
.d365lu-modal.is-xl .d365lu-modal-body,.d365lu-modal.is-full .d365lu-modal-body,.d365lu-table-wide .d365lu-modal-body{background:var(--canvas)}
.d365lu-modal.is-xl .d365lu-dialog-pad,.d365lu-modal.is-full .d365lu-dialog-pad{padding:16px;gap:16px}
.d365lu-progress{position:relative;z-index:2;flex:none;height:2px;margin-bottom:-2px;overflow:hidden}
.d365lu-progress i{display:block;width:30%;height:100%;background:var(--brand-fg);animation:d365lu-ind 1.2s ease-in-out infinite}
.d365lu-modal-foot{display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:8px;flex:none;padding:0 24px 24px;background:none;border:0}
.d365lu-modal-foot:empty{display:none}
.d365lu-foot-start{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-right:auto}
.d365lu-foot-end{display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:8px;margin-left:auto}
.d365lu-modal-foot{max-height:50vh;overflow-y:auto}
.d365lu-modal-foot>.d365lu-quiet{margin-right:auto}
.d365lu-modal.is-xl .d365lu-modal-foot,.d365lu-modal.is-full .d365lu-modal-foot{min-height:64px;padding:12px 16px;border-top:1px solid var(--s2);background:var(--bg1)}
.d365lu-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;flex:none;height:32px;padding:0 12px;border:1px solid var(--s1);border-radius:4px;background:var(--bg1);color:var(--fg1);font-family:inherit;font-size:14px;line-height:20px;font-weight:600;white-space:nowrap;cursor:pointer;transition:background .1s,border-color .1s,color .1s}
.d365lu-btn:hover{background:var(--bg3);border-color:var(--s1h)}
.d365lu-btn:active{background:var(--bg4)}
.d365lu-btn.primary{background:var(--brand);border-color:transparent;color:#fff}
.d365lu-btn.primary:hover{background:var(--brand-h)}
.d365lu-btn.primary:active{background:var(--brand-p)}
.d365lu-btn.danger{background:var(--danger);border-color:transparent;color:#fff}
.d365lu-btn.danger:hover{background:var(--danger-h)}
.d365lu-btn.danger:active{background:var(--danger-p)}
.d365lu-btn.caution{color:var(--red)}
.d365lu-btn.caution:hover{background:var(--red-bg);border-color:var(--red-s)}
.d365lu-btn.subtle{background:transparent;border-color:transparent;color:var(--fg2)}
.d365lu-btn.subtle:hover{background:var(--bg3);color:var(--fg1)}
.d365lu-btn.subtle:active{background:var(--bg4)}
.d365lu-btn.sm{height:28px;padding:0 10px;font-size:13px}
.d365lu-btn.icon{width:32px;padding:0}
.d365lu-btn.icon.sm{width:28px}
.d365lu-btn svg{flex:none}
.d365lu-btn:disabled,.d365lu-btn:disabled:hover{cursor:default;background:var(--bg-dis);border-color:var(--s-dis);color:var(--fg-dis)}
.d365lu-btn.primary:disabled,.d365lu-btn.danger:disabled{border-color:transparent}
.d365lu-btn.subtle:disabled,.d365lu-btn.subtle:disabled:hover{background:transparent;border-color:transparent}
.d365lu-btn[aria-busy=true]:disabled,.d365lu-btn[aria-busy=true]:disabled:hover{background:var(--brand-bg);border-color:var(--brand-s);color:var(--brand-fg);cursor:progress}
.d365lu-btn:focus-visible{outline:0;border-color:var(--focus-o);box-shadow:inset 0 0 0 1px var(--focus-o)}
.d365lu-btn.primary:focus-visible,.d365lu-btn.danger:focus-visible{box-shadow:inset 0 0 0 1px var(--focus-o),inset 0 0 0 2px var(--focus-i)}
.d365lu-modal a,.d365lu-link{color:var(--link);text-decoration:none}
.d365lu-modal a:hover,.d365lu-link:hover{color:var(--link-h);text-decoration:underline}
button.d365lu-link{padding:0;border:0;background:none;font:inherit;cursor:pointer}
.d365lu-modal .d365lu-input,.d365lu-modal .d365lu-select{display:block;width:100%;min-width:0;min-height:32px;margin:0;padding:5px 10px;border:1px solid var(--s1);border-bottom-color:var(--s-acc);border-radius:4px;background:var(--bg1);color:var(--fg1);font:inherit;outline:0;user-select:text}
.d365lu-modal input.d365lu-input,.d365lu-modal select.d365lu-input{height:32px}
.d365lu-modal .d365lu-input:focus,.d365lu-modal .d365lu-select:focus{border-bottom-color:var(--brand-fg);box-shadow:inset 0 -1px 0 var(--brand-fg)}
.d365lu-modal .d365lu-input::placeholder{color:var(--fg4);opacity:1}
.d365lu-modal .d365lu-input:disabled{background:var(--bg3);color:var(--fg3);border-color:var(--s2)}
.d365lu-modal textarea.d365lu-input{min-height:96px;resize:vertical}
.d365lu-modal select.d365lu-input,.d365lu-modal select.d365lu-select:not([size]){padding:0 32px 0 10px;appearance:none;-webkit-appearance:none;background:var(--bg1) var(--chev) no-repeat right 8px center/16px;cursor:pointer;text-overflow:ellipsis}
.d365lu-modal select[size]{padding:4px}
.d365lu-modal select[size] option{padding:6px 8px;border-radius:4px;color:var(--fg1)}
/* A focused list box gets the browser's selection colours, its text colour forced with !important (white in light,
   dark grey in dark). The fill colour isn't forced, so the text is painted in --fg1 on our band in every state. */
.d365lu-modal select[size] option:checked{background:linear-gradient(90deg,var(--brand-fg) 0 3px,var(--brand-bg2) 3px);color:var(--fg1);-webkit-text-fill-color:var(--fg1);font-weight:600}
.d365lu-modal input[type=search]::-webkit-search-cancel-button{-webkit-appearance:none;width:16px;height:16px;cursor:pointer;background:center/12px no-repeat var(--clr)}
.d365lu-modal input[type=checkbox],.d365lu-modal input[type=radio]{width:16px;height:16px;margin:0;flex:none;accent-color:var(--brand-fg);cursor:pointer}
.d365lu-field,.d365lu-form-row{display:grid;grid-template-columns:minmax(0,1fr);gap:4px;align-items:start}
.d365lu-field>label,.d365lu-form-row>label{padding:0;font-size:12px;line-height:16px;font-weight:600;color:var(--fg2)}
.d365lu-check{display:inline-flex;align-items:center;gap:8px;color:var(--fg2);cursor:pointer}
.d365lu-inline{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.d365lu-seg{display:inline-flex;flex:none;overflow:hidden;border:1px solid var(--s1);border-radius:4px;background:var(--bg1)}
.d365lu-seg>button{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 12px;border:0;border-radius:0;background:var(--bg1);color:var(--fg2);font:inherit;font-weight:400;white-space:nowrap;cursor:pointer;box-shadow:none}
.d365lu-seg>button+button{border-left:1px solid var(--s1)}
.d365lu-seg>button:hover{background:var(--bg3)}
.d365lu-seg>button[aria-pressed=true],.d365lu-seg>button.primary{background:var(--brand-bg);color:var(--brand-fg);font-weight:600}
.d365lu-seg>button.primary:hover,.d365lu-seg>button[aria-pressed=true]:hover{background:var(--brand-bg2);color:var(--fg1)}
.d365lu-seg>button:focus-visible{outline:2px solid var(--focus-o);outline-offset:-2px;box-shadow:none}
.d365lu-group{display:flex;flex-direction:column;gap:12px;padding:12px 16px 16px;border:1px solid var(--s2);border-radius:8px;background:var(--bg1)}
.d365lu-group-title{margin:0;font-size:14px;line-height:20px;font-weight:600;color:var(--fg1)}
.d365lu-note{display:flex;align-items:flex-start;gap:8px;padding:8px 12px;border:1px solid var(--s2);border-radius:4px;background:var(--bg3);color:var(--fg2);font-size:13px;line-height:18px}
.d365lu-note>svg{flex:none;margin-top:1px}
.d365lu-note>div{flex:1;min-width:0;white-space:pre-line;overflow-wrap:anywhere}
.d365lu-note.info{background:var(--brand-bg);border-color:var(--brand-s);color:var(--fg1)}
.d365lu-note.info>svg{color:var(--brand-fg)}
.d365lu-note.ok{background:var(--green-bg);border-color:var(--green-s);color:var(--green)}
.d365lu-note.amb,.d365lu-warning{background:var(--amber-bg);border-color:var(--amber-s);color:var(--amber)}
.d365lu-note.bad{background:var(--red-bg);border-color:var(--red-s);color:var(--red)}
.d365lu-warning{padding:8px 12px;border:1px solid var(--amber-s);border-radius:4px;font-size:13px;line-height:18px}
.d365lu-modal .d365lu-error{padding:8px 12px;border:1px solid var(--red-s);border-radius:4px;background:var(--red-bg);color:var(--red);font-size:13px;line-height:18px;white-space:pre-wrap;overflow-wrap:anywhere}
.d365lu-modal .d365lu-error:empty{display:none}
.d365lu-chip{display:inline-flex;align-items:center;flex:none;height:20px;padding:0 8px;border:1px solid var(--s2);border-radius:10px;background:var(--bg3);color:var(--fg2);font-size:12px;line-height:16px;font-weight:600;white-space:nowrap}
.d365lu-chip.ok{background:var(--green-bg);color:var(--green);border-color:var(--green-s)}
.d365lu-chip.amb{background:var(--amber-bg);color:var(--amber);border-color:var(--amber-s)}
.d365lu-chip.bad{background:var(--red-bg);color:var(--red);border-color:var(--red-s)}
.d365lu-chip.brand{background:var(--brand-bg);color:var(--brand-fg);border-color:var(--brand-s)}
.d365lu-count{display:inline-flex;align-items:center;flex:none;height:20px;padding:0 8px;border-radius:10px;background:var(--brand-bg);color:var(--brand-fg);font-size:12px;line-height:20px;font-weight:600}
.d365lu-quiet{font-size:12px;line-height:16px;color:var(--fg3)}
.d365lu-wait{display:flex;align-items:center;gap:8px;color:var(--fg3)}
.d365lu-wait .d365lu-spin{color:var(--brand-fg)}
.d365lu-spin{display:inline-block;flex:none;width:14px;height:14px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:d365lu-spin .7s linear infinite}
.d365lu-empty-state{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:48px 24px;text-align:center;color:var(--fg3)}
.d365lu-empty-state b{font-size:16px;line-height:22px;font-weight:600;color:var(--fg1)}
.d365lu-subhead{margin:4px 0 -4px;font-size:12px;line-height:16px;font-weight:600;color:var(--fg2)}
.d365lu-details{display:grid;grid-template-columns:minmax(120px,180px) minmax(0,1fr);margin:0;border:1px solid var(--s2);border-radius:8px;background:var(--bg1);overflow:clip}
.d365lu-details dt,.d365lu-details dd{margin:0;min-width:0;padding:8px 12px;border-top:1px solid var(--s3)}
.d365lu-details dt:first-of-type,.d365lu-details dt:first-of-type+dd{border-top:0}
.d365lu-details dt{font-size:13px;line-height:20px;font-weight:400;color:var(--fg3)}
.d365lu-details dd{display:flex;align-items:flex-start;gap:8px;color:var(--fg1)}
.d365lu-detail-value{flex:1;min-width:0;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--fg1);user-select:text}
.d365lu-detail-value.is-mono{font:12px/20px var(--mono)}
.d365lu-detail-value.is-code{max-height:240px;overflow:auto;padding:6px 8px;border:1px solid var(--s2);border-radius:4px;background:var(--bg2);font:12px/18px var(--mono)}
.d365lu-details a.d365lu-detail-value{color:var(--link)}
.d365lu-copy{display:inline-flex;align-items:center;gap:4px;flex:none;height:24px;margin:-2px 0;padding:0 8px;border:0;border-radius:4px;background:transparent;color:var(--link);font:inherit;font-size:12px;font-weight:600;cursor:pointer}
.d365lu-copy:hover{background:var(--bg3);color:var(--link-h)}
.d365lu-copy-cell{display:flex;align-items:center;justify-content:space-between;gap:8px}
.d365lu-table-dialog{display:flex;flex-direction:column;padding:0;background:var(--canvas)}
.d365lu-table-area{flex:1;width:100%;min-width:0;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:16px;padding:16px;background:var(--canvas)}
.d365lu-table-dialog.dual-pane-layout{flex-direction:row;overflow:hidden}
.dual-pane-layout .d365lu-table-area{width:75%}
.d365lu-table-nav{flex:none;width:260px;min-width:200px;max-width:30%;overflow-y:auto;overflow-x:hidden;display:flex;flex-direction:column;gap:4px;padding:12px 8px;background:var(--bg1);border-right:1px solid var(--s2)}
.d365lu-table-nav-title{margin:0;padding:4px 8px 8px;border:0;font-size:12px;line-height:16px;font-weight:600;color:var(--fg3);text-transform:uppercase;letter-spacing:.04em}
.d365lu-table-nav-links{display:flex;flex-direction:column;gap:2px}
.d365lu-table-nav .d365lu-table-nav-link{display:flex;align-items:center;gap:8px;min-height:32px;padding:6px 8px;border:0;border-radius:4px;background:none;color:var(--fg2);font-size:13px;line-height:18px;font-weight:400;text-decoration:none;word-break:break-word}
.d365lu-table-nav .d365lu-table-nav-link:hover{background:var(--bg3);color:var(--fg1);text-decoration:none}
.d365lu-table-nav .d365lu-table-nav-link.active{background:var(--brand-bg);color:var(--brand-fg);font-weight:600}
.d365lu-table-nav-link small{margin-left:auto;padding:0 8px;border-radius:10px;background:var(--bg3);color:var(--fg3);font-size:12px;line-height:20px;font-weight:600}
.d365lu-table-nav-link.active small{background:var(--bg1);color:var(--brand-fg)}
.d365lu-table-section{flex:none;margin:0;background:var(--bg1);border:1px solid var(--s2);border-radius:8px;overflow:clip;scroll-margin-top:16px}
.d365lu-table-header{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;min-height:48px;padding:12px 16px;background:var(--bg1);border-bottom:1px solid var(--s3)}
.d365lu-table-title{margin:0;font-size:14px;line-height:20px;font-weight:600;color:var(--fg1)}
.d365lu-table-description{flex-basis:100%;margin:0;font-size:12px;line-height:16px;color:var(--fg3)}
.d365lu-table-search{display:flex;align-items:center;gap:8px;height:32px;margin:12px 16px;padding:0 6px 0 10px;border:1px solid var(--s1);border-bottom-color:var(--s-acc);border-radius:4px;background:var(--bg1);color:var(--fg3);box-shadow:none}
.d365lu-table-search:focus-within{border-bottom-color:var(--brand-fg);box-shadow:inset 0 -1px 0 var(--brand-fg)}
.d365lu-table-search span{display:grid;color:var(--fg3);opacity:1}
.d365lu-table-search-input{flex:1;min-width:0;height:100%;padding:0;border:0;outline:0;background:transparent;color:var(--fg1);font:inherit}
.d365lu-table-search-input::placeholder{color:var(--fg4)}
.d365lu-table-search-clear{display:grid;place-items:center;flex:none;width:24px;height:24px;padding:0;border:0;border-radius:4px;background:none;color:var(--fg3);font-size:16px;line-height:1;cursor:pointer}
.d365lu-table-search-clear:hover{background:var(--bg3);color:var(--fg1)}
.d365lu-table-search-clear.hidden{display:none}
.d365lu-table{width:100%;border-collapse:separate;border-spacing:0;table-layout:fixed;background:var(--bg1);font-size:13px;line-height:18px}
.d365lu-table th,.d365lu-table td{box-sizing:border-box;text-align:left;vertical-align:top;color:var(--fg1);overflow:hidden;text-overflow:ellipsis}
.d365lu-table th{position:sticky;top:0;z-index:1;height:32px;padding:7px 12px 7px 16px;background:var(--bg3);border-bottom:1px solid var(--s1);font-weight:600;white-space:nowrap}
.d365lu-table-area .d365lu-table th{top:-16px}
.d365lu-col-resize{position:absolute;top:0;right:0;z-index:2;width:9px;height:100%;cursor:col-resize;touch-action:none;outline:0}
.d365lu-col-resize::after{content:"";position:absolute;top:8px;bottom:8px;right:3px;width:2px;border-radius:1px;background:transparent;transition:background .1s}
.d365lu-table thead:hover .d365lu-col-resize::after{background:var(--s1)}
.d365lu-table thead .d365lu-col-resize:hover::after,.d365lu-col-resize:focus-visible::after{background:var(--brand-fg);top:2px;bottom:2px}
/* Column menus: each heading is a button that opens a sort and filter menu, as in Excel and the Unmanaged Layer Scanner. */
.d365lu-table thead th.d365lu-th-menu{padding:0 4px;vertical-align:middle}
.d365lu-hb{display:flex;align-items:center;gap:4px;width:100%;min-width:0;height:30px;margin:0;padding:0 8px;border:0;border-radius:4px;background:none;color:var(--fg1);font:inherit;font-weight:600;text-align:left;cursor:pointer}
.d365lu-hb:hover,.d365lu-hb[aria-expanded=true]{background:var(--bg4)}
.d365lu-hb:focus-visible{outline:2px solid var(--focus-o);outline-offset:-2px}
.d365lu-hb .l{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.d365lu-hb .ind{display:flex;align-items:center;gap:2px;flex:none;color:var(--fg3)}
.d365lu-hb .ind .on{display:grid;color:var(--brand-fg)}
.d365lu-hb svg{display:block}
.d365lu-table.d365lu-measuring td,.d365lu-table.d365lu-measuring th{white-space:nowrap;overflow-wrap:normal}.d365lu-table.d365lu-measuring .d365lu-copy-cell{display:inline-flex}
.d365lu-clear-filters{height:24px;margin-left:auto;padding:0 8px;font-size:12px}
.d365lu-clear-filters[hidden]{display:none}
.d365lu-table .d365lu-no-match .d365lu-btn{margin-left:8px;height:28px;font-size:13px}
.d365lu-pop{position:absolute;z-index:120;box-sizing:border-box;overflow:auto;width:300px;max-width:calc(100% - 16px);display:flex;flex-direction:column;padding:4px 0;border:1px solid var(--edge);border-radius:6px;background:var(--bg1);color:var(--fg1);box-shadow:var(--sh8);font-size:14px;line-height:20px;font-weight:400;text-align:left;animation:d365lu-fade .12s ease-out}
.d365lu-pop[hidden]{display:none}
.d365lu-pop:focus{outline:0}
.d365lu-pop .mi{display:flex;align-items:center;gap:8px;flex:none;min-height:32px;margin:0 4px;padding:0 8px;border:0;border-radius:4px;background:none;color:var(--fg1);font:inherit;text-align:left;cursor:pointer}
.d365lu-pop .mi[hidden]{display:none}
.d365lu-pop .mi:hover,.d365lu-pop .mi:focus-visible{background:var(--bg3);outline:0}
.d365lu-pop .mi .ck{display:grid;width:16px;color:var(--brand-fg)}
.d365lu-pop .mi .si{display:grid;color:var(--fg3)}
.d365lu-pop .sep{flex:none;height:1px;margin:4px 0;background:var(--s2)}
.d365lu-pop .d365lu-table-search{flex:none;margin:4px 12px}
.d365lu-pop .pop-list{flex:1;min-height:64px;overflow:auto;padding:2px 4px}
.d365lu-pop .pv{display:flex;align-items:center;gap:8px;min-height:30px;padding:0 8px;border-radius:4px;cursor:pointer}
.d365lu-pop .pv:hover{background:var(--bg3)}
.d365lu-pop .pv input{flex:none;width:16px;height:16px;margin:0;accent-color:var(--brand);cursor:pointer}
.d365lu-pop .pv .v{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.d365lu-pop .pv .n{flex:none;color:var(--fg3);font-size:12px}
.d365lu-pop .pv-all{font-weight:600}
.d365lu-pop .pop-more{padding:6px 12px;color:var(--fg3);font-size:12px;line-height:16px}
.d365lu-pop .pop-foot{display:flex;flex:none;align-items:center;gap:8px;margin-top:4px;padding:8px 12px 4px;border-top:1px solid var(--s2)}
.d365lu-pop .pop-foot .spacer{flex:1}
.d365lu-resizing,.d365lu-resizing *{cursor:col-resize!important;user-select:none}
.d365lu-table td{padding:7px 12px 7px 16px;border-bottom:1px solid var(--s3);white-space:normal;overflow-wrap:anywhere}
.d365lu-table tbody tr:last-child td{border-bottom:0}
.d365lu-table tbody tr:hover td{background:var(--row-h)}
.d365lu-table th:first-child:nth-last-child(2){width:62.5%;min-width:120px}.d365lu-table th:nth-child(2):last-child{width:37.5%;min-width:90px}.d365lu-table th:first-child:nth-last-child(4){width:25%;min-width:120px}.d365lu-table th:nth-child(2):nth-last-child(3){width:40%;min-width:200px}.d365lu-table th:nth-child(3):nth-last-child(2){width:20%;min-width:100px}.d365lu-table th:nth-child(4):last-child{width:15%;min-width:90px}
.d365lu-table a{font-weight:400}
.d365lu-table .value-cell{background:none;color:var(--fg1);font:12px/18px var(--mono);white-space:pre-wrap}
.d365lu-table .empty-row td{padding:32px 16px;text-align:center;color:var(--fg3);font-style:normal}
.d365lu-modal .d365lu-code{min-height:220px;font:12px/18px var(--mono);white-space:pre;overflow:auto;tab-size:2}
.d365lu-result{margin:0;max-height:min(420px,48vh);overflow:auto;padding:8px 12px;border:1px solid var(--s2);border-radius:6px;background:var(--bg2);color:var(--fg1);font:12px/18px var(--mono);white-space:pre-wrap;overflow-wrap:anywhere}
pre.d365lu-result:empty{display:none}
div.d365lu-result{padding:0;background:var(--bg1);font-family:inherit;font-size:13px;line-height:18px;white-space:normal}
div.d365lu-result .d365lu-table{table-layout:auto;min-width:100%}
div.d365lu-result .d365lu-table td{max-width:320px;white-space:nowrap}
.d365lu-audit .audit-controls{display:flex;flex-wrap:wrap;align-items:flex-end;gap:8px 12px;padding:12px 16px;border:1px solid var(--s2);border-radius:8px;background:var(--bg1)}
.d365lu-audit .audit-controls label{flex:1;min-width:130px;display:grid;gap:4px;font-size:12px;line-height:16px;font-weight:600;color:var(--fg2)}
.d365lu-audit .audit-controls label:first-child{flex:2;min-width:230px}
.d365lu-audit .audit-note{margin:0;font-size:12px;line-height:16px;color:var(--fg3)}
.d365lu-audit .audit-error{margin:0;padding:8px 12px;border:1px solid var(--red-s);border-radius:4px;background:var(--red-bg);color:var(--red);font-size:13px;line-height:18px;white-space:pre-wrap}
.d365lu-audit .audit-error:empty{display:none}
.d365lu-audit .audit-results{display:flex;flex-direction:column;gap:14px}
.d365lu-audit .audit-card{--tone:var(--fg3);--tone-bg:var(--bg4);margin:0;border:1px solid var(--s1);border-radius:8px;background:var(--bg1);box-shadow:0 1px 3px rgba(0,0,0,.08);overflow:clip}
.d365lu-audit .audit-card.tone-ok{--tone:var(--green);--tone-bg:var(--green-bg)}
.d365lu-audit .audit-card.tone-brand{--tone:var(--brand-fg);--tone-bg:var(--brand-bg)}
.d365lu-audit .audit-card.tone-bad{--tone:var(--red);--tone-bg:var(--red-bg)}
/* Each change starts with a tinted bar and a stripe in the colour of its kind, so one change ends where the next begins. */
.d365lu-audit .audit-heading{display:flex;flex-wrap:wrap;align-items:center;gap:2px 8px;padding:10px 12px 10px 16px;background:var(--tone-bg);border-bottom:1px solid var(--s1);box-shadow:inset 4px 0 0 var(--tone);font-size:12px;line-height:16px;color:var(--fg2)}
.d365lu-audit .audit-user{font-weight:600}
.d365lu-audit .audit-user:hover,.d365lu-audit .audit-user:focus-visible{text-decoration:underline}
.d365lu-audit .audit-heading strong:not(.d365lu-chip){font-size:14px;line-height:20px;font-weight:600;color:var(--fg1)}
.d365lu-audit .audit-values{width:100%;table-layout:fixed;border-collapse:collapse;font-size:13px;line-height:18px}
.d365lu-audit .audit-values th{padding:6px 12px;background:var(--bg1);border-bottom:1px solid var(--s3);color:var(--fg3);font-size:12px;line-height:16px;font-weight:600;text-align:left}
.d365lu-audit .audit-values td{padding:8px 12px;vertical-align:top;border-top:1px solid var(--s3);color:var(--fg1);overflow-wrap:anywhere}
.d365lu-audit .audit-values th:first-child{width:22%}
.d365lu-audit .audit-values td:nth-child(2) pre{color:var(--fg3)}
.d365lu-audit .audit-values pre{margin:0;max-height:12rem;overflow:auto;font:12px/18px var(--mono);white-space:pre-wrap;user-select:text}
.d365lu-audit .audit-card>.d365lu-btn{margin:8px 12px 12px}
.d365lu-pager{display:flex;align-items:center;justify-content:flex-end;gap:8px}
.d365lu-access{gap:16px}
.d365lu-access p{margin:0;line-height:20px}
.d365lu-access .ac-muted{font-size:12px;line-height:16px;color:var(--fg3)}
.d365lu-access .ac-pickers{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.d365lu-access .ac-card{min-width:0;padding:12px 16px 16px;border:1px solid var(--s2);border-radius:8px;background:var(--bg1)}
.d365lu-access .ac-card h3{margin:0 0 8px;font-size:14px;line-height:20px;font-weight:600;color:var(--fg1)}
.d365lu-access .ac-card>label{display:grid;gap:4px;font-size:12px;line-height:16px;font-weight:600;color:var(--fg2)}
.d365lu-access .ac-search{display:flex;gap:8px}
.d365lu-access .ac-search input{flex:1;min-width:0}
.d365lu-access .ac-results{display:flex;flex-direction:column;gap:4px;max-height:180px;overflow:auto;margin-top:6px}
.d365lu-access .ac-result{display:grid;gap:1px;padding:6px 10px;border:1px solid var(--s2);border-radius:6px;background:var(--bg1);color:var(--fg1);font:inherit;font-size:13px;line-height:18px;text-align:left;overflow-wrap:anywhere;cursor:pointer}
.d365lu-access .ac-result:hover,.d365lu-access .ac-result:focus-visible{border-color:var(--brand);background:var(--bg3);outline:0}
.d365lu-access .ac-result:focus-visible{box-shadow:inset 0 0 0 1px var(--focus-o)}
.d365lu-access .ac-result strong,.d365lu-access .ac-selected strong{font-weight:600;color:var(--fg1)}
.d365lu-access .ac-result span,.d365lu-access .ac-selected span{font-size:12px;line-height:16px;color:var(--fg3)}
.d365lu-access .ac-selected{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;column-gap:10px;margin-top:8px;padding:8px 12px;border:1px dashed var(--s2);border-radius:6px;color:var(--fg3);font-size:13px;line-height:18px;overflow-wrap:anywhere}
.d365lu-access .ac-selected.is-set{border:1px solid var(--green-s);background:var(--green-bg)}
.d365lu-access .ac-selected svg{grid-row:span 2;width:18px;height:18px;color:var(--green)}
.d365lu-access .ac-selected strong,.d365lu-access .ac-selected span{grid-column:2}
.d365lu-access .ac-note{margin:8px 0 0;font-size:12px;line-height:16px;color:var(--fg3)}
.d365lu-access .ac-note:empty{display:none}
.d365lu-access .ac-error{color:var(--red)}
.d365lu-access .ac-controls{display:flex;flex-wrap:wrap;align-items:center;gap:12px}
.d365lu-access .ac-controls input[type=search]{flex:1;min-width:160px}
.d365lu-access .ac-controls label{display:inline-flex;align-items:center;gap:8px;white-space:nowrap;color:var(--fg2)}
.d365lu-access section{border:1px solid var(--s2);border-radius:8px;background:var(--bg1);overflow:clip}
.d365lu-access section h3{margin:0;min-height:44px;padding:12px 16px;border-bottom:1px solid var(--s3);background:var(--bg1);font-size:14px;line-height:20px;font-weight:600;color:var(--fg1)}
.d365lu-access .ac-warning{padding:8px 16px;border-bottom:1px solid var(--amber-s);background:var(--amber-bg);color:var(--amber);font-size:12px;line-height:16px;white-space:pre-line}
.d365lu-access .ac-table-wrap{overflow:auto}
.d365lu-access table{width:100%;min-width:460px;border-collapse:collapse;table-layout:fixed;font-size:13px;line-height:18px}
.d365lu-access th,.d365lu-access td{padding:8px 12px;border-bottom:1px solid var(--s3);color:var(--fg1);text-align:left;vertical-align:top;white-space:pre-line;overflow-wrap:anywhere}
.d365lu-access thead th{background:var(--bg3);border-bottom-color:var(--s1);font-weight:600}
.d365lu-access tbody th{font-weight:400;color:var(--fg2)}
.d365lu-access th:first-child{width:30%}
.d365lu-access tbody tr:last-child>*{border-bottom:0}
/* A row where the two differ: an accent bar only (the ✓ and × chips say who has it), so the table stays calm. */
.d365lu-access tr.ac-different>th{box-shadow:inset 3px 0 0 var(--brand-fg)}
.d365lu-access .ac-empty{padding:16px;color:var(--fg3);font-size:13px}
.d365lu-toastbox{pointer-events:none;position:fixed;right:422px;bottom:16px;z-index:50;display:flex;flex-direction:column;align-items:flex-end;gap:8px;max-width:calc(100vw - 438px)}
.d365lu-toastbox.is-undocked{right:24px;max-width:calc(100vw - 48px)}
.d365lu-toast{pointer-events:auto;display:flex;align-items:flex-start;gap:8px;width:360px;max-width:100%;padding:12px;border:1px solid var(--edge);border-radius:4px;background:var(--bg1);color:var(--fg1);box-shadow:var(--sh8);font-size:14px;line-height:20px;animation:d365lu-rise .18s ease-out}
.d365lu-toast.out{animation:d365lu-toast-out .15s ease-in forwards}
.d365lu-layer.has-dialog>.d365lu-toastbox{display:none}
.d365lu-modal-status{display:flex;align-items:center;flex:0 1 auto;min-width:0;max-width:50%;min-height:28px}
.d365lu-modal-status:empty{display:none}
.d365lu-modal-status .d365lu-toast{width:auto;max-width:100%;align-items:center;gap:6px;padding:3px 4px 3px 10px;border-radius:4px;box-shadow:none;font-size:13px;line-height:18px;animation:d365lu-fade .12s ease-out}
.d365lu-modal-status .d365lu-toast.out{animation:d365lu-toast-out .15s ease-in forwards}
.d365lu-modal-status .d365lu-toast-icon{margin-top:0}
.d365lu-modal-status .d365lu-toast-text{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;white-space:normal}
.d365lu-modal-status .d365lu-toast-x{width:20px;height:20px;margin:0}
.d365lu-modal-status .d365lu-toast.success{background:var(--green-bg);border-color:var(--green-s)}
.d365lu-modal-status .d365lu-toast.info{background:var(--brand-bg);border-color:var(--brand-s)}
.d365lu-modal-status .d365lu-toast.warning{background:var(--amber-bg);border-color:var(--amber-s)}
.d365lu-modal-status .d365lu-toast.error{background:var(--red-bg);border-color:var(--red-s)}
.d365lu-toast-icon{display:grid;flex:none;margin-top:2px;color:var(--brand-fg)}
.d365lu-toast.success .d365lu-toast-icon{color:var(--green)}
.d365lu-toast.warning .d365lu-toast-icon{color:var(--amber)}
.d365lu-toast.error .d365lu-toast-icon{color:var(--red)}
.d365lu-toast-text{flex:1;min-width:0;white-space:pre-wrap;overflow-wrap:anywhere}
.d365lu-toast-x{display:grid;place-items:center;flex:none;width:24px;height:24px;margin:-2px -4px 0 0;padding:0;border:0;border-radius:4px;background:none;color:var(--fg3);cursor:pointer}
.d365lu-toast-x:hover{background:var(--bg3);color:var(--fg1)}
@media (max-width:760px){
.d365lu-table-dialog.dual-pane-layout{flex-direction:column}
.d365lu-table-nav{width:auto;min-width:0;max-width:none;flex-direction:row;overflow-x:auto;border-right:0;border-bottom:1px solid var(--s2)}
.d365lu-table-nav-links{flex-direction:row}
.d365lu-table-nav-title{display:none}
.dual-pane-layout .d365lu-table-area{width:auto}
.d365lu-table-section{overflow-x:auto}
.d365lu-table{min-width:640px}
.d365lu-access .ac-pickers{grid-template-columns:1fr}}
@media (max-width:720px){.d365lu-toastbox,.d365lu-toastbox.is-undocked{left:16px;right:16px;max-width:none;align-items:stretch}.d365lu-toast{width:auto}}
@media (max-width:480px){.d365lu-modal-foot{flex-direction:column;align-items:stretch}.d365lu-foot-start,.d365lu-foot-end{margin:0}.d365lu-foot-end{flex-direction:column;align-items:stretch}}
@media (max-width:600px){
.d365lu-modal-layer{padding:8px}
.d365lu-modal.is-xl,.d365lu-modal.is-full,.d365lu-table-wide{height:100%}
.d365lu-modal-head{padding:16px 8px 0 16px}
.d365lu-modal-head{flex-wrap:wrap}.d365lu-modal-status{order:3;flex:1 0 100%;max-width:none}
.d365lu-dialog-pad{padding:12px 16px}
.d365lu-modal-foot{padding:0 16px 16px}
.d365lu-details{grid-template-columns:minmax(0,1fr)}
.d365lu-details dd{padding-top:0;border-top:0}}
@keyframes d365lu-fade{from{opacity:0}}
@keyframes d365lu-rise{from{opacity:0;transform:translateY(10px)}}
@keyframes d365lu-spin{to{transform:rotate(360deg)}}
@keyframes d365lu-ind{from{transform:translateX(-100%)}to{transform:translateX(340%)}}
@keyframes d365lu-toast-out{to{opacity:0;transform:translateY(8px)}}
@media (prefers-reduced-motion:reduce){.d365lu-modal-layer,.d365lu-modal,.d365lu-toast,.d365lu-toast.out,.d365lu-modal-status .d365lu-toast,.d365lu-modal-status .d365lu-toast.out,.d365lu-pop{animation:none}.d365lu-progress i{animation:none;width:100%;opacity:.5}}
.d365lu-prompt-body{padding:0}
.d365lu-sort-slot .d365lu-tile{opacity:.35;border-style:dashed;border-color:var(--purple);box-shadow:none!important;transform:none!important}
.d365lu-sort-slot .d365lu-fav,.d365lu-sort-slot .d365lu-age{visibility:hidden}
.d365lu-sort-ghost{position:fixed;z-index:30;margin:0;pointer-events:none;transform:scale(1.06) rotate(-1.5deg);filter:drop-shadow(0 10px 18px rgba(0,0,0,.35))}
.d365lu-sort-ghost .d365lu-tile{background:var(--paper);color:var(--purple);border-color:var(--purple)}
.d365lu-sort-ghost .d365lu-fav{display:none}
.d365lu-sorting,.d365lu-sorting *{user-select:none}
.d365lu-access .ac-intro{color:var(--fg2)}
.d365lu-access .ac-summary{display:flex;flex-direction:column;gap:4px;padding:14px 16px;border:1px solid var(--brand-s);border-radius:8px;background:var(--brand-bg)}
.d365lu-access .ac-headline{font-size:15px;line-height:22px;font-weight:600;color:var(--fg1)}
.d365lu-access .ac-fact{color:var(--fg2);font-size:13px;line-height:18px}
.d365lu-access .ac-head{display:flex;align-items:center;gap:8px;min-height:44px;padding:0 16px;border-bottom:1px solid var(--s3)}
.d365lu-access .ac-head h3,.d365lu-access summary h3{min-height:0;padding:0;border:0;background:none}
.d365lu-access details>summary{display:flex;align-items:center;gap:8px;min-height:44px;padding:0 16px;cursor:pointer;list-style:none}
.d365lu-access details>summary::-webkit-details-marker{display:none}
.d365lu-access details>summary:before{content:"";width:6px;height:6px;border-right:2px solid var(--fg3);border-bottom:2px solid var(--fg3);transform:rotate(-45deg);transition:transform .15s;margin-right:4px}
.d365lu-access details[open]>summary:before{transform:rotate(45deg)}
.d365lu-access details[open]>summary{border-bottom:1px solid var(--s3)}
.d365lu-access .ac-about{margin:0;padding:8px 16px;color:var(--fg3);font-size:12px;line-height:16px}
.d365lu-access .ac-detail{display:block;margin-top:2px;font-size:12px;line-height:16px;font-weight:400;color:var(--fg3)}
.d365lu-access .ac-values{display:flex;flex-direction:column;align-items:flex-start;gap:4px}
.d365lu-access .ac-link{color:var(--link);font-weight:inherit}
.d365lu-access .ac-link:hover,.d365lu-access .ac-link:focus-visible,.d365lu-access a.ac-value:hover>span,.d365lu-access a.ac-value:focus-visible>span{text-decoration:underline}
.d365lu-access .ac-value{display:inline-flex;align-items:flex-start;gap:6px;padding:2px 8px;border-radius:10px;font-size:12px;line-height:16px;font-weight:600;white-space:pre-line}
.d365lu-access .ac-value svg{flex:none;margin-top:1px}
.d365lu-access .ac-value.yes{background:var(--green-bg);color:var(--green)}
.d365lu-access .ac-value.no{background:transparent;color:var(--fg3);font-weight:400}
.d365lu-access .ac-value.unknown{background:var(--amber-bg);color:var(--amber)}
.d365lu-access .ac-controls[hidden]{display:none}
.d365lu-table-search-input::-webkit-search-cancel-button{display:none}
.d365lu-table-search-input:focus-visible{outline:0}

.d365lu-field>.d365lu-seg,.d365lu-form-row>.d365lu-seg{justify-self:start}
.d365lu-sync-note{margin:0;font-size:12px;line-height:16px;color:var(--fg3)}
`;
