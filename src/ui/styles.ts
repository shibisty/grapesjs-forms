export const STYLE_ID = 'gjsf-style';

/** The editor's own UI (the modal); colours follow the GrapesJS theme variables. */
export const CSS = `
.gjsf-modal .gjs-mdl-dialog{max-width:1180px;width:96%}
.gjsf-modal .gjs-mdl-content{padding:0}
.gjsf-ed{display:flex;height:min(78vh,760px);font-size:13px;text-align:start;font-family:var(--gjs-main-font,Helvetica,sans-serif)}
.gjsf-ed *{box-sizing:border-box}
.gjsf-side{width:200px;flex:none;border-inline-end:1px solid rgba(0,0,0,.25);display:flex;flex-direction:column;overflow:auto}
.gjsf-side-list{list-style:none;margin:0;padding:0;flex:1}
.gjsf-side-item{padding:8px 12px;cursor:pointer;border-inline-start:3px solid transparent;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gjsf-side-item:hover{background:rgba(255,255,255,.06)}
.gjsf-side-item.is-active{border-inline-start-color:var(--gjs-quaternary-color,#d278c9);background:rgba(255,255,255,.08)}
.gjsf-main{flex:1;min-width:0;display:flex;flex-direction:column}
.gjsf-head{display:flex;gap:8px;align-items:center;padding:8px 12px;border-bottom:1px solid rgba(0,0,0,.25)}
.gjsf-head .gjsf-input{flex:1;font-size:15px;font-weight:600}
.gjsf-status{font-size:11px;opacity:.75;white-space:nowrap}
.gjsf-status.is-error{color:#ff8a80;opacity:1}
.gjsf-tabs{display:flex;gap:2px;padding:0 8px;border-bottom:1px solid rgba(0,0,0,.25)}
.gjsf-tab{background:none;border:0;border-bottom:2px solid transparent;color:inherit;padding:8px 12px;cursor:pointer;font:inherit;opacity:.75}
.gjsf-tab.is-active{border-bottom-color:var(--gjs-quaternary-color,#d278c9);opacity:1}
.gjsf-body{flex:1;min-height:0;overflow:auto}
.gjsf-cols{display:flex;height:100%}
.gjsf-palette{width:150px;flex:none;padding:8px;border-inline-end:1px solid rgba(0,0,0,.2);overflow:auto}
.gjsf-palette button{display:flex;gap:6px;align-items:center;width:100%;text-align:start;margin:0 0 3px;padding:5px 8px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:3px;color:inherit;cursor:pointer;font:inherit}
.gjsf-palette button:hover{background:rgba(255,255,255,.14)}
.gjsf-ico{display:inline-block;width:18px;text-align:center;opacity:.8;font-size:12px}
.gjsf-list{flex:1;min-width:0;padding:8px;overflow:auto;border-inline-end:1px solid rgba(0,0,0,.2)}
.gjsf-row{display:flex;gap:6px;align-items:center;padding:6px 8px;margin-bottom:4px;border:1px solid rgba(255,255,255,.12);border-radius:4px;cursor:pointer}
.gjsf-row:hover{background:rgba(255,255,255,.05)}
.gjsf-row.is-active{border-color:var(--gjs-quaternary-color,#d278c9);background:rgba(255,255,255,.08)}
.gjsf-row-main{flex:1;min-width:0}
.gjsf-row-title{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gjsf-row-sub{font-size:10px;opacity:.6;font-family:ui-monospace,Menlo,Consolas,monospace}
.gjsf-row .gjsf-act{visibility:hidden}
.gjsf-row:hover .gjsf-act,.gjsf-row.is-active .gjsf-act{visibility:visible}
.gjsf-act{background:none;border:0;color:inherit;cursor:pointer;padding:2px 5px;border-radius:3px;font-size:12px}
.gjsf-act:hover{background:rgba(255,255,255,.15)}
.gjsf-act[disabled]{opacity:.3;cursor:default}
.gjsf-props{width:330px;flex:none;padding:8px 12px;overflow:auto}
.gjsf-pane{padding:12px;max-width:720px}
.gjsf-f{display:block;margin:0 0 8px}
.gjsf-f>span{display:block;font-size:11px;opacity:.85;margin-bottom:2px}
.gjsf-f small{display:block;font-size:10px;opacity:.6;margin-top:2px}
.gjsf-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px}
.gjsf-grid2{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.gjsf-input{display:block;width:100%;margin:0;padding:5px 8px;background:rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.2);color:inherit;border-radius:3px;font:inherit}
.gjsf-input option{color:#222}
textarea.gjsf-input{resize:vertical;min-height:54px}
.gjsf-code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px}
.gjsf-check{display:flex;align-items:center;gap:6px;margin:0 0 6px;cursor:pointer}
.gjsf-kv{display:flex;gap:4px;margin-bottom:4px}
.gjsf-kv .gjsf-input{flex:1;min-width:0}
.gjsf-sec{margin:12px 0 6px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;opacity:.7}
.gjsf-hint{opacity:.7;font-size:12px;margin:4px 0}
.gjsf-chips{display:flex;flex-wrap:wrap;gap:3px;margin-top:4px}
.gjsf-chip{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);border-radius:10px;padding:1px 7px;font-size:10px;cursor:pointer;color:inherit;font-family:ui-monospace,Menlo,Consolas,monospace}
.gjsf-chip.is-build{border-style:dashed}
.gjsf-btn{padding:6px 12px;border-radius:3px;border:0;cursor:pointer;color:inherit;font:inherit;background:rgba(255,255,255,.15)}
.gjsf-btn:hover{background:rgba(255,255,255,.22)}
.gjsf-btn.is-primary{background:var(--gjs-quaternary-color,#d278c9)}
.gjsf-btn.is-danger:hover{background:#c62828}
.gjsf-bar{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:8px 0}
.gjsf-side .gjsf-btn{margin:8px}
.gjsf-empty{padding:24px;opacity:.7}
.gjsf-frame{width:100%;height:calc(100% - 36px);border:0;background:#fff;display:block}
.gjsf-frame-bar{display:flex;gap:8px;align-items:center;padding:6px 12px;font-size:11px;opacity:.85;height:36px}
.gjsf-table-wrap{overflow:auto;max-height:100%}
.gjsf-table{border-collapse:collapse;width:100%;font-size:12px}
.gjsf-table th,.gjsf-table td{border-bottom:1px solid rgba(255,255,255,.1);padding:5px 8px;text-align:start;vertical-align:top;max-width:280px;overflow-wrap:anywhere}
.gjsf-table th{position:sticky;top:0;background:var(--gjs-primary-color,#444);font-weight:600}
.gjsf-err{color:#ff8a80}
.gjsf-trait{width:100%;padding:4px 2px 8px;box-sizing:border-box;text-align:start;font-size:12px}
.gjsf-trait *{box-sizing:border-box}
.gjsf-trait__head{display:flex;align-items:center;gap:6px;margin:0 0 8px}
.gjsf-trait__title{flex:1;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gjsf-trait .gjsf-btn{padding:3px 8px;font-size:11px}
.gjsf-trait .gjsf-pane{padding:0}
.gjsf-trait .gjsf-grid{grid-template-columns:1fr 1fr}
.gjs-trt-trait:has(.gjsf-trait){display:block;padding:0 10px}
.gjs-field:has(>.gjsf-trait){background:none;padding:0;border:0;box-shadow:none}
.gjsf-trait input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=file]),.gjsf-trait select,.gjsf-trait textarea{width:100%;border:1px solid rgba(255,255,255,.2);background:rgba(0,0,0,.2);color:inherit;padding:5px 8px;border-radius:3px;box-sizing:border-box;font:inherit}
.gjsf-trait input[type=checkbox],.gjsf-trait input[type=radio]{appearance:auto;-webkit-appearance:auto;display:inline-block;width:auto;height:auto;margin:0 6px 0 0;vertical-align:middle}
.gjsf-trait select option{color:#222}
.gjsf-toggle{position:absolute;top:8px;right:96px;z-index:60;background:var(--gjs-primary-color,#444);color:var(--gjs-font-color,#ddd);border:1px solid rgba(255,255,255,.2);border-radius:4px;padding:6px 10px;cursor:pointer}
`;

