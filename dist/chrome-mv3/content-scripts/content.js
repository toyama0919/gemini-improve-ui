var content=(function(){"use strict";function Xt(e){return e}const se={chat:{navigateToSearch:"Insert",toggleSidebar:"Delete",toggleHistoryMode:"End",scrollUp:"PageUp",scrollDown:"PageDown",historyUp:"ArrowUp",historyDown:"ArrowDown",historyOpen:"Enter",historyExit:"Escape"},search:{moveUp:"ArrowUp",moveDown:"ArrowDown",openResult:"Enter",scrollUp:"PageUp",scrollDown:"PageDown"}};let R=null;function je(){return new Promise(e=>{chrome.storage.sync.get(["shortcuts"],t=>{t.shortcuts?R=t.shortcuts:R=JSON.parse(JSON.stringify(se)),e(R)})})}function ce(){return R||se}function h(e,t){const n=ce(),r=t.split(".");let o=n;for(const i of r)if(o=o[i],!o)return!1;if(typeof o=="object"){const i=o.meta?e.metaKey:!e.metaKey,a=o.ctrl?e.ctrlKey:!e.ctrlKey,s=o.shift?e.shiftKey:!e.shiftKey;return e.code===o.key&&i&&a&&s}return e.code===o&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey}const Ke=500,We=300,le=10,de=40,ue=100;let g=null,f=-1,x=[],G=null;function $(){return g!==null&&g.style.display==="block"&&x.length>0}function v(e){e.preventDefault(),e.stopPropagation(),e.stopImmediatePropagation()}function H(e){e==="next"?f=f<0?0:(f+1)%x.length:f=f<0||f<=0?x.length-1:f-1,he()}async function pe(e){if(!e||e.trim().length===0)return[];try{const t=encodeURIComponent(e.trim());return(await(await fetch(`https://www.google.co.jp/complete/search?output=firefox&hl=ja&ie=utf-8&oe=utf-8&q=${t}`)).json())[1]||[]}catch{return[]}}function Fe(){if(g)return g;const e=document.createElement("div");return e.className="gemini-autocomplete-list",e.style.cssText=`
    position: fixed;
    background: white;
    border: 1px solid #ddd;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    overflow-y: auto;
    z-index: 10000;
    display: none;
    min-width: 300px;
  `,document.body.appendChild(e),g=e,e}function Ve(e,t,n){const r=e.getBoundingClientRect();t.style.left=`${r.left}px`,t.style.width=`${r.width}px`,t.style.display="block";const o=window.innerHeight-r.bottom-le,i=r.top-le,a=Math.floor(o/de),s=Math.floor(i/de);a<n.length&&s>a?(t.style.bottom=`${window.innerHeight-r.top}px`,t.style.top="auto",t.style.maxHeight=`${Math.max(i,ue)}px`):(t.style.top=`${r.bottom}px`,t.style.bottom="auto",t.style.maxHeight=`${Math.max(o,ue)}px`)}function me(e,t){if(!t||t.length===0){w();return}const n=Fe();n.innerHTML="",x=t,f=-1,t.forEach((r,o)=>{const i=document.createElement("div");i.className="gemini-autocomplete-item",i.textContent=r,i.style.cssText=`
      padding: 10px 16px;
      cursor: pointer;
      font-size: 14px;
      border-bottom: 1px solid #f0f0f0;
    `,i.addEventListener("mouseenter",()=>{f=o,he()}),i.addEventListener("click",()=>{Y(e,r)}),n.appendChild(i)}),Ve(e,n,t)}function w(){g&&(g.style.display="none"),x=[],f=-1}function he(){if(!g)return;g.querySelectorAll(".gemini-autocomplete-item").forEach((t,n)=>{t.style.backgroundColor=n===f?"#e8f0fe":"transparent"})}function Y(e,t){if(e.contentEditable==="true"){for(;e.firstChild;)e.removeChild(e.firstChild);const n=document.createElement("p");n.textContent=t,e.appendChild(n),e.focus();const r=document.createRange(),o=window.getSelection();r.selectNodeContents(e),r.collapse(!1),o?.removeAllRanges(),o?.addRange(r),e.dispatchEvent(new Event("input",{bubbles:!0}))}else e.value=t,e.focus(),e.setSelectionRange(t.length,t.length),e.dispatchEvent(new Event("input",{bubbles:!0}));w()}function Q(){const e=document.querySelector('div[contenteditable="true"][role="textbox"]');if(!e){setTimeout(Q,Ke);return}e.addEventListener("keydown",async t=>{if(!(!t.isTrusted||t.isComposing)){if(t.metaKey&&t.code==="Space"){v(t);const r=(e.textContent||"").trim();if(r.length===0){w();return}const o=await pe(r);me(e,o);return}if($())if(t.key==="Tab"||t.key==="ArrowDown")v(t),H("next");else if(t.key==="ArrowUp")v(t),H("prev");else if(t.key==="Enter"){v(t);const n=f>=0?f:0;Y(e,x[n])}else t.key==="Escape"&&(t.preventDefault(),w())}},!0),document.addEventListener("click",t=>{g&&!g.contains(t.target)&&t.target!==e&&w()})}function fe(){if(!window.location.pathname.startsWith("/search"))return;let e=0;const t=10,n=setInterval(()=>{e++;const r=document.querySelector('input[data-test-id="search-input"]')||document.querySelector('input[type="text"][placeholder*="検索"]')||document.querySelector('input[type="text"]');r?(clearInterval(n),r.addEventListener("input",o=>{if(!o.isTrusted)return;if(G&&clearTimeout(G),(r.value||"").trim().length===0){w();return}G=setTimeout(async()=>{const s=(r.value||"").trim();if(s.length===0){w();return}const c=await pe(s);me(r,c)},We)}),r.addEventListener("keydown",o=>{!o.isTrusted||o.isComposing||$()&&(o.key==="Tab"||o.key==="ArrowDown"?(v(o),H("next")):o.key==="ArrowUp"?(v(o),H("prev")):o.key==="Enter"?f>=0&&(v(o),Y(r,x[f])):o.key==="Escape"&&(o.preventDefault(),w()))},!0),document.addEventListener("click",o=>{g&&!g.contains(o.target)&&o.target!==r&&w()})):e>=t&&clearInterval(n)},500)}let T=null,I=0;const Ge=5e3;function Ye(){const e=Date.now();if(T&&e-I<Ge)return T;const t=document.querySelector("infinite-scroller.chat-history");if(t&&t.scrollHeight>t.clientHeight)return T=t,I=e,t;if(document.documentElement.scrollHeight>document.documentElement.clientHeight)return T=document.documentElement,I=e,document.documentElement;const n=["infinite-scroller",'main[class*="main"]',".conversation-container",'[class*="chat-history"]','[class*="messages"]',"main",'[class*="scroll"]','div[class*="conversation"]'];for(const r of n){const o=document.querySelector(r);if(o&&o.scrollHeight>o.clientHeight)return T=o,I=e,o}return T=document.documentElement,I=e,document.documentElement}function ge(e){const t=Ye(),n=window.innerHeight*.1,r=e==="up"?-n:n;t===document.documentElement||t===document.body?window.scrollBy({top:r,behavior:"auto"}):t.scrollBy({top:r,behavior:"auto"})}function be(){const e=document.querySelector('div[contenteditable="true"][role="textbox"]')||document.querySelector('[contenteditable="true"]');if(e&&(e.focus(),e.contentEditable==="true")){const t=document.createRange(),n=window.getSelection();t.selectNodeContents(e),t.collapse(!1),n?.removeAllRanges(),n?.addRange(t)}}function Qe(){let e=0;const t=10,n=setInterval(()=>{e++;const r=document.querySelector('div[contenteditable="true"][role="textbox"]');if(r){for(clearInterval(n);r.firstChild;)r.removeChild(r.firstChild);const o=document.createElement("p");o.appendChild(document.createElement("br")),r.appendChild(o),r.focus(),r.dispatchEvent(new Event("input",{bubbles:!0}))}else e>=t&&clearInterval(n)},200)}function Xe(){const e=window.location.pathname;if(e!=="/app"&&e!=="/app/")return;const t=new URLSearchParams(window.location.search),n=t.get("q");if(!n)return;const r=t.get("send"),o=r===null||r==="true"||r==="1";let i=0;const a=20,s=setInterval(()=>{i++;const c=document.querySelector('div[contenteditable="true"][role="textbox"]');if(c){for(clearInterval(s);c.firstChild;)c.removeChild(c.firstChild);const l=document.createElement("p");l.textContent=n,c.appendChild(l),c.focus();const p=document.createRange(),u=window.getSelection();p.selectNodeContents(c),p.collapse(!1),u?.removeAllRanges(),u?.addRange(p),c.dispatchEvent(new Event("input",{bubbles:!0})),o&&setTimeout(()=>{const d=document.querySelector('button[aria-label*="送信"]')||document.querySelector('button[aria-label*="Send"]')||document.querySelector("button.send-button")||Array.from(document.querySelectorAll("button")).find(m=>m.getAttribute("aria-label")?.includes("送信")||m.getAttribute("aria-label")?.includes("Send"));d&&!d.disabled&&d.click()},500)}else i>=a&&clearInterval(s)},200)}function Je(e){const t=X();return t.length===0?!1:(e==="up"?t[t.length-1].focus():t[0].focus(),!0)}function Ze(e){const t=X(),n=t.findIndex(r=>r===document.activeElement);return n===-1?!1:e==="up"?(n>0&&(t[n-1].focus(),window.rememberActionButtonPosition?.(n-1)),!0):(n<t.length-1&&(t[n+1].focus(),window.rememberActionButtonPosition?.(n+1)),!0)}function X(){return Array.from(document.querySelectorAll('button.deep-dive-button-inline, button[data-action="deep-dive"]')).filter(t=>!(t.closest('[data-test-id*="user"]')||t.closest('[data-test-id*="prompt"]')||t.closest('[class*="user"]')))}function et(){return document.querySelector('[data-test-id="side-nav-toggle"]')||document.querySelector('button[aria-label*="メニュー"]')||document.querySelector('button[aria-label*="menu"]')||document.querySelector('button[aria-label*="Menu"]')}function tt(){const e=et();e&&e.click()}function nt(){setTimeout(()=>{Xe()},1e3),setTimeout(()=>{Q()},1500),new MutationObserver(()=>{document.querySelector('[aria-busy="true"]')&&window.rememberActionButtonPosition?.(-1)}).observe(document.body,{attributes:!0,attributeFilter:["aria-busy"],subtree:!0})}let E=0,U=!1;function J(){return Array.from(document.querySelectorAll('.conversation-items-container .conversation[data-test-id="conversation"]'))}function Z(e){const t=J();if(t.length===0)return;E=Math.max(0,Math.min(e,t.length-1)),t.forEach(r=>{r.style.outline="",r.style.outlineOffset=""});const n=t[E];n&&(n.style.outline="2px solid #1a73e8",n.style.outlineOffset="-2px",n.scrollIntoView({block:"nearest",behavior:"auto"}))}function ot(){Z(E-1)}function rt(){Z(E+1)}function it(){const e=J();e.length===0||!e[E]||(e[E].click(),U=!1,e.forEach(t=>{t.style.outline="",t.style.outlineOffset=""}),Qe())}function O(){U=!1,J().forEach(t=>{t.style.outline="",t.style.outlineOffset=""})}function ye(){U=!0,document.activeElement&&document.activeElement.blur(),Z(E)}function q(){return U}let S=0;function M(){return window.location.pathname.startsWith("/search")}function ee(){let e=Array.from(document.querySelectorAll('search-snippet[tabindex="0"]'));return e.length===0&&(e=Array.from(document.querySelectorAll("search-snippet"))),e.length===0&&(e=Array.from(document.querySelectorAll('div.conversation-container[role="option"]'))),e.length===0&&(e=Array.from(document.querySelectorAll('[role="option"].conversation-container'))),e}function te(e){const t=ee();if(t.length===0)return;S=Math.max(0,Math.min(e,t.length-1)),t.forEach(r=>{r.style.outline="",r.style.outlineOffset=""});const n=t[S];n&&(n.style.outline="2px solid #1a73e8",n.style.outlineOffset="-2px",n.scrollIntoView({block:"nearest",behavior:"auto"}))}function at(){te(S-1);const e=document.querySelector('input[data-test-id="search-input"]');e&&e.focus()}function st(){te(S+1);const e=document.querySelector('input[data-test-id="search-input"]');e&&e.focus()}function ct(){const e=ee();if(e.length===0||!e[S])return;const t=e[S],n=t.querySelector("div[jslog]");if(n){n.click(),["mousedown","mouseup","click"].forEach(o=>{n.dispatchEvent(new MouseEvent(o,{view:window,bubbles:!0,cancelable:!0}))}),setTimeout(()=>{t.click()},100);return}const r=t.querySelector("a[href]");if(r){r.click();return}t.click(),["mousedown","mouseup","click"].forEach(o=>{t.dispatchEvent(new MouseEvent(o,{view:window,bubbles:!0,cancelable:!0}))})}function lt(){if(!M())return;let e=0;const t=10,n=setInterval(()=>{e++,ee().length>0?(S=0,te(0),clearInterval(n)):e>=t&&clearInterval(n)},500)}function dt(){history.pushState(null,"","/search?hl=ja"),window.dispatchEvent(new PopStateEvent("popstate",{state:null}))}function we(){M()?history.back():(O(),dt())}const xe="gemini-export-note-button";let y=null;function ve(){return new Promise((e,t)=>{const n=indexedDB.open("gemini-export",1);n.onupgradeneeded=r=>{r.target.result.createObjectStore("handles")},n.onsuccess=r=>e(r.target.result),n.onerror=()=>t(n.error)})}async function ut(){try{const e=await ve();return new Promise(t=>{const r=e.transaction("handles","readonly").objectStore("handles").get("save_dir");r.onsuccess=()=>t(r.result||null),r.onerror=()=>t(null)})}catch{return null}}async function Ee(e){try{const t=await ve();await new Promise((n,r)=>{const o=t.transaction("handles","readwrite");o.objectStore("handles").put(e,"save_dir"),o.oncomplete=()=>n(),o.onerror=()=>r(o.error)})}catch{}}async function pt(){if(y&&await y.queryPermission({mode:"readwrite"})==="granted")return y;const e=await ut();if(e&&(await e.queryPermission({mode:"readwrite"})==="granted"||await e.requestPermission({mode:"readwrite"})==="granted"))return y=e,y;const t=await window.showDirectoryPicker({mode:"readwrite"});return await Ee(t),y=t,y}function mt(e){const t=new Set(["button","svg","path","mat-icon"]);function n(o){if(o.nodeType===Node.TEXT_NODE)return o.textContent||"";if(o.nodeType!==Node.ELEMENT_NODE)return"";const i=o,a=i.tagName.toLowerCase();if(t.has(a))return"";const s=()=>Array.from(i.childNodes).map(n).join(""),c=a.match(/^h([1-6])$/);if(c){const l="#".repeat(Number(c[1])),p=s().trim();return`
${l} ${p}

`}switch(a){case"p":return s()+`

`;case"br":return`
`;case"hr":return`
---

`;case"ul":case"ol":return s()+`
`;case"li":return`- ${s().replace(/\n+$/,"")}
`;case"b":case"strong":return`**${s()}**`;case"i":case"em":return`*${s()}*`;case"code":return`\`${s()}\``;case"pre":return`\`\`\`
${s()}
\`\`\`

`;case"table":return r(i)+`

`;case"thead":case"tbody":case"tr":case"td":case"th":return"";default:return s()}}function r(o){const i=Array.from(o.querySelectorAll("tr"));if(i.length===0)return"";const a=u=>Array.from(u.querySelectorAll("td, th")).map(d=>Array.from(d.childNodes).map(n).join("").replace(/\n+/g," ").trim()),[s,...c]=i,l=a(s),p=l.map(()=>"---");return[`| ${l.join(" | ")} |`,`| ${p.join(" | ")} |`,...c.map(u=>`| ${a(u).join(" | ")} |`)].join(`
`)}return Array.from(e.childNodes).map(n).join("").replace(/\n{3,}/g,`

`).trim()}const ht=[/^[+＋]$/,/^Google スプレッドシートにエクスポート$/,/^Google Sheets にエクスポート$/,/^Export to Sheets$/];function ft(e){return e.split(`
`).filter(t=>!ht.some(n=>n.test(t.trim()))).join(`
`).replace(/\n{3,}/g,`

`).trim()}async function gt(){const e=document.querySelector("infinite-scroller.chat-history");if(!e)return;P("メッセージを読み込み中...");let t=0;for(let n=0;n<30;n++){e.scrollTop=0,await new Promise(o=>setTimeout(o,400));const r=document.querySelectorAll("user-query").length;if(r===t)break;t=r}e.scrollTop=e.scrollHeight}function bt(){const e=Array.from(document.querySelectorAll("user-query")),t=Array.from(document.querySelectorAll("model-response")),n=[],r=Math.min(e.length,t.length);for(let o=0;o<r;o++){const i=Array.from(e[o].querySelectorAll(".query-text-line")).map(l=>l.innerText.trim()).filter(Boolean).join(`
`),a=t[o].querySelector("message-content .markdown"),s=a?mt(a).trim():void 0,c=s?ft(s):"";(i||c)&&n.push({user:i||"",model:c||""})}return n}function ne(){return location.pathname.split("/").pop()||"unknown"}function _(e){return'"'+e.replace(/\\/g,"\\\\").replace(/"/g,'\\"')+'"'}function Se(e,t){return e.split(`
`).map(n=>n===""?"":t+n).join(`
`)}function yt(e){const t=new Date,n=d=>String(d).padStart(2,"0"),o=`${`${t.getFullYear()}-${n(t.getMonth()+1)}-${n(t.getDate())}`}T${n(t.getHours())}:${n(t.getMinutes())}:${n(t.getSeconds())}`,i=o.replace(/[-:T]/g,""),a=document.querySelector('[data-test-id="conversation-title"]')?.innerText?.trim(),s=(e[0]?.user||"").split(`
`).map(d=>d.trim()).filter(Boolean),c=s.find(d=>!/^https?:\/\//i.test(d))||s[0]||"Gemini chat",l=(a||c).slice(0,60),p=ne(),u=[`id: ${_(p)}`,`title: ${_("Gemini: "+l)}`,`date: ${_(o)}`,`source: ${_(location.href)}`,"tags:","  - gemini","  - fleeting","turns:"];for(const d of e)u.push("  - q: |"),u.push(Se(d.user,"      ")),u.push("    a: |"),u.push(Se(d.model,"      "));return{markdown:u.join(`
`),id:i,title:l}}async function Ae(e=!1){await gt();const t=bt();if(t.length===0){P("保存できる会話が見つかりません","error");return}let n;try{if(e){const c=await window.showDirectoryPicker({mode:"readwrite"});await Ee(c),y=c,n=c,P(`保存先を変更: ${c.name}`)}else n=await pt()}catch{return}const{markdown:r,title:o}=yt(t),i=ne(),s=`gemini-${o.replace(/[\\/:*?"<>|]/g,"").replace(/\s+/g,"-").slice(0,40)}-${i}.yaml`;try{const p=await(await(await n.getDirectoryHandle("inbox",{create:!0})).getFileHandle(s,{create:!0})).createWritable();await p.write(r),await p.close(),P(`保存しました: inbox/${s}`)}catch{P("保存に失敗しました","error")}}function P(e,t="success"){const n=document.getElementById("gemini-export-notification");n&&n.remove();const r=document.createElement("div");r.id="gemini-export-notification",r.style.cssText=`
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: ${t==="error"?"#c62828":"#1b5e20"};
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    z-index: 10000;
    font-family: system-ui, sans-serif;
    font-size: 13px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  `,r.textContent=e,document.body.appendChild(r),setTimeout(()=>r.remove(),3e3)}function wt(){if(document.getElementById(xe)||!(document.querySelector("input-area-v2")||document.querySelector("input-container")))return;const t=document.createElement("button");t.id=xe,t.title=`Save as Zettelkasten note
Shift+クリックで保存先を変更`,t.textContent="💾 Save note",t.style.cssText=`
    position: fixed;
    bottom: 100px;
    right: 24px;
    background: #1a73e8;
    color: white;
    border: none;
    border-radius: 20px;
    padding: 8px 16px;
    font-size: 13px;
    font-family: system-ui, sans-serif;
    cursor: pointer;
    z-index: 9999;
    box-shadow: 0 2px 8px rgba(0,0,0,0.25);
    transition: background 0.2s;
  `,t.addEventListener("mouseenter",()=>{t.style.background="#1557b0"}),t.addEventListener("mouseleave",()=>{t.style.background="#1a73e8"}),t.addEventListener("click",n=>Ae(n.shiftKey)),document.body.appendChild(t)}function Ce(){ne()!=="app"&&wt()}let oe=-1;function xt(e){oe=e}function vt(e){if($()&&(e.key==="ArrowUp"||e.key==="ArrowDown"||e.key==="Enter"||e.key==="Tab"||e.key==="Escape"))return!1;if(h(e,"chat.navigateToSearch"))return e.preventDefault(),we(),!0;if(h(e,"search.moveUp"))return e.preventDefault(),e.stopPropagation(),e.stopImmediatePropagation(),at(),!0;if(h(e,"search.moveDown"))return e.preventDefault(),e.stopPropagation(),e.stopImmediatePropagation(),st(),!0;if(h(e,"search.openResult"))return e.isComposing?!1:(e.preventDefault(),e.stopPropagation(),e.stopImmediatePropagation(),ct(),!0);if(h(e,"search.scrollUp"))return e.preventDefault(),window.scrollBy({top:-window.innerHeight*.8,behavior:"auto"}),!0;if(h(e,"search.scrollDown"))return e.preventDefault(),window.scrollBy({top:window.innerHeight*.8,behavior:"auto"}),!0;const t=ce();return!!Object.values(t.chat).includes(e.code)}function Et(e){const t=e.target.matches('input, textarea, [contenteditable="true"]');if($()&&(e.key==="ArrowUp"||e.key==="ArrowDown"||e.key==="Enter"||e.key==="Tab"||e.key==="Escape"))return!1;if(e.code==="Home"&&!e.metaKey&&!e.ctrlKey&&!t)return e.preventDefault(),Ae(e.shiftKey),!0;if(e.ctrlKey&&e.shiftKey&&e.code==="KeyD")return e.preventDefault(),window.domAnalyzer?.copyToClipboard(),!0;if(h(e,"chat.navigateToSearch"))return e.preventDefault(),we(),!0;if(h(e,"chat.toggleSidebar"))return e.preventDefault(),tt(),!0;if(h(e,"chat.toggleHistoryMode")){e.preventDefault();const n=X(),r=n.length>0;if(q())O(),be();else if(t)if(r){let o=oe;(o<0||o>=n.length)&&(o=n.length-1),n[o].focus()}else ye();else{const o=document.activeElement;if(o&&(o.classList?.contains("deep-dive-button-inline")||o.getAttribute("data-action")==="deep-dive")){const a=n.findIndex(s=>s===o);a!==-1&&(oe=a),ye()}else be()}return!0}if(q()&&h(e,"chat.historyExit"))return e.preventDefault(),O(),!0;if(h(e,"chat.scrollUp"))return e.preventDefault(),ge("up"),!0;if(h(e,"chat.scrollDown"))return e.preventDefault(),ge("down"),!0;if(q()){if(h(e,"chat.historyUp"))return e.preventDefault(),ot(),!0;if(h(e,"chat.historyDown"))return e.preventDefault(),rt(),!0;if(h(e,"chat.historyOpen"))return e.preventDefault(),it(),!0}if(!q()&&t&&(h(e,"chat.historyUp")||h(e,"chat.historyDown"))){const n=document.querySelector('div[contenteditable="true"][role="textbox"]');if(n&&n.textContent?.trim()===""){e.preventDefault();const r=h(e,"chat.historyUp")?"up":"down";return Je(r),!0}}if(!q()&&!t){const n=document.activeElement;if(n&&(n.classList?.contains("deep-dive-button-inline")||n.getAttribute("data-action")==="deep-dive")){if(h(e,"chat.historyUp")||h(e,"chat.historyDown")){e.preventDefault();const o=h(e,"chat.historyUp")?"up":"down";return Ze(o),!0}if(e.key==="ArrowRight"||e.key==="ArrowLeft"){e.preventDefault();const o=n._expandButton,i=n._deepDiveTarget;if(o&&i){const a=o.getAttribute("data-action")==="collapse";(e.key==="ArrowRight"&&!a||e.key==="ArrowLeft"&&a)&&o.click()}return!0}if(h(e,"chat.historyOpen"))return e.preventDefault(),n.click(),!0}}return!1}function St(){je().then(()=>{document.addEventListener("keydown",e=>{if(M()){vt(e);return}Et(e)},!0)})}const z=[{id:"default",prompt:"これについて詳しく"}];function Te(){const e=document.querySelectorAll(".markdown-main-panel");e.length!==0&&e.forEach(t=>{const n=[],r=t.querySelectorAll("h1[data-path-to-node], h2[data-path-to-node], h3[data-path-to-node], h4[data-path-to-node], h5[data-path-to-node], h6[data-path-to-node]");r.length>0?(r.forEach(a=>{a.querySelector(".deep-dive-button-inline")||n.push({type:"section",element:a,getContent:()=>At(a)})}),t.querySelectorAll("table[data-path-to-node]").forEach(a=>{const s=a.closest(".table-block-component");s&&!s.querySelector(".deep-dive-button-inline")&&n.push({type:"table",element:s,getContent:()=>De(a)})})):(t.querySelectorAll("table[data-path-to-node]").forEach(c=>{const l=c.closest(".table-block-component");l&&!l.querySelector(".deep-dive-button-inline")&&n.push({type:"table",element:l,getContent:()=>De(c)})}),t.querySelectorAll("blockquote[data-path-to-node]").forEach(c=>{c.querySelector(".deep-dive-button-inline")||n.push({type:"blockquote",element:c,getContent:()=>c.textContent?.trim()??""})}),t.querySelectorAll("ol[data-path-to-node], ul[data-path-to-node]").forEach(c=>{if(c.querySelector(".deep-dive-button-inline"))return;let l=c.parentElement,p=!1;for(;l&&l!==t;){if((l.tagName==="OL"||l.tagName==="UL")&&l.hasAttribute("data-path-to-node")){p=!0;break}l=l.parentElement}p||n.push({type:"list",element:c,getContent:()=>Ct(c)})})),n.forEach(i=>Tt(i))})}function At(e){let t=(e.textContent?.trim()??"")+`

`,n=e.nextElementSibling;for(;n&&!n.matches("h1, h2, h3, h4, h5, h6, hr");){if(n.classList.contains("table-block-component")){n=n.nextElementSibling;continue}t+=(n.textContent?.trim()??"")+`

`,n=n.nextElementSibling}return t.trim()}function De(e){let t="";return e.querySelectorAll("tr").forEach((r,o)=>{const i=r.querySelectorAll("td, th"),a=Array.from(i).map(s=>s.textContent?.trim()??"");t+="| "+a.join(" | ")+` |
`,o===0&&(t+="| "+a.map(()=>"---").join(" | ")+` |
`)}),t.trim()}function Ct(e){return e.textContent?.trim()??""}function Tt(e){const t=document.createElement("button");t.className="deep-dive-button-inline",t.setAttribute("aria-label","Deep dive into this content"),t.setAttribute("data-action","deep-dive"),t.title="Deep dive into this content",t._deepDiveTarget=e;const n=document.createElementNS("http://www.w3.org/2000/svg","svg");n.setAttribute("width","16"),n.setAttribute("height","16"),n.setAttribute("viewBox","0 0 24 24"),n.setAttribute("fill","currentColor");const r=document.createElementNS("http://www.w3.org/2000/svg","path");r.setAttribute("d","M19 15l-6 6-1.5-1.5L15 16H4V9h2v5h9l-3.5-3.5L13 9l6 6z"),n.appendChild(r),t.appendChild(n),t.addEventListener("click",i=>{i.preventDefault(),i.stopPropagation(),qe(e,i.ctrlKey)}),t.addEventListener("keydown",i=>{i.altKey&&i.key==="ArrowRight"&&(i.preventDefault(),i.stopPropagation(),ke(t,e))});let o=null;if((e.type==="section"||e.type==="list")&&(o=Dt(e),t._expandButton=o),e.type==="section")e.element.style.position="relative",e.element.style.display="flex",e.element.style.alignItems="center",e.element.style.gap="8px",e.element.appendChild(t),o&&e.element.appendChild(o);else if(e.type==="table"){const i=e.element.querySelector(".table-footer");if(i){const a=i.querySelector(".copy-button");a?i.insertBefore(t,a):i.appendChild(t)}}else e.type==="blockquote"?(e.element.style.position="relative",t.style.position="absolute",t.style.top="8px",t.style.right="8px",e.element.appendChild(t)):e.type==="list"&&(e.element.style.position="relative",t.style.position="absolute",t.style.top="0",t.style.right="0",e.element.appendChild(t),o&&(o.style.position="absolute",o.style.top="0",o.style.right="32px",e.element.appendChild(o)))}function Dt(e){const t=document.createElement("button");return t.className="deep-dive-expand-button",t.setAttribute("aria-label","Expand to select"),t.setAttribute("data-action","expand"),t.setAttribute("tabindex","-1"),t.title="Expand to select",t.textContent="+",t.style.fontSize="14px",t.style.fontWeight="bold",t.dataset.targetId=Math.random().toString(36).substr(2,9),e.expandButtonId=t.dataset.targetId,t.addEventListener("click",n=>{n.preventDefault(),n.stopPropagation(),kt(e,t)}),t}function kt(e,t){t.getAttribute("data-action")==="collapse"?(qt(e),t.setAttribute("data-action","expand"),t.setAttribute("aria-label","Expand to select"),t.title="Expand to select",t.textContent="+"):(It(e),t.setAttribute("data-action","collapse"),t.setAttribute("aria-label","Collapse"),t.title="Collapse",t.textContent="-")}function It(e){if(e.type==="section"){let n=e.element.nextElementSibling;for(;n&&!n.matches("h1, h2, h3, h4, h5, h6, hr");){if(n.classList.contains("table-block-component")){n=n.nextElementSibling;continue}n.tagName==="P"&&!n.querySelector(".deep-dive-child-button")&&re(n),(n.tagName==="UL"||n.tagName==="OL")&&n.hasAttribute("data-path-to-node")&&n.querySelectorAll(":scope > li").forEach(o=>{o.querySelector(".deep-dive-child-button")||re(o)}),n=n.nextElementSibling}}else e.type==="list"&&e.element.querySelectorAll(":scope > li").forEach(n=>{n.querySelector(".deep-dive-child-button")||re(n)})}function re(e){e.style.position="relative";const t=document.createElement("button");t.className="deep-dive-button-inline deep-dive-child-button",t.setAttribute("aria-label","Deep dive into this content"),t.setAttribute("data-action","deep-dive"),t.title="Deep dive into this content",t.style.position="absolute",t.style.top="0",t.style.right="0";const n=document.createElementNS("http://www.w3.org/2000/svg","svg");n.setAttribute("width","16"),n.setAttribute("height","16"),n.setAttribute("viewBox","0 0 24 24"),n.setAttribute("fill","currentColor");const r=document.createElementNS("http://www.w3.org/2000/svg","path");r.setAttribute("d","M19 15l-6 6-1.5-1.5L15 16H4V9h2v5h9l-3.5-3.5L13 9l6 6z"),n.appendChild(r),t.appendChild(n);const o={type:"child",element:e,getContent:()=>e.textContent?.trim()??""};t.addEventListener("click",i=>{i.preventDefault(),i.stopPropagation(),qe(o,i.ctrlKey)}),t.addEventListener("keydown",i=>{i.altKey&&i.key==="ArrowRight"&&(i.preventDefault(),i.stopPropagation(),ke(t,o))}),e.appendChild(t)}function qt(e){if(e.type==="section"){let n=e.element.nextElementSibling;for(;n&&!n.matches("h1, h2, h3, h4, h5, h6, hr");){if(n.classList.contains("table-block-component")){n=n.nextElementSibling;continue}n.querySelectorAll(".deep-dive-child-button").forEach(r=>r.remove()),n=n.nextElementSibling}}else e.type==="list"&&e.element.querySelectorAll(".deep-dive-child-button").forEach(t=>t.remove())}async function ke(e,t){j();const n=await new Promise(m=>{chrome.storage.sync.get(["deepDiveModes","currentDeepDiveModeId","deepDiveRecentModes"],m)}),r=n.deepDiveModes&&n.deepDiveModes.length>0?n.deepDiveModes:z,o=n.deepDiveRecentModes||[],i=[...r].sort((m,V)=>{const B=o.indexOf(m.id),b=o.indexOf(V.id);return B===-1&&b===-1?0:B===-1?1:b===-1?-1:B-b}),a=document.createElement("div");a.className="deep-dive-template-popup",a.id="deep-dive-template-popup",a.setAttribute("role","menu");const s=(m,V,B)=>{const b=document.createElement("button");return b.className="deep-dive-template-item",b.setAttribute("role","menuitem"),b.textContent=m,V&&(b.title=V),b.addEventListener("mousedown",L=>{L.preventDefault(),L.stopPropagation()}),b.addEventListener("click",L=>{L.preventDefault(),L.stopPropagation(),j(),B()}),b};i.forEach(m=>{a.appendChild(s(m.id,m.prompt||"",()=>Mt(t,m)))}),document.body.appendChild(a);const c=e.getBoundingClientRect(),l=160;let p=c.left+window.scrollX;p+l>window.innerWidth-8&&(p=window.innerWidth-l-8),a.style.top=`${c.bottom+window.scrollY+4}px`,a.style.left=`${p}px`;const u=Array.from(a.querySelectorAll(".deep-dive-template-item"));let d=0;u[0]?.focus(),a.addEventListener("keydown",m=>{m.key==="Escape"||m.altKey&&m.key==="ArrowLeft"?(m.preventDefault(),j(),e.focus()):m.key==="ArrowDown"?(m.preventDefault(),d=(d+1)%u.length,u[d].focus()):m.key==="ArrowUp"?(m.preventDefault(),d=(d-1+u.length)%u.length,u[d].focus()):m.key==="Tab"&&(m.preventDefault(),m.shiftKey?d=(d-1+u.length)%u.length:d=(d+1)%u.length,u[d].focus())}),setTimeout(()=>{document.addEventListener("click",j,{once:!0})},0)}function j(){document.getElementById("deep-dive-template-popup")?.remove()}function Ie(e,t){const n=document.querySelector('div[contenteditable="true"][role="textbox"]');if(!n)return;for(;n.firstChild;)n.removeChild(n.firstChild);e.split(`
`).forEach(i=>{const a=document.createElement("p");i.trim()===""?a.appendChild(document.createElement("br")):a.textContent=i,n.appendChild(a)}),n.focus();const r=document.createRange(),o=window.getSelection();r.selectNodeContents(n),r.collapse(!1),o?.removeAllRanges(),o?.addRange(r),n.dispatchEvent(new Event("input",{bubbles:!0})),t&&setTimeout(()=>{const i=document.querySelector('button[aria-label*="送信"], button[aria-label*="Send"]');i&&!i.disabled&&i.click()},100)}function Mt(e,t){const o=e.getContent().split(`
`).map(i=>`> ${i}`).join(`
`)+`

`+(t.prompt||"これについて詳しく");Ie(o,!0),chrome.storage.sync.get(["deepDiveRecentModes"],i=>{const a=(i.deepDiveRecentModes||[]).filter(s=>s!==t.id);a.unshift(t.id),chrome.storage.sync.set({deepDiveRecentModes:a.slice(0,20)})})}async function qe(e,t=!1){if(!document.querySelector('div[contenteditable="true"][role="textbox"]'))return;const r=e.getContent().split(`
`).map(a=>`> ${a}`).join(`
`);let o,i=!1;if(t)o=r+`

`;else{const a=await new Promise(d=>{chrome.storage.sync.get(["deepDiveModes","currentDeepDiveModeId"],d)}),s=a.deepDiveModes&&a.deepDiveModes.length>0?a.deepDiveModes:z;let p=new URLSearchParams(location.search).get("mode_id")||a.currentDeepDiveModeId||s[0]?.id;s.some(d=>d.id===p)||(p=s[0]?.id);const u=s.find(d=>d.id===p)||s[0]||z[0];o=r+`

`+(u.prompt||"これについて詳しく"),i=!0}Ie(o,i)}function Pt(){const e="gemini-deep-dive-styles";if(document.getElementById(e))return;const t=document.createElement("style");t.id=e,t.textContent=`
    .deep-dive-button-inline {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      padding: 0;
      border: none;
      border-radius: 14px;
      background: transparent;
      color: #5f6368;
      cursor: pointer;
      transition: all 0.2s;
      flex-shrink: 0;
    }
    .deep-dive-button-inline:hover {
      background: rgba(0, 0, 0, 0.05);
      color: #1a73e8;
    }
    .deep-dive-button-inline:focus {
      outline: 2px solid #1a73e8;
      outline-offset: 2px;
    }
    .deep-dive-button-inline svg {
      width: 16px;
      height: 16px;
    }
    .deep-dive-expand-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      padding: 0;
      border: none;
      border-radius: 14px;
      background: transparent;
      color: #5f6368;
      cursor: pointer;
      transition: all 0.2s;
      flex-shrink: 0;
      font-size: 14px;
      font-weight: bold;
    }
    .deep-dive-expand-button:hover {
      background: rgba(0, 0, 0, 0.05);
      color: #1a73e8;
    }
    .deep-dive-expand-button:focus {
      outline: 2px solid #1a73e8;
      outline-offset: 2px;
    }
    blockquote[data-path-to-node] {
      padding-top: 40px;
    }
    .gemini-deep-dive-mode-selector {
      display: inline-flex !important;
      align-items: center;
      padding: 0 8px;
      margin: 0 4px;
      flex-shrink: 0;
      white-space: nowrap;
      vertical-align: middle;
    }
    body > .gemini-deep-dive-mode-selector {
      position: fixed;
      bottom: 100px;
      left: 320px;
      z-index: 9999;
    }
    .gemini-deep-dive-mode-selector select {
      padding: 4px 8px;
      border: 1px solid #dadce0;
      border-radius: 8px;
      background: #fff;
      font-size: 13px;
      color: #5f6368;
      cursor: pointer;
      max-width: 100px;
    }
    .gemini-deep-dive-mode-selector select:hover {
      border-color: #1a73e8;
      color: #1a73e8;
    }
    .deep-dive-template-popup {
      position: absolute;
      z-index: 99999;
      display: flex;
      flex-direction: column;
      min-width: 160px;
      padding: 4px 0;
      background: #fff;
      border: 1px solid #dadce0;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      outline: none;
    }
    .deep-dive-template-item {
      display: block;
      width: 100%;
      padding: 7px 14px;
      border: none;
      background: transparent;
      text-align: left;
      font-size: 13px;
      color: #3c4043;
      cursor: pointer;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .deep-dive-template-item:hover,
    .deep-dive-template-item:focus {
      background: #f1f3f4;
      color: #1a73e8;
      outline: none;
    }
  `,document.head.appendChild(t)}function Me(){const e=document.getElementById("gemini-deep-dive-mode-selector");e&&e.remove(),chrome.storage.sync.get(["deepDiveModes","currentDeepDiveModeId"],t=>{const n=t.deepDiveModes&&t.deepDiveModes.length>0?t.deepDiveModes:z,r=document.createElement("div");r.id="gemini-deep-dive-mode-selector",r.className="gemini-deep-dive-mode-selector";const o=document.createElement("select");o.id="gemini-deep-dive-mode",o.title="深掘りモード",o.setAttribute("aria-label","深掘りモード"),n.forEach(u=>{const d=document.createElement("option");d.value=u.id,d.textContent=u.id,o.appendChild(d)}),o.addEventListener("change",()=>{chrome.storage.sync.set({currentDeepDiveModeId:o.value})}),r.appendChild(o);const i=document.querySelector('button[aria-label*="ファイル"], button[aria-label*="追加"]'),s=document.querySelector('button[aria-label*="ツール"], button[aria-label*="Tool"]')||i&&i.nextElementSibling;if(s&&s.parentElement)s.parentElement.insertBefore(r,s.nextSibling);else{const u=document.querySelector('div[contenteditable="true"][role="textbox"]');if(u){const d=u.closest("form")||u.parentElement?.parentElement;d?d.insertBefore(r,d.firstChild):document.body.appendChild(r)}else document.body.appendChild(r)}const l=new URLSearchParams(location.search).get("mode_id");let p=t.currentDeepDiveModeId;l&&n.some(u=>u.id===l)&&(p=l,chrome.storage.sync.set({currentDeepDiveModeId:l})),p&&n.some(u=>u.id===p)?o.value=p:n.length>0&&(o.value=n[0].id)})}let ie=null;function Bt(){Pt();const e=()=>{document.querySelector('button[aria-label*="ツール"], button[aria-label*="Tool"], button[aria-label*="ファイル"], button[aria-label*="追加"]')||document.querySelector('div[contenteditable="true"][role="textbox"]')?Me():setTimeout(e,500)};e(),chrome.storage.onChanged.addListener((n,r)=>{r==="sync"&&n.deepDiveModes&&location.href.includes("gemini.google.com")&&document.querySelector('button[aria-label*="ツール"], button[aria-label*="Tool"], div[contenteditable="true"][role="textbox"]')&&Me()}),new MutationObserver(n=>{let r=!1;for(const o of n){if(o.addedNodes.length>0){for(const i of o.addedNodes)if(i.nodeType===1){const a=i;if(a.matches?.("[data-path-to-node]")||a.querySelector?.("[data-path-to-node]")){r=!0;break}}}if(r)break}r&&(ie&&clearTimeout(ie),ie=setTimeout(()=>Te(),500))}).observe(document.body,{childList:!0,subtree:!0}),setTimeout(()=>Te(),1e3)}let K=!1;const D="gemini-map-panel",Pe="gemini-map-styles";function Lt(){if(document.getElementById(Pe))return;const e=document.createElement("style");e.id=Pe,e.textContent=`
    #gemini-map-panel {
      position: fixed;
      right: 16px;
      top: 60px;
      bottom: 16px;
      width: 240px;
      background: rgba(248, 249, 250, 0.95);
      border: 1px solid rgba(0, 0, 0, 0.1);
      border-radius: 12px;
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
      overflow-y: auto;
      z-index: 100;
      padding: 6px 4px;
      font-family: inherit;
      backdrop-filter: blur(8px);
    }
    .dark-theme #gemini-map-panel {
      background: rgba(32, 33, 36, 0.95);
      border-color: rgba(255, 255, 255, 0.12);
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.4);
    }
    #gemini-map-panel .map-header {
      display: none;
    }
    #gemini-map-panel ul {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    #gemini-map-panel li button {
      display: block;
      width: 100%;
      text-align: left;
      background: none;
      border: none;
      border-left: 2px solid transparent;
      border-radius: 0 6px 6px 0;
      padding: 5px 10px 5px 8px;
      margin: 1px 0;
      cursor: pointer;
      font-size: 15px;
      line-height: 1.35;
      color: inherit;
      font-family: inherit;
      word-break: break-word;
      opacity: 0.5;
      transition: background 0.15s, opacity 0.15s, border-color 0.15s;
    }
    #gemini-map-panel li button:hover {
      background: rgba(128, 128, 128, 0.12);
      opacity: 0.85;
    }
    #gemini-map-panel li button.map-item-current {
      opacity: 1;
      background: rgba(26, 115, 232, 0.08);
      border-left-color: #1a73e8;
    }
    #gemini-map-panel li button .map-turn-index {
      display: inline-block;
      min-width: 18px;
      font-size: 10px;
      opacity: 0.5;
      margin-right: 3px;
    }
  `,document.head.appendChild(e)}function Nt(e){let n=e.querySelector('h1, h2, h3, [role="heading"]')?.textContent?.trim()||e.textContent?.trim()||"";return n=n.replace(/^あなたのプロンプト\s*/,""),n=n.replace(/^>\s*/,""),n.substring(0,60)||"(空)"}function Be(){return Array.from(document.querySelectorAll("infinite-scroller.chat-history > .conversation-container"))}function Le(){const e=document.createElement("div");e.id=D;const t=document.createElement("div");t.className="map-header",t.textContent="このチャットの流れ",e.appendChild(t);const n=Be();if(n.length===0){const o=document.createElement("div");return o.style.cssText="padding: 10px; opacity: 0.45; font-size: 12px;",o.textContent="チャットがまだありません",e.appendChild(o),e}const r=document.createElement("ul");return n.forEach((o,i)=>{const a=o.querySelector("user-query");if(!a)return;const s=Nt(a),c=document.createElement("li"),l=document.createElement("button"),p=document.createElement("span");p.className="map-turn-index",p.textContent=`${i+1}.`,l.appendChild(p),l.appendChild(document.createTextNode(s)),l.addEventListener("click",()=>{o.scrollIntoView({behavior:"smooth",block:"start"})}),c.appendChild(l),r.appendChild(c)}),e.appendChild(r),e}function Rt(){const e=document.getElementById(D);return e?Array.from(e.querySelectorAll("li button")):[]}let A=null;const k=new Set;function Ne(){A&&A.disconnect(),k.clear();const e=Be();e.length!==0&&(A=new IntersectionObserver(t=>{t.forEach(o=>{const i=e.indexOf(o.target);i!==-1&&(o.isIntersecting?k.add(i):k.delete(i))});const n=Rt();if(n.forEach((o,i)=>{o.classList.toggle("map-item-current",k.has(i))}),document.getElementById(D)){const o=n.find((i,a)=>k.has(a));o&&o.scrollIntoView({block:"nearest",behavior:"smooth"})}},{threshold:.15}),e.forEach(t=>A.observe(t)))}function Re(){A&&(A.disconnect(),A=null),k.clear()}let C=null;function $t(){C&&C.disconnect();const e=document.querySelector("infinite-scroller.chat-history");if(!e)return;let t=null;C=new MutationObserver(()=>{K&&(t&&clearTimeout(t),t=setTimeout(()=>Ut(),300))}),C.observe(e,{childList:!0,subtree:!1})}function Ht(){C&&(C.disconnect(),C=null)}function Ut(){if(!K)return;const e=document.getElementById(D),t=e?e.scrollTop:0;e&&e.remove(),Re();const n=Le();document.body.appendChild(n),n.scrollTop=t,Ne()}function $e(){Lt();const e=document.getElementById(D);e&&e.remove();const t=Le();document.body.appendChild(t),K=!0,Ne(),$t()}function Ot(){Ht(),Re();const e=document.getElementById(D);e&&e.remove(),K=!1}class _t{constructor(){this.elementSelectors={textarea:['[role="textbox"][contenteditable="true"]','[aria-label*="プロンプト"]',".ql-editor.textarea",'rich-textarea [contenteditable="true"]'],sidebar:['[role="navigation"]',"bard-sidenav",".side-nav-container","aside"],sidebarToggle:['button[aria-label*="メインメニュー"]','button[aria-label*="Main menu"]','button[data-test-id="side-nav-menu-button"]'],chatHistory:['.conversation[role="button"]','[data-test-id="conversation"]',".conversation-items-container .conversation"],newChatButton:['a[href="https://gemini.google.com/app"]','a[aria-label*="新規作成"]','[data-test-id="new-chat-button"]'],copyButtons:['button[aria-label*="コピー"]','button[aria-label*="Copy"]',".copy-button"],chatContainer:["chat-window","main.main",".conversation-container"]}}findElement(t){const n=this.elementSelectors[t]||[];for(const r of n)try{const o=document.querySelector(r);if(o)return{element:o,selector:r}}catch{}return{element:null,selector:null}}findAllElements(){const t={};for(const n in this.elementSelectors)t[n]=this.findElement(n);return t}capturePageStructure(){return{timestamp:Date.now(),url:window.location.href,title:document.title,elements:this.findAllElements(),interactiveElements:this.getInteractiveElements(),metadata:{viewport:{width:window.innerWidth,height:window.innerHeight},scrollPosition:{x:window.scrollX,y:window.scrollY}}}}getInteractiveElements(){const t=[];return document.querySelectorAll('button, a, input, textarea, [role="button"], [contenteditable="true"]').forEach((o,i)=>{if(i>=50)return;const a=o.getBoundingClientRect();a.width===0||a.height===0||t.push({index:i,type:o.tagName.toLowerCase(),role:o.getAttribute("role")||"",ariaLabel:o.getAttribute("aria-label")||"",text:o.textContent?.trim().substring(0,50)||"",description:o.getAttribute("description")||"",isVisible:a.width>0&&a.height>0,position:{x:Math.round(a.x),y:Math.round(a.y)}})}),t}exportForAI(){const t=this.capturePageStructure();let n=`## Gemini Chat Page Structure

