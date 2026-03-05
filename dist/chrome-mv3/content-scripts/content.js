var content=(function(){"use strict";function Jt(e){return e}const se={chat:{navigateToSearch:"Insert",toggleSidebar:"Delete",toggleHistoryMode:"End",scrollUp:"PageUp",scrollDown:"PageDown",historyUp:"ArrowUp",historyDown:"ArrowDown",historyOpen:"Enter",historyExit:"Escape"},search:{moveUp:"ArrowUp",moveDown:"ArrowDown",openResult:"Enter",scrollUp:"PageUp",scrollDown:"PageDown"}};let R=null;function Ke(){return new Promise(e=>{chrome.storage.sync.get(["shortcuts"],t=>{t.shortcuts?R=t.shortcuts:R=JSON.parse(JSON.stringify(se)),e(R)})})}function le(){return R||se}function h(e,t){const n=le(),i=t.split(".");let o=n;for(const r of i)if(o=o[r],!o)return!1;if(typeof o=="object"){const r=o.meta?e.metaKey:!e.metaKey,a=o.ctrl?e.ctrlKey:!e.ctrlKey,s=o.shift?e.shiftKey:!e.shiftKey;return e.code===o.key&&r&&a&&s}return e.code===o&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey}const We=500,Fe=300,ce=10,de=40,ue=100;let g=null,f=-1,w=[],V=null;function H(){return g!==null&&g.style.display==="block"&&w.length>0}function v(e){e.preventDefault(),e.stopPropagation(),e.stopImmediatePropagation()}function $(e){e==="next"?f=f<0?0:(f+1)%w.length:f=f<0||f<=0?w.length-1:f-1,he()}async function pe(e){if(!e||e.trim().length===0)return[];try{const t=encodeURIComponent(e.trim());return(await(await fetch(`https://www.google.co.jp/complete/search?output=firefox&hl=ja&ie=utf-8&oe=utf-8&q=${t}`)).json())[1]||[]}catch{return[]}}function Ge(){if(g)return g;const e=document.createElement("div");return e.className="gemini-autocomplete-list",e.style.cssText=`
    position: fixed;
    background: white;
    border: 1px solid #ddd;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    overflow-y: auto;
    z-index: 10000;
    display: none;
    min-width: 300px;
  `,document.body.appendChild(e),g=e,e}function Ve(e,t,n){const i=e.getBoundingClientRect();t.style.left=`${i.left}px`,t.style.width=`${i.width}px`,t.style.display="block";const o=window.innerHeight-i.bottom-ce,r=i.top-ce,a=Math.floor(o/de),s=Math.floor(r/de);a<n.length&&s>a?(t.style.bottom=`${window.innerHeight-i.top}px`,t.style.top="auto",t.style.maxHeight=`${Math.max(r,ue)}px`):(t.style.top=`${i.bottom}px`,t.style.bottom="auto",t.style.maxHeight=`${Math.max(o,ue)}px`)}function me(e,t){if(!t||t.length===0){x();return}const n=Ge();n.innerHTML="",w=t,f=-1,t.forEach((i,o)=>{const r=document.createElement("div");r.className="gemini-autocomplete-item",r.textContent=i,r.style.cssText=`
      padding: 10px 16px;
      cursor: pointer;
      font-size: 14px;
      border-bottom: 1px solid #f0f0f0;
    `,r.addEventListener("mouseenter",()=>{f=o,he()}),r.addEventListener("click",()=>{Y(e,i)}),n.appendChild(r)}),Ve(e,n,t)}function x(){g&&(g.style.display="none"),w=[],f=-1}function he(){if(!g)return;g.querySelectorAll(".gemini-autocomplete-item").forEach((t,n)=>{t.style.backgroundColor=n===f?"#e8f0fe":"transparent"})}function Y(e,t){if(e.contentEditable==="true"){for(;e.firstChild;)e.removeChild(e.firstChild);const n=document.createElement("p");n.textContent=t,e.appendChild(n),e.focus();const i=document.createRange(),o=window.getSelection();i.selectNodeContents(e),i.collapse(!1),o?.removeAllRanges(),o?.addRange(i),e.dispatchEvent(new Event("input",{bubbles:!0}))}else e.value=t,e.focus(),e.setSelectionRange(t.length,t.length),e.dispatchEvent(new Event("input",{bubbles:!0}));x()}function Q(){const e=document.querySelector('div[contenteditable="true"][role="textbox"]');if(!e){setTimeout(Q,We);return}e.addEventListener("keydown",async t=>{if(!(!t.isTrusted||t.isComposing)){if(t.metaKey&&t.code==="Space"){v(t);const i=(e.textContent||"").trim();if(i.length===0){x();return}const o=await pe(i);me(e,o);return}if(H())if(t.key==="Tab"||t.key==="ArrowDown")v(t),$("next");else if(t.key==="ArrowUp")v(t),$("prev");else if(t.key==="Enter"){v(t);const n=f>=0?f:0;Y(e,w[n])}else t.key==="Escape"&&(t.preventDefault(),x())}},!0),document.addEventListener("click",t=>{g&&!g.contains(t.target)&&t.target!==e&&x()})}function fe(){if(!window.location.pathname.startsWith("/search"))return;let e=0;const t=10,n=setInterval(()=>{e++;const i=document.querySelector('input[data-test-id="search-input"]')||document.querySelector('input[type="text"][placeholder*="検索"]')||document.querySelector('input[type="text"]');i?(clearInterval(n),i.addEventListener("input",o=>{if(!o.isTrusted)return;if(V&&clearTimeout(V),(i.value||"").trim().length===0){x();return}V=setTimeout(async()=>{const s=(i.value||"").trim();if(s.length===0){x();return}const l=await pe(s);me(i,l)},Fe)}),i.addEventListener("keydown",o=>{!o.isTrusted||o.isComposing||H()&&(o.key==="Tab"||o.key==="ArrowDown"?(v(o),$("next")):o.key==="ArrowUp"?(v(o),$("prev")):o.key==="Enter"?f>=0&&(v(o),Y(i,w[f])):o.key==="Escape"&&(o.preventDefault(),x()))},!0),document.addEventListener("click",o=>{g&&!g.contains(o.target)&&o.target!==i&&x()})):e>=t&&clearInterval(n)},500)}let D=null,I=0;const Ye=5e3;function Qe(){const e=Date.now();if(D&&e-I<Ye)return D;const t=document.querySelector("infinite-scroller.chat-history");if(t&&t.scrollHeight>t.clientHeight)return D=t,I=e,t;if(document.documentElement.scrollHeight>document.documentElement.clientHeight)return D=document.documentElement,I=e,document.documentElement;const n=["infinite-scroller",'main[class*="main"]',".conversation-container",'[class*="chat-history"]','[class*="messages"]',"main",'[class*="scroll"]','div[class*="conversation"]'];for(const i of n){const o=document.querySelector(i);if(o&&o.scrollHeight>o.clientHeight)return D=o,I=e,o}return D=document.documentElement,I=e,document.documentElement}function ge(e){const t=Qe(),n=window.innerHeight*.1,i=e==="up"?-n:n;t===document.documentElement||t===document.body?window.scrollBy({top:i,behavior:"auto"}):t.scrollBy({top:i,behavior:"auto"})}function be(){const e=document.querySelector('div[contenteditable="true"][role="textbox"]')||document.querySelector('[contenteditable="true"]');if(e&&(e.focus(),e.contentEditable==="true")){const t=document.createRange(),n=window.getSelection();t.selectNodeContents(e),t.collapse(!1),n?.removeAllRanges(),n?.addRange(t)}}function Xe(){let e=0;const t=10,n=setInterval(()=>{e++;const i=document.querySelector('div[contenteditable="true"][role="textbox"]');if(i){for(clearInterval(n);i.firstChild;)i.removeChild(i.firstChild);const o=document.createElement("p");o.appendChild(document.createElement("br")),i.appendChild(o),i.focus(),i.dispatchEvent(new Event("input",{bubbles:!0}))}else e>=t&&clearInterval(n)},200)}function Je(){const e=window.location.pathname;if(e!=="/app"&&e!=="/app/")return;const t=new URLSearchParams(window.location.search),n=t.get("q");if(!n)return;const i=t.get("send"),o=i===null||i==="true"||i==="1";let r=0;const a=20,s=setInterval(()=>{r++;const l=document.querySelector('div[contenteditable="true"][role="textbox"]');if(l){for(clearInterval(s);l.firstChild;)l.removeChild(l.firstChild);const c=document.createElement("p");c.textContent=n,l.appendChild(c),l.focus();const d=document.createRange(),p=window.getSelection();d.selectNodeContents(l),d.collapse(!1),p?.removeAllRanges(),p?.addRange(d),l.dispatchEvent(new Event("input",{bubbles:!0})),o&&setTimeout(()=>{const u=document.querySelector('button[aria-label*="送信"]')||document.querySelector('button[aria-label*="Send"]')||document.querySelector("button.send-button")||Array.from(document.querySelectorAll("button")).find(m=>m.getAttribute("aria-label")?.includes("送信")||m.getAttribute("aria-label")?.includes("Send"));u&&!u.disabled&&u.click()},500)}else r>=a&&clearInterval(s)},200)}function Ze(e){const t=X();return t.length===0?!1:(e==="up"?t[t.length-1].focus():t[0].focus(),!0)}function et(e){const t=X(),n=t.findIndex(i=>i===document.activeElement);return n===-1?!1:e==="up"?(n>0&&(t[n-1].focus(),window.rememberActionButtonPosition?.(n-1)),!0):(n<t.length-1&&(t[n+1].focus(),window.rememberActionButtonPosition?.(n+1)),!0)}function X(){return Array.from(document.querySelectorAll('button.deep-dive-button-inline, button[data-action="deep-dive"]')).filter(t=>!(t.closest('[data-test-id*="user"]')||t.closest('[data-test-id*="prompt"]')||t.closest('[class*="user"]')))}function tt(){return document.querySelector('[data-test-id="side-nav-toggle"]')||document.querySelector('button[aria-label*="メニュー"]')||document.querySelector('button[aria-label*="menu"]')||document.querySelector('button[aria-label*="Menu"]')}function nt(){const e=tt();e&&e.click()}function ot(){setTimeout(()=>{Je()},1e3),setTimeout(()=>{Q()},1500),new MutationObserver(()=>{document.querySelector('[aria-busy="true"]')&&window.rememberActionButtonPosition?.(-1)}).observe(document.body,{attributes:!0,attributeFilter:["aria-busy"],subtree:!0})}let E=0,U=!1;function J(){return Array.from(document.querySelectorAll('.conversation-items-container .conversation[data-test-id="conversation"]'))}function Z(e){const t=J();if(t.length===0)return;E=Math.max(0,Math.min(e,t.length-1)),t.forEach(i=>{i.style.outline="",i.style.outlineOffset=""});const n=t[E];n&&(n.style.outline="2px solid #1a73e8",n.style.outlineOffset="-2px",n.scrollIntoView({block:"nearest",behavior:"auto"}))}function it(){Z(E-1)}function rt(){Z(E+1)}function at(){const e=J();e.length===0||!e[E]||(e[E].click(),U=!1,e.forEach(t=>{t.style.outline="",t.style.outlineOffset=""}),Xe())}function _(){U=!1,J().forEach(t=>{t.style.outline="",t.style.outlineOffset=""})}function ye(){U=!0,document.activeElement&&document.activeElement.blur(),Z(E)}function q(){return U}let S=0;function M(){return window.location.pathname.startsWith("/search")}function ee(){let e=Array.from(document.querySelectorAll('search-snippet[tabindex="0"]'));return e.length===0&&(e=Array.from(document.querySelectorAll("search-snippet"))),e.length===0&&(e=Array.from(document.querySelectorAll('div.conversation-container[role="option"]'))),e.length===0&&(e=Array.from(document.querySelectorAll('[role="option"].conversation-container'))),e}function te(e){const t=ee();if(t.length===0)return;S=Math.max(0,Math.min(e,t.length-1)),t.forEach(i=>{i.style.outline="",i.style.outlineOffset=""});const n=t[S];n&&(n.style.outline="2px solid #1a73e8",n.style.outlineOffset="-2px",n.scrollIntoView({block:"nearest",behavior:"auto"}))}function st(){te(S-1);const e=document.querySelector('input[data-test-id="search-input"]');e&&e.focus()}function lt(){te(S+1);const e=document.querySelector('input[data-test-id="search-input"]');e&&e.focus()}function ct(){const e=ee();if(e.length===0||!e[S])return;const t=e[S],n=t.querySelector("div[jslog]");if(n){n.click(),["mousedown","mouseup","click"].forEach(o=>{n.dispatchEvent(new MouseEvent(o,{view:window,bubbles:!0,cancelable:!0}))}),setTimeout(()=>{t.click()},100);return}const i=t.querySelector("a[href]");if(i){i.click();return}t.click(),["mousedown","mouseup","click"].forEach(o=>{t.dispatchEvent(new MouseEvent(o,{view:window,bubbles:!0,cancelable:!0}))})}function dt(){if(!M())return;let e=0;const t=10,n=setInterval(()=>{e++,ee().length>0?(S=0,te(0),clearInterval(n)):e>=t&&clearInterval(n)},500)}function ut(){history.pushState(null,"","/search?hl=ja"),window.dispatchEvent(new PopStateEvent("popstate",{state:null}))}function xe(){M()?history.back():(_(),ut())}const we="gemini-export-note-button";let y=null;function ve(){return new Promise((e,t)=>{const n=indexedDB.open("gemini-export",1);n.onupgradeneeded=i=>{i.target.result.createObjectStore("handles")},n.onsuccess=i=>e(i.target.result),n.onerror=()=>t(n.error)})}async function pt(){try{const e=await ve();return new Promise(t=>{const i=e.transaction("handles","readonly").objectStore("handles").get("save_dir");i.onsuccess=()=>t(i.result||null),i.onerror=()=>t(null)})}catch{return null}}async function Ee(e){try{const t=await ve();await new Promise((n,i)=>{const o=t.transaction("handles","readwrite");o.objectStore("handles").put(e,"save_dir"),o.oncomplete=()=>n(),o.onerror=()=>i(o.error)})}catch{}}async function mt(){if(y&&await y.queryPermission({mode:"readwrite"})==="granted")return y;const e=await pt();if(e&&(await e.queryPermission({mode:"readwrite"})==="granted"||await e.requestPermission({mode:"readwrite"})==="granted"))return y=e,y;const t=await window.showDirectoryPicker({mode:"readwrite"});return await Ee(t),y=t,y}function ht(e){const t=new Set(["button","svg","path","mat-icon"]);function n(o){if(o.nodeType===Node.TEXT_NODE)return o.textContent||"";if(o.nodeType!==Node.ELEMENT_NODE)return"";const r=o,a=r.tagName.toLowerCase();if(t.has(a))return"";const s=()=>Array.from(r.childNodes).map(n).join(""),l=a.match(/^h([1-6])$/);if(l){const c="#".repeat(Number(l[1])),d=s().trim();return`
${c} ${d}

`}switch(a){case"p":return s()+`

`;case"br":return`
`;case"hr":return`
---

`;case"ul":case"ol":return s()+`
`;case"li":return`- ${s().replace(/\n+$/,"")}
`;case"b":case"strong":return`**${s()}**`;case"i":case"em":return`*${s()}*`;case"code":return`\`${s()}\``;case"pre":return`\`\`\`
${s()}
\`\`\`

`;case"table":return i(r)+`

`;case"thead":case"tbody":case"tr":case"td":case"th":return"";default:return s()}}function i(o){const r=Array.from(o.querySelectorAll("tr"));if(r.length===0)return"";const a=p=>Array.from(p.querySelectorAll("td, th")).map(u=>Array.from(u.childNodes).map(n).join("").replace(/\n+/g," ").trim()),[s,...l]=r,c=a(s),d=c.map(()=>"---");return[`| ${c.join(" | ")} |`,`| ${d.join(" | ")} |`,...l.map(p=>`| ${a(p).join(" | ")} |`)].join(`
`)}return Array.from(e.childNodes).map(n).join("").replace(/\n{3,}/g,`

`).trim()}const ft=[/^[+＋]$/,/^Google スプレッドシートにエクスポート$/,/^Google Sheets にエクスポート$/,/^Export to Sheets$/];function gt(e){return e.split(`
`).filter(t=>!ft.some(n=>n.test(t.trim()))).join(`
`).replace(/\n{3,}/g,`

`).trim()}async function bt(){const e=document.querySelector("infinite-scroller.chat-history");if(!e)return;P("メッセージを読み込み中...");let t=0;for(let n=0;n<30;n++){e.scrollTop=0,await new Promise(o=>setTimeout(o,400));const i=document.querySelectorAll("user-query").length;if(i===t)break;t=i}e.scrollTop=e.scrollHeight}function yt(){const e=Array.from(document.querySelectorAll("user-query")),t=Array.from(document.querySelectorAll("model-response")),n=[],i=Math.min(e.length,t.length);for(let o=0;o<i;o++){const r=Array.from(e[o].querySelectorAll(".query-text-line")).map(c=>c.innerText.trim()).filter(Boolean).join(`
`),a=t[o].querySelector("message-content .markdown"),s=a?ht(a).trim():void 0,l=s?gt(s):"";(r||l)&&n.push({user:r||"",model:l||""})}return n}function ne(){return location.pathname.split("/").pop()||"unknown"}function O(e){return'"'+e.replace(/\\/g,"\\\\").replace(/"/g,'\\"')+'"'}function Se(e,t){return e.split(`
`).map(n=>n===""?"":t+n).join(`
`)}function xt(e){const t=new Date,n=u=>String(u).padStart(2,"0"),o=`${`${t.getFullYear()}-${n(t.getMonth()+1)}-${n(t.getDate())}`}T${n(t.getHours())}:${n(t.getMinutes())}:${n(t.getSeconds())}`,r=o.replace(/[-:T]/g,""),a=document.querySelector('[data-test-id="conversation-title"]')?.innerText?.trim(),s=(e[0]?.user||"").split(`
`).map(u=>u.trim()).filter(Boolean),l=s.find(u=>!/^https?:\/\//i.test(u))||s[0]||"Gemini chat",c=(a||l).slice(0,60),d=ne(),p=[`id: ${O(d)}`,`title: ${O("Gemini: "+c)}`,`date: ${O(o)}`,`source: ${O(location.href)}`,"tags:","  - gemini","  - fleeting","chats:"];for(const u of e)p.push("  - q: |"),p.push(Se(u.user,"      ")),p.push("    a: |"),p.push(Se(u.model,"      "));return{markdown:p.join(`
`),id:r,title:c}}async function Ae(e=!1){await bt();const t=yt();if(t.length===0){P("保存できる会話が見つかりません","error");return}let n;try{if(e){const l=await window.showDirectoryPicker({mode:"readwrite"});await Ee(l),y=l,n=l,P(`保存先を変更: ${l.name}`)}else n=await mt()}catch{return}const{markdown:i,title:o}=xt(t),r=ne(),s=`gemini-${o.replace(/[\\/:*?"<>|]/g,"").replace(/\s+/g,"-").slice(0,40)}-${r}.yaml`;try{const d=await(await(await n.getDirectoryHandle("inbox",{create:!0})).getFileHandle(s,{create:!0})).createWritable();await d.write(i),await d.close(),P(`保存しました: inbox/${s}`)}catch{P("保存に失敗しました","error")}}function P(e,t="success"){const n=document.getElementById("gemini-export-notification");n&&n.remove();const i=document.createElement("div");i.id="gemini-export-notification",i.style.cssText=`
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
  `,i.textContent=e,document.body.appendChild(i),setTimeout(()=>i.remove(),3e3)}function wt(){if(document.getElementById(we)||!(document.querySelector("input-area-v2")||document.querySelector("input-container")))return;const t=document.createElement("button");t.id=we,t.title=`Save as Zettelkasten note
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
  `,t.addEventListener("mouseenter",()=>{t.style.background="#1557b0"}),t.addEventListener("mouseleave",()=>{t.style.background="#1a73e8"}),t.addEventListener("click",n=>Ae(n.shiftKey)),document.body.appendChild(t)}function Ce(){ne()!=="app"&&wt()}let oe=-1;function vt(e){oe=e}function Et(e){if(H()&&(e.key==="ArrowUp"||e.key==="ArrowDown"||e.key==="Enter"||e.key==="Tab"||e.key==="Escape"))return!1;if(h(e,"chat.navigateToSearch"))return e.preventDefault(),xe(),!0;if(h(e,"search.moveUp"))return e.preventDefault(),e.stopPropagation(),e.stopImmediatePropagation(),st(),!0;if(h(e,"search.moveDown"))return e.preventDefault(),e.stopPropagation(),e.stopImmediatePropagation(),lt(),!0;if(h(e,"search.openResult"))return e.isComposing?!1:(e.preventDefault(),e.stopPropagation(),e.stopImmediatePropagation(),ct(),!0);if(h(e,"search.scrollUp"))return e.preventDefault(),window.scrollBy({top:-window.innerHeight*.8,behavior:"auto"}),!0;if(h(e,"search.scrollDown"))return e.preventDefault(),window.scrollBy({top:window.innerHeight*.8,behavior:"auto"}),!0;const t=le();return!!Object.values(t.chat).includes(e.code)}function St(e){const t=e.target.matches('input, textarea, [contenteditable="true"]');if(H()&&(e.key==="ArrowUp"||e.key==="ArrowDown"||e.key==="Enter"||e.key==="Tab"||e.key==="Escape"))return!1;if(e.code==="Home"&&!e.metaKey&&!e.ctrlKey&&!t)return e.preventDefault(),Ae(e.shiftKey),!0;if(e.ctrlKey&&e.shiftKey&&e.code==="KeyD")return e.preventDefault(),window.domAnalyzer?.copyToClipboard(),!0;if(h(e,"chat.navigateToSearch"))return e.preventDefault(),xe(),!0;if(h(e,"chat.toggleSidebar"))return e.preventDefault(),nt(),!0;if(h(e,"chat.toggleHistoryMode")){e.preventDefault();const n=X(),i=n.length>0;if(q())_(),be();else if(t)if(i){let o=oe;(o<0||o>=n.length)&&(o=n.length-1),n[o].focus()}else ye();else{const o=document.activeElement;if(o&&(o.classList?.contains("deep-dive-button-inline")||o.getAttribute("data-action")==="deep-dive")){const a=n.findIndex(s=>s===o);a!==-1&&(oe=a),ye()}else be()}return!0}if(q()&&h(e,"chat.historyExit"))return e.preventDefault(),_(),!0;if(h(e,"chat.scrollUp"))return e.preventDefault(),ge("up"),!0;if(h(e,"chat.scrollDown"))return e.preventDefault(),ge("down"),!0;if(q()){if(h(e,"chat.historyUp"))return e.preventDefault(),it(),!0;if(h(e,"chat.historyDown"))return e.preventDefault(),rt(),!0;if(h(e,"chat.historyOpen"))return e.preventDefault(),at(),!0}if(!q()&&t&&(h(e,"chat.historyUp")||h(e,"chat.historyDown"))){const n=document.querySelector('div[contenteditable="true"][role="textbox"]');if(n&&n.textContent?.trim()===""){e.preventDefault();const i=h(e,"chat.historyUp")?"up":"down";return Ze(i),!0}}if(!q()&&!t){const n=document.activeElement;if(n&&(n.classList?.contains("deep-dive-button-inline")||n.getAttribute("data-action")==="deep-dive")){if(h(e,"chat.historyUp")||h(e,"chat.historyDown")){e.preventDefault();const o=h(e,"chat.historyUp")?"up":"down";return et(o),!0}if(e.key==="ArrowRight"||e.key==="ArrowLeft"){e.preventDefault();const o=n._expandButton,r=n._deepDiveTarget;if(o&&r){const a=o.getAttribute("data-action")==="collapse";(e.key==="ArrowRight"&&!a||e.key==="ArrowLeft"&&a)&&o.click()}return!0}if(h(e,"chat.historyOpen"))return e.preventDefault(),n.click(),!0}}return!1}function At(){Ke().then(()=>{document.addEventListener("keydown",e=>{if(M()){Et(e);return}St(e)},!0)})}const z=[{id:"default",prompt:"これについて詳しく"}];function De(){const e=document.querySelectorAll(".markdown-main-panel");e.length!==0&&e.forEach(t=>{const n=[],i=t.querySelectorAll("h1[data-path-to-node], h2[data-path-to-node], h3[data-path-to-node], h4[data-path-to-node], h5[data-path-to-node], h6[data-path-to-node]");i.length>0?(i.forEach(s=>{const l=s.querySelector(".deep-dive-button-inline");if(l){if(l.hasAttribute("data-initialized"))return;s.querySelectorAll(".deep-dive-button-inline, .deep-dive-expand-button").forEach(c=>c.remove())}n.push({type:"section",element:s,getContent:()=>Dt(s)})}),t.querySelectorAll("table[data-path-to-node]").forEach(s=>{const l=s.closest(".table-block-component");if(l){const c=l.querySelector(".deep-dive-button-inline");if(c){if(c.hasAttribute("data-initialized"))return;c.remove()}n.push({type:"table",element:l,getContent:()=>Te(s)})}}),Ct(t,i).forEach(s=>{const l=s.anchor.querySelector(".deep-dive-button-inline");if(l){if(l.hasAttribute("data-initialized"))return;l.remove()}n.push({type:"orphan",element:s.anchor,getContent:()=>s.elements.map(c=>c.textContent?.trim()??"").filter(Boolean).join(`

`)})})):(t.querySelectorAll("table[data-path-to-node]").forEach(l=>{const c=l.closest(".table-block-component");if(c){const d=c.querySelector(".deep-dive-button-inline");if(d){if(d.hasAttribute("data-initialized"))return;d.remove()}n.push({type:"table",element:c,getContent:()=>Te(l)})}}),t.querySelectorAll("blockquote[data-path-to-node]").forEach(l=>{const c=l.querySelector(".deep-dive-button-inline");if(c){if(c.hasAttribute("data-initialized"))return;c.remove()}n.push({type:"blockquote",element:l,getContent:()=>l.textContent?.trim()??""})}),t.querySelectorAll("ol[data-path-to-node], ul[data-path-to-node]").forEach(l=>{const c=l.querySelector(":scope > .deep-dive-button-inline");if(c){if(c.hasAttribute("data-initialized"))return;l.querySelectorAll(".deep-dive-button-inline, .deep-dive-expand-button").forEach(u=>u.remove())}let d=l.parentElement,p=!1;for(;d&&d!==t;){if((d.tagName==="OL"||d.tagName==="UL")&&d.hasAttribute("data-path-to-node")){p=!0;break}d=d.parentElement}p||n.push({type:"list",element:l,getContent:()=>Tt(l)})})),n.forEach(r=>kt(r))})}function Ct(e,t){const n=new Set(Array.from(t)),i=Array.from(e.children),o=[];let r=[],a=!1;const s=l=>{r.length>0&&!l&&o.push({anchor:r[0],elements:[...r]}),r=[]};for(const l of i){const c=l.tagName,d=c==="P";n.has(l)||c==="H1"||c==="H2"||c==="H3"||c==="H4"||c==="H5"||c==="H6"?(s(a),a=!0):c==="HR"?(s(a),a=!1):d?r.push(l):(s(a),a=!1)}return s(a),o}function Dt(e){let t=(e.textContent?.trim()??"")+`

`,n=e.nextElementSibling;for(;n&&!n.matches("h1, h2, h3, h4, h5, h6, hr");){if(n.classList.contains("table-block-component")){n=n.nextElementSibling;continue}t+=(n.textContent?.trim()??"")+`

`,n=n.nextElementSibling}return t.trim()}function Te(e){let t="";return e.querySelectorAll("tr").forEach((i,o)=>{const r=i.querySelectorAll("td, th"),a=Array.from(r).map(s=>s.textContent?.trim()??"");t+="| "+a.join(" | ")+` |
`,o===0&&(t+="| "+a.map(()=>"---").join(" | ")+` |
`)}),t.trim()}function Tt(e){return e.textContent?.trim()??""}function kt(e){const t=document.createElement("button");t.className="deep-dive-button-inline",t.setAttribute("aria-label","Deep dive into this content"),t.setAttribute("data-action","deep-dive"),t.setAttribute("data-initialized","1"),t.title="Deep dive into this content",t._deepDiveTarget=e;const n=document.createElementNS("http://www.w3.org/2000/svg","svg");n.setAttribute("width","16"),n.setAttribute("height","16"),n.setAttribute("viewBox","0 0 24 24"),n.setAttribute("fill","currentColor");const i=document.createElementNS("http://www.w3.org/2000/svg","path");i.setAttribute("d","M19 15l-6 6-1.5-1.5L15 16H4V9h2v5h9l-3.5-3.5L13 9l6 6z"),n.appendChild(i),t.appendChild(n),t.addEventListener("click",r=>{r.preventDefault(),r.stopPropagation(),Me(e,r.ctrlKey)}),t.addEventListener("keydown",r=>{if(r.key==="ArrowRight"&&!r.altKey&&!r.ctrlKey&&!r.metaKey){if(r.preventDefault(),r.stopPropagation(),t._popupClosedAt&&Date.now()-t._popupClosedAt<300)return;const a=t._expandButton;if(a&&a.getAttribute("data-action")==="expand"){ke(e,a);return}Ie(t,e)}});let o=null;if((e.type==="section"||e.type==="list")&&(o=It(e),t._expandButton=o),e.type==="section")e.element.style.position="relative",e.element.style.display="flex",e.element.style.alignItems="center",e.element.style.gap="8px",e.element.appendChild(t),o&&e.element.appendChild(o);else if(e.type==="table"){const r=e.element.querySelector(".table-footer");if(r){const a=r.querySelector(".copy-button");a?r.insertBefore(t,a):r.appendChild(t)}}else e.type==="blockquote"?(e.element.style.position="relative",t.style.position="absolute",t.style.top="8px",t.style.right="8px",e.element.appendChild(t)):e.type==="orphan"?(e.element.style.position="relative",t.style.position="absolute",t.style.top="0",t.style.right="0",e.element.appendChild(t)):e.type==="list"&&(e.element.style.position="relative",t.style.position="absolute",t.style.top="0",t.style.right="0",e.element.appendChild(t),o&&(o.style.position="absolute",o.style.top="0",o.style.right="32px",e.element.appendChild(o)))}function It(e){const t=document.createElement("button");return t.className="deep-dive-expand-button",t.setAttribute("aria-label","Expand to select"),t.setAttribute("data-action","expand"),t.setAttribute("tabindex","-1"),t.title="Expand to select",t.textContent="+",t.style.fontSize="14px",t.style.fontWeight="bold",t.dataset.targetId=Math.random().toString(36).substr(2,9),e.expandButtonId=t.dataset.targetId,t.addEventListener("click",n=>{n.preventDefault(),n.stopPropagation(),ke(e,t)}),t}function ke(e,t){t.getAttribute("data-action")==="collapse"?(Mt(e),t.setAttribute("data-action","expand"),t.setAttribute("aria-label","Expand to select"),t.title="Expand to select",t.textContent="+"):(qt(e),t.setAttribute("data-action","collapse"),t.setAttribute("aria-label","Collapse"),t.title="Collapse",t.textContent="-")}function qt(e){if(e.type==="section"){let n=e.element.nextElementSibling;for(;n&&!n.matches("h1, h2, h3, h4, h5, h6, hr");){if(n.classList.contains("table-block-component")){n=n.nextElementSibling;continue}n.tagName==="P"&&!n.querySelector(".deep-dive-child-button")&&ie(n),(n.tagName==="UL"||n.tagName==="OL")&&n.hasAttribute("data-path-to-node")&&n.querySelectorAll(":scope > li").forEach(o=>{o.querySelector(".deep-dive-child-button")||ie(o)}),n=n.nextElementSibling}}else e.type==="list"&&e.element.querySelectorAll(":scope > li").forEach(n=>{n.querySelector(".deep-dive-child-button")||ie(n)})}function ie(e){e.style.position="relative";const t=document.createElement("button");t.className="deep-dive-button-inline deep-dive-child-button",t.setAttribute("aria-label","Deep dive into this content"),t.setAttribute("data-action","deep-dive"),t.title="Deep dive into this content",t.style.position="absolute",t.style.top="0",t.style.right="0";const n=document.createElementNS("http://www.w3.org/2000/svg","svg");n.setAttribute("width","16"),n.setAttribute("height","16"),n.setAttribute("viewBox","0 0 24 24"),n.setAttribute("fill","currentColor");const i=document.createElementNS("http://www.w3.org/2000/svg","path");i.setAttribute("d","M19 15l-6 6-1.5-1.5L15 16H4V9h2v5h9l-3.5-3.5L13 9l6 6z"),n.appendChild(i),t.appendChild(n);const o={type:"child",element:e,getContent:()=>e.textContent?.trim()??""};t.addEventListener("click",r=>{r.preventDefault(),r.stopPropagation(),Me(o,r.ctrlKey)}),t.addEventListener("keydown",r=>{r.key==="ArrowRight"&&!r.altKey&&!r.ctrlKey&&!r.metaKey&&(r.preventDefault(),r.stopPropagation(),Ie(t,o))}),e.appendChild(t)}function Mt(e){if(e.type==="section"){let n=e.element.nextElementSibling;for(;n&&!n.matches("h1, h2, h3, h4, h5, h6, hr");){if(n.classList.contains("table-block-component")){n=n.nextElementSibling;continue}n.querySelectorAll(".deep-dive-child-button").forEach(i=>i.remove()),n=n.nextElementSibling}}else e.type==="list"&&e.element.querySelectorAll(".deep-dive-child-button").forEach(t=>t.remove())}async function Ie(e,t){j();const n=await new Promise(m=>{chrome.storage.sync.get(["deepDiveModes","currentDeepDiveModeId","deepDiveRecentModes"],m)}),i=n.deepDiveModes&&n.deepDiveModes.length>0?n.deepDiveModes:z,o=n.deepDiveRecentModes||[],r=[...i].sort((m,G)=>{const B=o.indexOf(m.id),b=o.indexOf(G.id);return B===-1&&b===-1?0:B===-1?1:b===-1?-1:B-b}),a=document.createElement("div");a.className="deep-dive-template-popup",a.id="deep-dive-template-popup",a.setAttribute("role","menu");const s=(m,G,B)=>{const b=document.createElement("button");return b.className="deep-dive-template-item",b.setAttribute("role","menuitem"),b.textContent=m,G&&(b.title=G),b.addEventListener("mousedown",L=>{L.preventDefault(),L.stopPropagation()}),b.addEventListener("click",L=>{L.preventDefault(),L.stopPropagation(),j(),B()}),b};r.forEach(m=>{a.appendChild(s(m.id,m.prompt||"",()=>Pt(t,m)))}),document.body.appendChild(a);const l=e.getBoundingClientRect(),c=160;let d=l.left+window.scrollX;d+c>window.innerWidth-8&&(d=window.innerWidth-c-8),a.style.top=`${l.bottom+window.scrollY+4}px`,a.style.left=`${d}px`;const p=Array.from(a.querySelectorAll(".deep-dive-template-item"));let u=0;p[0]?.focus(),a.addEventListener("keydown",m=>{m.key==="Escape"||m.key==="ArrowLeft"||m.key==="ArrowRight"?(m.preventDefault(),e._popupClosedAt=Date.now(),j(),e.focus()):m.key==="ArrowDown"?(m.preventDefault(),u=(u+1)%p.length,p[u].focus()):m.key==="ArrowUp"?(m.preventDefault(),u=(u-1+p.length)%p.length,p[u].focus()):m.key==="Tab"&&(m.preventDefault(),m.shiftKey?u=(u-1+p.length)%p.length:u=(u+1)%p.length,p[u].focus())}),setTimeout(()=>{document.addEventListener("click",j,{once:!0})},0)}function j(){document.getElementById("deep-dive-template-popup")?.remove()}function qe(e,t){const n=document.querySelector('div[contenteditable="true"][role="textbox"]');if(!n)return;for(;n.firstChild;)n.removeChild(n.firstChild);e.split(`
`).forEach(r=>{const a=document.createElement("p");r.trim()===""?a.appendChild(document.createElement("br")):a.textContent=r,n.appendChild(a)}),n.focus();const i=document.createRange(),o=window.getSelection();i.selectNodeContents(n),i.collapse(!1),o?.removeAllRanges(),o?.addRange(i),n.dispatchEvent(new Event("input",{bubbles:!0})),t&&setTimeout(()=>{const r=document.querySelector('button[aria-label*="送信"], button[aria-label*="Send"]');r&&!r.disabled&&r.click()},100)}function Pt(e,t){const o=e.getContent().split(`
`).map(r=>`> ${r}`).join(`
`)+`

`+(t.prompt||"これについて詳しく");qe(o,!0),chrome.storage.sync.get(["deepDiveRecentModes"],r=>{const a=(r.deepDiveRecentModes||[]).filter(s=>s!==t.id);a.unshift(t.id),chrome.storage.sync.set({deepDiveRecentModes:a.slice(0,20)})})}async function Me(e,t=!1){if(!document.querySelector('div[contenteditable="true"][role="textbox"]'))return;const i=e.getContent().split(`
`).map(a=>`> ${a}`).join(`
`);let o,r=!1;if(t)o=i+`

`;else{const a=await new Promise(u=>{chrome.storage.sync.get(["deepDiveModes","currentDeepDiveModeId"],u)}),s=a.deepDiveModes&&a.deepDiveModes.length>0?a.deepDiveModes:z;let d=new URLSearchParams(location.search).get("mode_id")||a.currentDeepDiveModeId||s[0]?.id;s.some(u=>u.id===d)||(d=s[0]?.id);const p=s.find(u=>u.id===d)||s[0]||z[0];o=i+`

`+(p.prompt||"これについて詳しく"),r=!0}qe(o,r)}function Bt(){const e="gemini-deep-dive-styles";if(document.getElementById(e))return;const t=document.createElement("style");t.id=e,t.textContent=`
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
  `,document.head.appendChild(t)}function Pe(){const e=document.getElementById("gemini-deep-dive-mode-selector");e&&e.remove(),chrome.storage.sync.get(["deepDiveModes","currentDeepDiveModeId"],t=>{const n=t.deepDiveModes&&t.deepDiveModes.length>0?t.deepDiveModes:z,i=document.createElement("div");i.id="gemini-deep-dive-mode-selector",i.className="gemini-deep-dive-mode-selector";const o=document.createElement("select");o.id="gemini-deep-dive-mode",o.title="深掘りモード",o.setAttribute("aria-label","深掘りモード"),n.forEach(p=>{const u=document.createElement("option");u.value=p.id,u.textContent=p.id,o.appendChild(u)}),o.addEventListener("change",()=>{chrome.storage.sync.set({currentDeepDiveModeId:o.value})}),i.appendChild(o);const r=document.querySelector('button[aria-label*="ファイル"], button[aria-label*="追加"]'),s=document.querySelector('button[aria-label*="ツール"], button[aria-label*="Tool"]')||r&&r.nextElementSibling;if(s&&s.parentElement)s.parentElement.insertBefore(i,s.nextSibling);else{const p=document.querySelector('div[contenteditable="true"][role="textbox"]');if(p){const u=p.closest("form")||p.parentElement?.parentElement;u?u.insertBefore(i,u.firstChild):document.body.appendChild(i)}else document.body.appendChild(i)}const c=new URLSearchParams(location.search).get("mode_id");let d=t.currentDeepDiveModeId;c&&n.some(p=>p.id===c)&&(d=c,chrome.storage.sync.set({currentDeepDiveModeId:c})),d&&n.some(p=>p.id===d)?o.value=d:n.length>0&&(o.value=n[0].id)})}let re=null;function Lt(){Bt();const e=()=>{document.querySelector('button[aria-label*="ツール"], button[aria-label*="Tool"], button[aria-label*="ファイル"], button[aria-label*="追加"]')||document.querySelector('div[contenteditable="true"][role="textbox"]')?Pe():setTimeout(e,500)};e(),chrome.storage.onChanged.addListener((n,i)=>{i==="sync"&&n.deepDiveModes&&location.href.includes("gemini.google.com")&&document.querySelector('button[aria-label*="ツール"], button[aria-label*="Tool"], div[contenteditable="true"][role="textbox"]')&&Pe()}),new MutationObserver(n=>{let i=!1;for(const o of n){if(o.addedNodes.length>0){for(const r of o.addedNodes)if(r.nodeType===1){const a=r;if(a.matches?.("[data-path-to-node]")||a.querySelector?.("[data-path-to-node]")){i=!0;break}}}if(i)break}i&&(re&&clearTimeout(re),re=setTimeout(()=>De(),500))}).observe(document.body,{childList:!0,subtree:!0}),setTimeout(()=>De(),1e3)}let K=!1;const T="gemini-map-panel",Be="gemini-map-styles";function Nt(){if(document.getElementById(Be))return;const e=document.createElement("style");e.id=Be,e.textContent=`
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
  `,document.head.appendChild(e)}function Rt(e){let n=e.querySelector('h1, h2, h3, [role="heading"]')?.textContent?.trim()||e.textContent?.trim()||"";return n=n.replace(/^あなたのプロンプト\s*/,""),n=n.replace(/^>\s*/,""),n.substring(0,60)||"(空)"}function Le(){return Array.from(document.querySelectorAll("infinite-scroller.chat-history > .conversation-container"))}function Ne(){const e=document.createElement("div");e.id=T;const t=document.createElement("div");t.className="map-header",t.textContent="このチャットの流れ",e.appendChild(t);const n=Le();if(n.length===0){const o=document.createElement("div");return o.style.cssText="padding: 10px; opacity: 0.45; font-size: 12px;",o.textContent="チャットがまだありません",e.appendChild(o),e}const i=document.createElement("ul");return n.forEach((o,r)=>{const a=o.querySelector("user-query");if(!a)return;const s=Rt(a),l=document.createElement("li"),c=document.createElement("button"),d=document.createElement("span");d.className="map-turn-index",d.textContent=`${r+1}.`,c.appendChild(d),c.appendChild(document.createTextNode(s)),c.addEventListener("click",()=>{o.scrollIntoView({behavior:"smooth",block:"start"})}),l.appendChild(c),i.appendChild(l)}),e.appendChild(i),e}function Ht(){const e=document.getElementById(T);return e?Array.from(e.querySelectorAll("li button")):[]}let A=null;const k=new Set;function Re(){A&&A.disconnect(),k.clear();const e=Le();e.length!==0&&(A=new IntersectionObserver(t=>{t.forEach(o=>{const r=e.indexOf(o.target);r!==-1&&(o.isIntersecting?k.add(r):k.delete(r))});const n=Ht();if(n.forEach((o,r)=>{o.classList.toggle("map-item-current",k.has(r))}),document.getElementById(T)){const o=n.find((r,a)=>k.has(a));o&&o.scrollIntoView({block:"nearest",behavior:"smooth"})}},{threshold:.15}),e.forEach(t=>A.observe(t)))}function He(){A&&(A.disconnect(),A=null),k.clear()}let C=null;function $t(){C&&C.disconnect();const e=document.querySelector("infinite-scroller.chat-history");if(!e)return;let t=null;C=new MutationObserver(()=>{K&&(t&&clearTimeout(t),t=setTimeout(()=>_t(),300))}),C.observe(e,{childList:!0,subtree:!1})}function Ut(){C&&(C.disconnect(),C=null)}function _t(){if(!K)return;const e=document.getElementById(T),t=e?e.scrollTop:0;e&&e.remove(),He();const n=Ne();document.body.appendChild(n),n.scrollTop=t,Re()}function $e(){Nt();const e=document.getElementById(T);e&&e.remove();const t=Ne();document.body.appendChild(t),K=!0,Re(),$t()}function Ot(){Ut(),He();const e=document.getElementById(T);e&&e.remove(),K=!1}class zt{constructor(){this.elementSelectors={textarea:['[role="textbox"][contenteditable="true"]','[aria-label*="プロンプト"]',".ql-editor.textarea",'rich-textarea [contenteditable="true"]'],sidebar:['[role="navigation"]',"bard-sidenav",".side-nav-container","aside"],sidebarToggle:['button[aria-label*="メインメニュー"]','button[aria-label*="Main menu"]','button[data-test-id="side-nav-menu-button"]'],chatHistory:['.conversation[role="button"]','[data-test-id="conversation"]',".conversation-items-container .conversation"],newChatButton:['a[href="https://gemini.google.com/app"]','a[aria-label*="新規作成"]','[data-test-id="new-chat-button"]'],copyButtons:['button[aria-label*="コピー"]','button[aria-label*="Copy"]',".copy-button"],chatContainer:["chat-window","main.main",".conversation-container"]}}findElement(t){const n=this.elementSelectors[t]||[];for(const i of n)try{const o=document.querySelector(i);if(o)return{element:o,selector:i}}catch{}return{element:null,selector:null}}findAllElements(){const t={};for(const n in this.elementSelectors)t[n]=this.findElement(n);return t}capturePageStructure(){return{timestamp:Date.now(),url:window.location.href,title:document.title,elements:this.findAllElements(),interactiveElements:this.getInteractiveElements(),metadata:{viewport:{width:window.innerWidth,height:window.innerHeight},scrollPosition:{x:window.scrollX,y:window.scrollY}}}}getInteractiveElements(){const t=[];return document.querySelectorAll('button, a, input, textarea, [role="button"], [contenteditable="true"]').forEach((o,r)=>{if(r>=50)return;const a=o.getBoundingClientRect();a.width===0||a.height===0||t.push({index:r,type:o.tagName.toLowerCase(),role:o.getAttribute("role")||"",ariaLabel:o.getAttribute("aria-label")||"",text:o.textContent?.trim().substring(0,50)||"",description:o.getAttribute("description")||"",isVisible:a.width>0&&a.height>0,position:{x:Math.round(a.x),y:Math.round(a.y)}})}),t}exportForAI(){const t=this.capturePageStructure();let n=`## Gemini Chat Page Structure

`;n+=`**URL**: ${t.url}
`,n+=`**Title**: ${t.title}

`,n+=`### Main Elements

`;for(const[i,o]of Object.entries(t.elements))o.element?n+=`- **${i}**: \`${o.selector}\` ✓
`:n+=`- **${i}**: Not found ✗
`;return n+=`
### Interactive Elements (${t.interactiveElements.length})

`,t.interactiveElements.slice(0,10).forEach(i=>{i.text&&(n+=`- [${i.type}] ${i.text} (${i.ariaLabel||i.role})
`)}),n}async copyToClipboard(){const t=this.exportForAI();try{return await navigator.clipboard.writeText(t),this.showNotification("ページ構造をクリップボードにコピーしました"),!0}catch{return this.showNotification("コピーに失敗しました","error"),!1}}showNotification(t,n="success"){const i=document.createElement("div");i.style.cssText=`
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
    `,i.textContent=t;const o=document.createElement("style");o.textContent=`
      @keyframes slideIn {
        from { transform: translateX(400px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `,document.head.appendChild(o),document.body.appendChild(i),setTimeout(()=>{i.style.transition="opacity 0.3s",i.style.opacity="0",setTimeout(()=>i.remove(),300)},3e3)}}function jt(){window.domAnalyzer=new zt,window.analyzePage=()=>{console.log(window.domAnalyzer.capturePageStructure())},window.copyPageStructure=()=>{window.domAnalyzer.copyToClipboard()}}const Kt={matches:["https://gemini.google.com/app*","https://gemini.google.com/search*"],runAt:"document_end",main(){window.rememberActionButtonPosition=vt,jt(),Ft()}};function Ue(){const e="gemini-improve-ui-custom-styles";document.getElementById(e)?.remove();const t=document.createElement("style");t.id=e,t.textContent=`
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
  `,document.head.appendChild(t)}function _e(e){document.documentElement.style.setProperty("--chat-max-width",`${e}px`)}function Wt(){chrome.storage.sync.get(["chatWidth"],e=>{_e(e.chatWidth||900)})}function Ft(){Wt(),Ue(),window.addEventListener("popstate",()=>{_()});let e=location.href;new MutationObserver(()=>{const t=location.href;t!==e&&(e=t,window.rememberActionButtonPosition?.(-1),Ot(),setTimeout(()=>{Q(),fe(),M()||$e(),document.getElementById("gemini-export-note-button")?.remove(),Ce()},1500))}).observe(document,{subtree:!0,childList:!0}),At(),M()?(dt(),fe()):(ot(),Lt(),setTimeout(()=>{Ce()},1500),setTimeout(()=>{$e()},1500)),chrome.storage.onChanged.addListener((t,n)=>{n==="sync"&&t.chatWidth&&(_e(t.chatWidth.newValue),Ue())})}function W(e,...t){}const Gt={debug:(...e)=>W(console.debug,...e),log:(...e)=>W(console.log,...e),warn:(...e)=>W(console.warn,...e),error:(...e)=>W(console.error,...e)},Oe=globalThis.browser?.runtime?.id?globalThis.browser:globalThis.chrome;var ze=class je extends Event{static EVENT_NAME=ae("wxt:locationchange");constructor(t,n){super(je.EVENT_NAME,{}),this.newUrl=t,this.oldUrl=n}};function ae(e){return`${Oe?.runtime?.id}:content:${e}`}const Vt=typeof globalThis.navigation?.addEventListener=="function";function Yt(e){let t,n=!1;return{run(){n||(n=!0,t=new URL(location.href),Vt?globalThis.navigation.addEventListener("navigate",i=>{const o=new URL(i.destination.url);o.href!==t.href&&(window.dispatchEvent(new ze(o,t)),t=o)},{signal:e.signal}):e.setInterval(()=>{const i=new URL(location.href);i.href!==t.href&&(window.dispatchEvent(new ze(i,t)),t=i)},1e3))}}}var Qt=class N{static SCRIPT_STARTED_MESSAGE_TYPE=ae("wxt:content-script-started");id;abortController;locationWatcher=Yt(this);constructor(t,n){this.contentScriptName=t,this.options=n,this.id=Math.random().toString(36).slice(2),this.abortController=new AbortController,this.stopOldScripts(),this.listenForNewerScripts()}get signal(){return this.abortController.signal}abort(t){return this.abortController.abort(t)}get isInvalid(){return Oe.runtime?.id==null&&this.notifyInvalidated(),this.signal.aborted}get isValid(){return!this.isInvalid}onInvalidated(t){return this.signal.addEventListener("abort",t),()=>this.signal.removeEventListener("abort",t)}block(){return new Promise(()=>{})}setInterval(t,n){const i=setInterval(()=>{this.isValid&&t()},n);return this.onInvalidated(()=>clearInterval(i)),i}setTimeout(t,n){const i=setTimeout(()=>{this.isValid&&t()},n);return this.onInvalidated(()=>clearTimeout(i)),i}requestAnimationFrame(t){const n=requestAnimationFrame((...i)=>{this.isValid&&t(...i)});return this.onInvalidated(()=>cancelAnimationFrame(n)),n}requestIdleCallback(t,n){const i=requestIdleCallback((...o)=>{this.signal.aborted||t(...o)},n);return this.onInvalidated(()=>cancelIdleCallback(i)),i}addEventListener(t,n,i,o){n==="wxt:locationchange"&&this.isValid&&this.locationWatcher.run(),t.addEventListener?.(n.startsWith("wxt:")?ae(n):n,i,{...o,signal:this.signal})}notifyInvalidated(){this.abort("Content script context invalidated"),Gt.debug(`Content script "${this.contentScriptName}" context invalidated`)}stopOldScripts(){document.dispatchEvent(new CustomEvent(N.SCRIPT_STARTED_MESSAGE_TYPE,{detail:{contentScriptName:this.contentScriptName,messageId:this.id}})),window.postMessage({type:N.SCRIPT_STARTED_MESSAGE_TYPE,contentScriptName:this.contentScriptName,messageId:this.id},"*")}verifyScriptStartedEvent(t){const n=t.detail?.contentScriptName===this.contentScriptName,i=t.detail?.messageId===this.id;return n&&!i}listenForNewerScripts(){const t=n=>{!(n instanceof CustomEvent)||!this.verifyScriptStartedEvent(n)||this.notifyInvalidated()};document.addEventListener(N.SCRIPT_STARTED_MESSAGE_TYPE,t),this.onInvalidated(()=>document.removeEventListener(N.SCRIPT_STARTED_MESSAGE_TYPE,t))}};function en(){}function F(e,...t){}const Xt={debug:(...e)=>F(console.debug,...e),log:(...e)=>F(console.log,...e),warn:(...e)=>F(console.warn,...e),error:(...e)=>F(console.error,...e)};return(async()=>{try{const{main:e,...t}=Kt;return await e(new Qt("content",t))}catch(e){throw Xt.error('The content script "content" crashed on startup!',e),e}})()})();
content;