export function injectCss(doc: Document = document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const st = doc.createElement('style');
  st.id = STYLE_ID;
  st.textContent = CSS;
  doc.head.appendChild(st);
}

/**
 * A small base stylesheet of the forms, written into the project CSS once
 * (so it is the site's CSS: exported, editable in the Style Manager). It
 * inherits fonts and colours; the button keeps the site's own button look.
 */
export const BASE_FORM_CSS = `
.gjsf-form{display:flex;flex-wrap:wrap;gap:16px;position:relative}
.gjsf-field{flex:1 1 100%;min-width:0;margin:0;padding:0;border:0}
.gjsf-w-1-2{flex-basis:calc(50% - 8px)}
.gjsf-w-1-3{flex-basis:calc(33.333% - 11px)}
.gjsf-w-2-3{flex-basis:calc(66.666% - 6px)}
.gjsf-w-1-4{flex-basis:calc(25% - 12px)}
.gjsf-w-3-4{flex-basis:calc(75% - 4px)}
.gjsf-label{display:block;margin:0 0 6px;padding:0;font-weight:600}
.gjsf-req{margin-left:2px;color:#c62828}
.gjsf-input{display:block;width:100%;box-sizing:border-box;padding:10px 12px;font:inherit;color:inherit;background:transparent;border:1px solid rgba(127,127,127,.5);border-radius:4px}
.gjsf-input:focus{outline:2px solid rgba(127,127,127,.35);outline-offset:1px}
.gjsf-options{display:flex;flex-direction:column;gap:6px}
.gjsf-option{display:flex;gap:8px;align-items:center;cursor:pointer;font-weight:400}
.gjsf-help{margin-top:4px;font-size:.875em;opacity:.75}
.gjsf-error{margin-top:4px;font-size:.875em;color:#c62828}
.gjsf-error:empty{display:none}
.has-error .gjsf-input{border-color:#c62828}
.gjsf-heading{flex-basis:100%;margin:8px 0 0}
.gjsf-text{flex-basis:100%;margin:0}
.gjsf-actions{flex-basis:100%}
.gjsf-submit{font:inherit;padding:10px 24px;cursor:pointer}
.gjsf-message{flex-basis:100%}
.gjsf-message:empty{display:none}
.gjsf-form.is-sending{opacity:.7}
.gjsf-form.is-error .gjsf-message{color:#c62828}
`;