`;n+=`**URL**: ${t.url}
`,n+=`**Title**: ${t.title}

`,n+=`### Main Elements

`;for(const[r,o]of Object.entries(t.elements))o.element?n+=`- **${r}**: \`${o.selector}\` ✓
`:n+=`- **${r}**: Not found ✗
`;return n+=`
### Interactive Elements (${t.interactiveElements.length})

`,t.interactiveElements.slice(0,10).forEach(r=>{r.text&&(n+=`- [${r.type}] ${r.text} (${r.ariaLabel||r.role})
`)}),n}async copyToClipboard(){const t=this.exportForAI();try{return await navigator.clipboard.writeText(t),this.showNotification("ページ構造をクリップボードにコピーしました"),!0}catch{return this.showNotification("コピーに失敗しました","error"),!1}}showNotification(t,n="success"){const r=document.createElement("div");r.style.cssText=`
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${n==="error"?"#f44336":"#4CAF50"};
      color: white;
      padding: 16px 24px;
      border-radius: 4px;
      z-index: 10000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 14px;
      animation: slideIn 0.3s ease-out;
    `,r.textContent=t;const o=document.createElement("style");o.textContent=`
      @keyframes slideIn {
        from { transform: translateX(400px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `,document.head.appendChild(o),document.body.appendChild(r),setTimeout(()=>{r.style.transition="opacity 0.3s",r.style.opacity="0",setTimeout(()=>r.remove(),300)},3e3)}}function zt(){window.domAnalyzer=new _t,window.analyzePage=()=>{console.log(window.domAnalyzer.capturePageStructure())},window.copyPageStructure=()=>{window.domAnalyzer.copyToClipboard()}}const jt={matches:["https://gemini.google.com/app*","https://gemini.google.com/search*"],runAt:"document_end",main(){window.rememberActionButtonPosition=xt,zt(),Wt()}};function He(){const e="gemini-improve-ui-custom-styles";document.getElementById(e)?.remove();const t=document.createElement("style");t.id=e,t.textContent=`
    .gems-list-container {
      display: none !important;
    }
    .side-nav-entry-container {
      display: none !important;
    }
    chat-window {
      max-width: var(--chat-max-width, 900px) !important;
      margin-left: 0 !important;
      margin-right: auto !important;
    }
    .conversation-container {
      max-width: var(--chat-max-width, 900px) !important;
      margin-left: 0 !important;
      margin-right: auto !important;
    }
  `,document.head.appendChild(t)}function Ue(e){document.documentElement.style.setProperty("--chat-max-width",`${e}px`)}function Kt(){chrome.storage.sync.get(["chatWidth"],e=>{Ue(e.chatWidth||900)})}function Wt(){Kt(),He(),window.addEventListener("popstate",()=>{O()});let e=location.href;new MutationObserver(()=>{const t=location.href;t!==e&&(e=t,window.rememberActionButtonPosition?.(-1),Ot(),setTimeout(()=>{Q(),fe(),M()||$e(),document.getElementById("gemini-export-note-button")?.remove(),Ce()},1500))}).observe(document,{subtree:!0,childList:!0}),St(),M()?(lt(),fe()):(nt(),Bt(),setTimeout(()=>{Ce()},1500),setTimeout(()=>{$e()},1500)),chrome.storage.onChanged.addListener((t,n)=>{n==="sync"&&t.chatWidth&&(Ue(t.chatWidth.newValue),He())})}function W(e,...t){}const Ft={debug:(...e)=>W(console.debug,...e),log:(...e)=>W(console.log,...e),warn:(...e)=>W(console.warn,...e),error:(...e)=>W(console.error,...e)},Oe=globalThis.browser?.runtime?.id?globalThis.browser:globalThis.chrome;var _e=class ze extends Event{static EVENT_NAME=ae("wxt:locationchange");constructor(t,n){super(ze.EVENT_NAME,{}),this.newUrl=t,this.oldUrl=n}};function ae(e){return`${Oe?.runtime?.id}:content:${e}`}const Vt=typeof globalThis.navigation?.addEventListener=="function";function Gt(e){let t,n=!1;return{run(){n||(n=!0,t=new URL(location.href),Vt?globalThis.navigation.addEventListener("navigate",r=>{const o=new URL(r.destination.url);o.href!==t.href&&(window.dispatchEvent(new _e(o,t)),t=o)},{signal:e.signal}):e.setInterval(()=>{const r=new URL(location.href);r.href!==t.href&&(window.dispatchEvent(new _e(r,t)),t=r)},1e3))}}}var Yt=class N{static SCRIPT_STARTED_MESSAGE_TYPE=ae("wxt:content-script-started");id;abortController;locationWatcher=Gt(this);constructor(t,n){this.contentScriptName=t,this.options=n,this.id=Math.random().toString(36).slice(2),this.abortController=new AbortController,this.stopOldScripts(),this.listenForNewerScripts()}get signal(){return this.abortController.signal}abort(t){return this.abortController.abort(t)}get isInvalid(){return Oe.runtime?.id==null&&this.notifyInvalidated(),this.signal.aborted}get isValid(){return!this.isInvalid}onInvalidated(t){return this.signal.addEventListener("abort",t),()=>this.signal.removeEventListener("abort",t)}block(){return new Promise(()=>{})}setInterval(t,n){const r=setInterval(()=>{this.isValid&&t()},n);return this.onInvalidated(()=>clearInterval(r)),r}setTimeout(t,n){const r=setTimeout(()=>{this.isValid&&t()},n);return this.onInvalidated(()=>clearTimeout(r)),r}requestAnimationFrame(t){const n=requestAnimationFrame((...r)=>{this.isValid&&t(...r)});return this.onInvalidated(()=>cancelAnimationFrame(n)),n}requestIdleCallback(t,n){const r=requestIdleCallback((...o)=>{this.signal.aborted||t(...o)},n);return this.onInvalidated(()=>cancelIdleCallback(r)),r}addEventListener(t,n,r,o){n==="wxt:locationchange"&&this.isValid&&this.locationWatcher.run(),t.addEventListener?.(n.startsWith("wxt:")?ae(n):n,r,{...o,signal:this.signal})}notifyInvalidated(){this.abort("Content script context invalidated"),Ft.debug(`Content script "${this.contentScriptName}" context invalidated`)}stopOldScripts(){document.dispatchEvent(new CustomEvent(N.SCRIPT_STARTED_MESSAGE_TYPE,{detail:{contentScriptName:this.contentScriptName,messageId:this.id}})),window.postMessage({type:N.SCRIPT_STARTED_MESSAGE_TYPE,contentScriptName:this.contentScriptName,messageId:this.id},"*")}verifyScriptStartedEvent(t){const n=t.detail?.contentScriptName===this.contentScriptName,r=t.detail?.messageId===this.id;return n&&!r}listenForNewerScripts(){const t=n=>{!(n instanceof CustomEvent)||!this.verifyScriptStartedEvent(n)||this.notifyInvalidated()};document.addEventListener(N.SCRIPT_STARTED_MESSAGE_TYPE,t),this.onInvalidated(()=>document.removeEventListener(N.SCRIPT_STARTED_MESSAGE_TYPE,t))}};function Zt(){}function F(e,...t){}const Qt={debug:(...e)=>F(console.debug,...e),log:(...e)=>F(console.log,...e),warn:(...e)=>F(console.warn,...e),error:(...e)=>F(console.error,...e)};return(async()=>{try{const{main:e,...t}=jt;return await e(new Yt("content",t))}catch(e){throw Qt.error('The content script "content" crashed on startup!',e),e}})()})();
content;