var content=(function(){"use strict";function en(e){return e}const le={chat:{navigateToSearch:"Insert",toggleSidebar:"Delete",toggleHistoryMode:"End",scrollUp:"PageUp",scrollDown:"PageDown",historyUp:"ArrowUp",historyDown:"ArrowDown",historyOpen:"Enter",historyExit:"Escape"},search:{moveUp:"ArrowUp",moveDown:"ArrowDown",openResult:"Enter",scrollUp:"PageUp",scrollDown:"PageDown"}};let $=null;function Ve(){return new Promise(e=>{chrome.storage.sync.get(["shortcuts"],t=>{t.shortcuts?$=t.shortcuts:$=JSON.parse(JSON.stringify(le)),e($)})})}function ce(){return $||le}function h(e,t){const n=ce(),o=t.split(".");let i=n;for(const r of o)if(i=i[r],!i)return!1;if(typeof i=="object"){const r=i.meta?e.metaKey:!e.metaKey,a=i.ctrl?e.ctrlKey:!e.ctrlKey,s=i.shift?e.shiftKey:!e.shiftKey;return e.code===i.key&&r&&a&&s}return e.code===i&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey}const Fe=500,Ge=300,de=10,ue=40,pe=100;let g=null,f=-1,w=[],Y=null;function U(){return g!==null&&g.style.display==="block"&&w.length>0}function v(e){e.preventDefault(),e.stopPropagation(),e.stopImmediatePropagation()}function O(e){e==="next"?f=f<0?0:(f+1)%w.length:f=f<0||f<=0?w.length-1:f-1,fe()}async function me(e){if(!e||e.trim().length===0)return[];try{const t=encodeURIComponent(e.trim());return(await(await fetch(`https://www.google.co.jp/complete/search?output=firefox&hl=ja&ie=utf-8&oe=utf-8&q=${t}`)).json())[1]||[]}catch{return[]}}function Ye(){if(g)return g;const e=document.createElement("div");return e.className="gemini-autocomplete-list",e.style.cssText=`
    position: fixed;
    background: white;
    border: 1px solid #ddd;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    overflow-y: auto;
    z-index: 10000;
    display: none;
    min-width: 300px;
  `,document.body.appendChild(e),g=e,e}function Qe(e,t,n){const o=e.getBoundingClientRect();t.style.left=`${o.left}px`,t.style.width=`${o.width}px`,t.style.display="block";const i=window.innerHeight-o.bottom-de,r=o.top-de,a=Math.floor(i/ue),s=Math.floor(r/ue);a<n.length&&s>a?(t.style.bottom=`${window.innerHeight-o.top}px`,t.style.top="auto",t.style.maxHeight=`${Math.max(r,pe)}px`):(t.style.top=`${o.bottom}px`,t.style.bottom="auto",t.style.maxHeight=`${Math.max(i,pe)}px`)}function he(e,t){if(!t||t.length===0){x();return}const n=Ye();n.innerHTML="",w=t,f=-1,t.forEach((o,i)=>{const r=document.createElement("div");r.className="gemini-autocomplete-item",r.textContent=o,r.style.cssText=`
      padding: 10px 16px;
      cursor: pointer;
      font-size: 14px;
      border-bottom: 1px solid #f0f0f0;
    `,r.addEventListener("mouseenter",()=>{f=i,fe()}),r.addEventListener("click",()=>{Q(e,o)}),n.appendChild(r)}),Qe(e,n,t)}function x(){g&&(g.style.display="none"),w=[],f=-1}function fe(){if(!g)return;g.querySelectorAll(".gemini-autocomplete-item").forEach((t,n)=>{t.style.backgroundColor=n===f?"#e8f0fe":"transparent"})}function Q(e,t){if(e.contentEditable==="true"){for(;e.firstChild;)e.removeChild(e.firstChild);const n=document.createElement("p");n.textContent=t,e.appendChild(n),e.focus();const o=document.createRange(),i=window.getSelection();o.selectNodeContents(e),o.collapse(!1),i?.removeAllRanges(),i?.addRange(o),e.dispatchEvent(new Event("input",{bubbles:!0}))}else e.value=t,e.focus(),e.setSelectionRange(t.length,t.length),e.dispatchEvent(new Event("input",{bubbles:!0}));x()}function X(){const e=document.querySelector('div[contenteditable="true"][role="textbox"]');if(!e){setTimeout(X,Fe);return}e.addEventListener("keydown",async t=>{if(!(!t.isTrusted||t.isComposing)){if(t.metaKey&&t.code==="Space"){v(t);const o=(e.textContent||"").trim();if(o.length===0){x();return}const i=await me(o);he(e,i);return}if(U())if(t.key==="Tab"||t.key==="ArrowDown")v(t),O("next");else if(t.key==="ArrowUp")v(t),O("prev");else if(t.key==="Enter"){v(t);const n=f>=0?f:0;Q(e,w[n])}else t.key==="Escape"&&(t.preventDefault(),x())}},!0),document.addEventListener("click",t=>{g&&!g.contains(t.target)&&t.target!==e&&x()})}function ge(){if(!window.location.pathname.startsWith("/search"))return;let e=0;const t=10,n=setInterval(()=>{e++;const o=document.querySelector('input[data-test-id="search-input"]')||document.querySelector('input[type="text"][placeholder*="検索"]')||document.querySelector('input[type="text"]');o?(clearInterval(n),o.addEventListener("input",i=>{if(!i.isTrusted)return;if(Y&&clearTimeout(Y),(o.value||"").trim().length===0){x();return}Y=setTimeout(async()=>{const s=(o.value||"").trim();if(s.length===0){x();return}const l=await me(s);he(o,l)},Ge)}),o.addEventListener("keydown",i=>{!i.isTrusted||i.isComposing||U()&&(i.key==="Tab"||i.key==="ArrowDown"?(v(i),O("next")):i.key==="ArrowUp"?(v(i),O("prev")):i.key==="Enter"?f>=0&&(v(i),Q(o,w[f])):i.key==="Escape"&&(i.preventDefault(),x()))},!0),document.addEventListener("click",i=>{g&&!g.contains(i.target)&&i.target!==o&&x()})):e>=t&&clearInterval(n)},500)}let T=null,M=0;const Xe=5e3;function Je(){const e=Date.now();if(T&&e-M<Xe)return T;const t=document.querySelector("infinite-scroller.chat-history");if(t&&t.scrollHeight>t.clientHeight)return T=t,M=e,t;if(document.documentElement.scrollHeight>document.documentElement.clientHeight)return T=document.documentElement,M=e,document.documentElement;const n=["infinite-scroller",'main[class*="main"]',".conversation-container",'[class*="chat-history"]','[class*="messages"]',"main",'[class*="scroll"]','div[class*="conversation"]'];for(const o of n){const i=document.querySelector(o);if(i&&i.scrollHeight>i.clientHeight)return T=i,M=e,i}return T=document.documentElement,M=e,document.documentElement}function be(e){const t=Je(),n=window.innerHeight*.1,o=e==="up"?-n:n;t===document.documentElement||t===document.body?window.scrollBy({top:o,behavior:"auto"}):t.scrollBy({top:o,behavior:"auto"})}function ye(){const e=document.querySelector('div[contenteditable="true"][role="textbox"]')||document.querySelector('[contenteditable="true"]');if(e&&(e.focus(),e.contentEditable==="true")){const t=document.createRange(),n=window.getSelection();t.selectNodeContents(e),t.collapse(!1),n?.removeAllRanges(),n?.addRange(t)}}function Ze(){let e=0;const t=10,n=setInterval(()=>{e++;const o=document.querySelector('div[contenteditable="true"][role="textbox"]');if(o){for(clearInterval(n);o.firstChild;)o.removeChild(o.firstChild);const i=document.createElement("p");i.appendChild(document.createElement("br")),o.appendChild(i),o.focus(),o.dispatchEvent(new Event("input",{bubbles:!0}))}else e>=t&&clearInterval(n)},200)}function et(){const e=window.location.pathname;if(e!=="/app"&&e!=="/app/")return;const t=new URLSearchParams(window.location.search),n=t.get("q");if(!n)return;const o=t.get("send"),i=o===null||o==="true"||o==="1";let r=0;const a=20,s=setInterval(()=>{r++;const l=document.querySelector('div[contenteditable="true"][role="textbox"]');if(l){for(clearInterval(s);l.firstChild;)l.removeChild(l.firstChild);const c=document.createElement("p");c.textContent=n,l.appendChild(c),l.focus();const d=document.createRange(),p=window.getSelection();d.selectNodeContents(l),d.collapse(!1),p?.removeAllRanges(),p?.addRange(d),l.dispatchEvent(new Event("input",{bubbles:!0})),i&&setTimeout(()=>{const u=document.querySelector('button[aria-label*="送信"]')||document.querySelector('button[aria-label*="Send"]')||document.querySelector("button.send-button")||Array.from(document.querySelectorAll("button")).find(m=>m.getAttribute("aria-label")?.includes("送信")||m.getAttribute("aria-label")?.includes("Send"));u&&!u.disabled&&u.click()},500)}else r>=a&&clearInterval(s)},200)}function tt(e){const t=J();return t.length===0?!1:(e==="up"?t[t.length-1].focus():t[0].focus(),!0)}function nt(e){const t=J(),n=t.findIndex(o=>o===document.activeElement);return n===-1?!1:e==="up"?(n>0&&(t[n-1].focus(),window.rememberActionButtonPosition?.(n-1)),!0):(n<t.length-1&&(t[n+1].focus(),window.rememberActionButtonPosition?.(n+1)),!0)}function J(){return Array.from(document.querySelectorAll('button.deep-dive-button-inline, button[data-action="deep-dive"]')).filter(t=>!(t.closest('[data-test-id*="user"]')||t.closest('[data-test-id*="prompt"]')||t.closest('[class*="user"]')))}function ot(){return document.querySelector('[data-test-id="side-nav-toggle"]')||document.querySelector('button[aria-label*="メニュー"]')||document.querySelector('button[aria-label*="menu"]')||document.querySelector('button[aria-label*="Menu"]')}function it(){const e=ot();e&&e.click()}function rt(){setTimeout(()=>{et()},1e3),setTimeout(()=>{X()},1500),new MutationObserver(()=>{document.querySelector('[aria-busy="true"]')&&window.rememberActionButtonPosition?.(-1)}).observe(document.body,{attributes:!0,attributeFilter:["aria-busy"],subtree:!0})}let E=0,_=!1;function Z(){return Array.from(document.querySelectorAll('.conversation-items-container .conversation[data-test-id="conversation"]'))}function ee(e){const t=Z();if(t.length===0)return;E=Math.max(0,Math.min(e,t.length-1)),t.forEach(o=>{o.style.outline="",o.style.outlineOffset=""});const n=t[E];n&&(n.style.outline="2px solid #1a73e8",n.style.outlineOffset="-2px",n.scrollIntoView({block:"nearest",behavior:"auto"}))}function at(){ee(E-1)}function st(){ee(E+1)}function lt(){const e=Z();e.length===0||!e[E]||(e[E].click(),_=!1,e.forEach(t=>{t.style.outline="",t.style.outlineOffset=""}),Ze())}function z(){_=!1,Z().forEach(t=>{t.style.outline="",t.style.outlineOffset=""})}function xe(){_=!0,document.activeElement&&document.activeElement.blur(),ee(E)}function P(){return _}let S=0;function B(){return window.location.pathname.startsWith("/search")}function te(){let e=Array.from(document.querySelectorAll('search-snippet[tabindex="0"]'));return e.length===0&&(e=Array.from(document.querySelectorAll("search-snippet"))),e.length===0&&(e=Array.from(document.querySelectorAll('div.conversation-container[role="option"]'))),e.length===0&&(e=Array.from(document.querySelectorAll('[role="option"].conversation-container'))),e}function ne(e){const t=te();if(t.length===0)return;S=Math.max(0,Math.min(e,t.length-1)),t.forEach(o=>{o.style.outline="",o.style.outlineOffset=""});const n=t[S];n&&(n.style.outline="2px solid #1a73e8",n.style.outlineOffset="-2px",n.scrollIntoView({block:"nearest",behavior:"auto"}))}function ct(){ne(S-1);const e=document.querySelector('input[data-test-id="search-input"]');e&&e.focus()}function dt(){ne(S+1);const e=document.querySelector('input[data-test-id="search-input"]');e&&e.focus()}function ut(){const e=te();if(e.length===0||!e[S])return;const t=e[S],n=t.querySelector("div[jslog]");if(n){n.click(),["mousedown","mouseup","click"].forEach(i=>{n.dispatchEvent(new MouseEvent(i,{view:window,bubbles:!0,cancelable:!0}))}),setTimeout(()=>{t.click()},100);return}const o=t.querySelector("a[href]");if(o){o.click();return}t.click(),["mousedown","mouseup","click"].forEach(i=>{t.dispatchEvent(new MouseEvent(i,{view:window,bubbles:!0,cancelable:!0}))})}function pt(){if(!B())return;let e=0;const t=10,n=setInterval(()=>{e++,te().length>0?(S=0,ne(0),clearInterval(n)):e>=t&&clearInterval(n)},500)}function mt(){history.pushState(null,"","/search?hl=ja"),window.dispatchEvent(new PopStateEvent("popstate",{state:null}))}function we(){B()?history.back():(z(),mt())}const ve="gemini-export-note-button";let y=null;function Ee(){return new Promise((e,t)=>{const n=indexedDB.open("gemini-export",1);n.onupgradeneeded=o=>{o.target.result.createObjectStore("handles")},n.onsuccess=o=>e(o.target.result),n.onerror=()=>t(n.error)})}async function ht(){try{const e=await Ee();return new Promise(t=>{const o=e.transaction("handles","readonly").objectStore("handles").get("save_dir");o.onsuccess=()=>t(o.result||null),o.onerror=()=>t(null)})}catch{return null}}async function Se(e){try{const t=await Ee();await new Promise((n,o)=>{const i=t.transaction("handles","readwrite");i.objectStore("handles").put(e,"save_dir"),i.oncomplete=()=>n(),i.onerror=()=>o(i.error)})}catch{}}async function ft(){if(y&&await y.queryPermission({mode:"readwrite"})==="granted")return y;const e=await ht();if(e&&(await e.queryPermission({mode:"readwrite"})==="granted"||await e.requestPermission({mode:"readwrite"})==="granted"))return y=e,y;const t=await window.showDirectoryPicker({mode:"readwrite"});return await Se(t),y=t,y}function gt(e){const t=new Set(["button","svg","path","mat-icon"]);function n(i){if(i.nodeType===Node.TEXT_NODE)return i.textContent||"";if(i.nodeType!==Node.ELEMENT_NODE)return"";const r=i,a=r.tagName.toLowerCase();if(t.has(a))return"";const s=()=>Array.from(r.childNodes).map(n).join(""),l=a.match(/^h([1-6])$/);if(l){const c="#".repeat(Number(l[1])),d=s().trim();return`
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

`;case"table":return o(r)+`

`;case"thead":case"tbody":case"tr":case"td":case"th":return"";default:return s()}}function o(i){const r=Array.from(i.querySelectorAll("tr"));if(r.length===0)return"";const a=p=>Array.from(p.querySelectorAll("td, th")).map(u=>Array.from(u.childNodes).map(n).join("").replace(/\n+/g," ").trim()),[s,...l]=r,c=a(s),d=c.map(()=>"---");return[`| ${c.join(" | ")} |`,`| ${d.join(" | ")} |`,...l.map(p=>`| ${a(p).join(" | ")} |`)].join(`
`)}return Array.from(e.childNodes).map(n).join("").replace(/\n{3,}/g,`

`).trim()}const bt=[/^[+＋]$/,/^Google スプレッドシートにエクスポート$/,/^Google Sheets にエクスポート$/,/^Export to Sheets$/];function yt(e){return e.split(`
`).filter(t=>!bt.some(n=>n.test(t.trim()))).join(`
`).replace(/\n{3,}/g,`

`).trim()}async function xt(){const e=document.querySelector("infinite-scroller.chat-history");if(!e)return;L("メッセージを読み込み中...");let t=0;for(let n=0;n<30;n++){e.scrollTop=0,await new Promise(i=>setTimeout(i,400));const o=document.querySelectorAll("user-query").length;if(o===t)break;t=o}e.scrollTop=e.scrollHeight}function wt(){const e=Array.from(document.querySelectorAll("user-query")),t=Array.from(document.querySelectorAll("model-response")),n=[],o=Math.min(e.length,t.length);for(let i=0;i<o;i++){const r=Array.from(e[i].querySelectorAll(".query-text-line")).map(c=>c.innerText.trim()).filter(Boolean).join(`
`),a=t[i].querySelector("message-content .markdown"),s=a?gt(a).trim():void 0,l=s?yt(s):"";(r||l)&&n.push({user:r||"",model:l||""})}return n}function oe(){return location.pathname.split("/").pop()||"unknown"}function K(e){return'"'+e.replace(/\\/g,"\\\\").replace(/"/g,'\\"')+'"'}function Ae(e,t){return e.split(`
`).map(n=>n===""?"":t+n).join(`
`)}function vt(e){const t=new Date,n=u=>String(u).padStart(2,"0"),i=`${`${t.getFullYear()}-${n(t.getMonth()+1)}-${n(t.getDate())}`}T${n(t.getHours())}:${n(t.getMinutes())}:${n(t.getSeconds())}`,r=i.replace(/[-:T]/g,""),a=document.querySelector('[data-test-id="conversation-title"]')?.innerText?.trim(),s=(e[0]?.user||"").split(`
`).map(u=>u.trim()).filter(Boolean),l=s.find(u=>!/^https?:\/\//i.test(u))||s[0]||"Gemini chat",c=(a||l).slice(0,60),d=oe(),p=[`id: ${K(d)}`,`title: ${K("Gemini: "+c)}`,`date: ${K(i)}`,`source: ${K(location.href)}`,"tags:","  - gemini","  - fleeting","chats:"];for(const u of e)p.push("  - q: |"),p.push(Ae(u.user,"      ")),p.push("    a: |"),p.push(Ae(u.model,"      "));return{markdown:p.join(`
`),id:r,title:c}}async function Ce(e=!1){await xt();const t=wt();if(t.length===0){L("保存できる会話が見つかりません","error");return}let n;try{if(e){const l=await window.showDirectoryPicker({mode:"readwrite"});await Se(l),y=l,n=l,L(`保存先を変更: ${l.name}`)}else n=await ft()}catch{return}const{markdown:o,title:i}=vt(t),r=oe(),s=`gemini-${i.replace(/[\\/:*?"<>|]/g,"").replace(/\s+/g,"-").slice(0,40)}-${r}.yaml`;try{const d=await(await(await n.getDirectoryHandle("inbox",{create:!0})).getFileHandle(s,{create:!0})).createWritable();await d.write(o),await d.close(),L(`保存しました: inbox/${s}`)}catch{L("保存に失敗しました","error")}}function L(e,t="success"){const n=document.getElementById("gemini-export-notification");n&&n.remove();const o=document.createElement("div");o.id="gemini-export-notification",o.style.cssText=`
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
  `,o.textContent=e,document.body.appendChild(o),setTimeout(()=>o.remove(),3e3)}function Et(){if(document.getElementById(ve)||!(document.querySelector("input-area-v2")||document.querySelector("input-container")))return;const t=document.createElement("button");t.id=ve,t.title=`Save as Zettelkasten note
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
  `,t.addEventListener("mouseenter",()=>{t.style.background="#1557b0"}),t.addEventListener("mouseleave",()=>{t.style.background="#1a73e8"}),t.addEventListener("click",n=>Ce(n.shiftKey)),document.body.appendChild(t)}function De(){oe()!=="app"&&Et()}let ie=-1;function St(e){ie=e}function At(e){if(U()&&(e.key==="ArrowUp"||e.key==="ArrowDown"||e.key==="Enter"||e.key==="Tab"||e.key==="Escape"))return!1;if(h(e,"chat.navigateToSearch"))return e.preventDefault(),we(),!0;if(h(e,"search.moveUp"))return e.preventDefault(),e.stopPropagation(),e.stopImmediatePropagation(),ct(),!0;if(h(e,"search.moveDown"))return e.preventDefault(),e.stopPropagation(),e.stopImmediatePropagation(),dt(),!0;if(h(e,"search.openResult"))return e.isComposing?!1:(e.preventDefault(),e.stopPropagation(),e.stopImmediatePropagation(),ut(),!0);if(h(e,"search.scrollUp"))return e.preventDefault(),window.scrollBy({top:-window.innerHeight*.8,behavior:"auto"}),!0;if(h(e,"search.scrollDown"))return e.preventDefault(),window.scrollBy({top:window.innerHeight*.8,behavior:"auto"}),!0;const t=ce();return!!Object.values(t.chat).includes(e.code)}function Ct(e){const t=e.target.matches('input, textarea, [contenteditable="true"]');if(U()&&(e.key==="ArrowUp"||e.key==="ArrowDown"||e.key==="Enter"||e.key==="Tab"||e.key==="Escape"))return!1;if(e.code==="Home"&&!e.metaKey&&!e.ctrlKey&&!t)return e.preventDefault(),Ce(e.shiftKey),!0;if(e.ctrlKey&&e.shiftKey&&e.code==="KeyD")return e.preventDefault(),window.domAnalyzer?.copyToClipboard(),!0;if(h(e,"chat.navigateToSearch"))return e.preventDefault(),we(),!0;if(h(e,"chat.toggleSidebar"))return e.preventDefault(),it(),!0;if(h(e,"chat.toggleHistoryMode")){e.preventDefault();const n=J(),o=n.length>0;if(P())z(),ye();else if(t)if(o){let i=ie;(i<0||i>=n.length)&&(i=n.length-1),n[i].focus()}else xe();else{const i=document.activeElement;if(i&&(i.classList?.contains("deep-dive-button-inline")||i.getAttribute("data-action")==="deep-dive")){const a=n.findIndex(s=>s===i);a!==-1&&(ie=a),xe()}else ye()}return!0}if(P()&&h(e,"chat.historyExit"))return e.preventDefault(),z(),!0;if(h(e,"chat.scrollUp"))return e.preventDefault(),be("up"),!0;if(h(e,"chat.scrollDown"))return e.preventDefault(),be("down"),!0;if(P()){if(h(e,"chat.historyUp"))return e.preventDefault(),at(),!0;if(h(e,"chat.historyDown"))return e.preventDefault(),st(),!0;if(h(e,"chat.historyOpen"))return e.preventDefault(),lt(),!0}if(!P()&&t&&(h(e,"chat.historyUp")||h(e,"chat.historyDown"))){const n=document.querySelector('div[contenteditable="true"][role="textbox"]');if(n&&n.textContent?.trim()===""){e.preventDefault();const o=h(e,"chat.historyUp")?"up":"down";return tt(o),!0}}if(!P()&&!t){const n=document.activeElement;if(n&&(n.classList?.contains("deep-dive-button-inline")||n.getAttribute("data-action")==="deep-dive")){if(h(e,"chat.historyUp")||h(e,"chat.historyDown")){e.preventDefault();const i=h(e,"chat.historyUp")?"up":"down";return nt(i),!0}if(e.key==="ArrowRight"||e.key==="ArrowLeft")return!1;if(h(e,"chat.historyOpen"))return e.preventDefault(),n.click(),!0}}return!1}const Te="__geminiKeyboardHandlerVersion";function Dt(){const e=Date.now().toString();document[Te]=e,Ve().then(()=>{document.addEventListener("keydown",t=>{if(document[Te]===e){if(B()){At(t);return}Ct(t)}},!0)})}const j=[{id:"default",prompt:"これについて詳しく"}],A=Math.random().toString(36).substr(2,9);function Ie(){const e=document.querySelectorAll(".markdown-main-panel");e.length!==0&&e.forEach(t=>{const n=[],o=t.querySelectorAll("h1[data-path-to-node], h2[data-path-to-node], h3[data-path-to-node], h4[data-path-to-node], h5[data-path-to-node], h6[data-path-to-node]");o.length>0?(o.forEach(s=>{const l=s.querySelector(".deep-dive-button-inline");if(l){if(l.getAttribute("data-initialized")===A)return;s.querySelectorAll(".deep-dive-button-inline, .deep-dive-expand-button").forEach(c=>c.remove())}n.push({type:"section",element:s,getContent:()=>It(s)})}),t.querySelectorAll("table[data-path-to-node]").forEach(s=>{const l=s.closest(".table-block-component");if(l){const c=l.querySelector(".deep-dive-button-inline");if(c){if(c.getAttribute("data-initialized")===A)return;c.remove()}n.push({type:"table",element:l,getContent:()=>ke(s)})}}),Tt(t,o).forEach(s=>{const l=s.anchor.querySelector(".deep-dive-button-inline");if(l){if(l.getAttribute("data-initialized")===A)return;l.remove()}n.push({type:"orphan",element:s.anchor,getContent:()=>s.elements.map(c=>c.textContent?.trim()??"").filter(Boolean).join(`

`)})})):(t.querySelectorAll("table[data-path-to-node]").forEach(l=>{const c=l.closest(".table-block-component");if(c){const d=c.querySelector(".deep-dive-button-inline");if(d){if(d.getAttribute("data-initialized")===A)return;d.remove()}n.push({type:"table",element:c,getContent:()=>ke(l)})}}),t.querySelectorAll("blockquote[data-path-to-node]").forEach(l=>{const c=l.querySelector(".deep-dive-button-inline");if(c){if(c.getAttribute("data-initialized")===A)return;c.remove()}n.push({type:"blockquote",element:l,getContent:()=>l.textContent?.trim()??""})}),t.querySelectorAll("ol[data-path-to-node], ul[data-path-to-node]").forEach(l=>{const c=l.querySelector(":scope > .deep-dive-button-inline");if(c){if(c.getAttribute("data-initialized")===A)return;l.querySelectorAll(".deep-dive-button-inline, .deep-dive-expand-button").forEach(u=>u.remove())}let d=l.parentElement,p=!1;for(;d&&d!==t;){if((d.tagName==="OL"||d.tagName==="UL")&&d.hasAttribute("data-path-to-node")){p=!0;break}d=d.parentElement}p||n.push({type:"list",element:l,getContent:()=>kt(l)})})),n.forEach(r=>qt(r))})}function Tt(e,t){const n=new Set(Array.from(t)),o=Array.from(e.children),i=[];let r=[],a=!1;const s=l=>{r.length>0&&!l&&i.push({anchor:r[0],elements:[...r]}),r=[]};for(const l of o){const c=l.tagName,d=c==="P";n.has(l)||c==="H1"||c==="H2"||c==="H3"||c==="H4"||c==="H5"||c==="H6"?(s(a),a=!0):c==="HR"?(s(a),a=!1):d?r.push(l):(s(a),a=!1)}return s(a),i}function It(e){let t=(e.textContent?.trim()??"")+`

`,n=e.nextElementSibling;for(;n&&!n.matches("h1, h2, h3, h4, h5, h6, hr");){if(n.classList.contains("table-block-component")){n=n.nextElementSibling;continue}t+=(n.textContent?.trim()??"")+`

`,n=n.nextElementSibling}return t.trim()}function ke(e){let t="";return e.querySelectorAll("tr").forEach((o,i)=>{const r=o.querySelectorAll("td, th"),a=Array.from(r).map(s=>s.textContent?.trim()??"");t+="| "+a.join(" | ")+` |
`,i===0&&(t+="| "+a.map(()=>"---").join(" | ")+` |
`)}),t.trim()}function kt(e){return e.textContent?.trim()??""}function qt(e){const t=document.createElement("button");t.className="deep-dive-button-inline",t.setAttribute("aria-label","Deep dive into this content"),t.setAttribute("data-action","deep-dive"),t.setAttribute("data-initialized",A),t.title="Deep dive into this content",t._deepDiveTarget=e;const n=document.createElementNS("http://www.w3.org/2000/svg","svg");n.setAttribute("width","16"),n.setAttribute("height","16"),n.setAttribute("viewBox","0 0 24 24"),n.setAttribute("fill","currentColor");const o=document.createElementNS("http://www.w3.org/2000/svg","path");o.setAttribute("d","M19 15l-6 6-1.5-1.5L15 16H4V9h2v5h9l-3.5-3.5L13 9l6 6z"),n.appendChild(o),t.appendChild(n),t.addEventListener("click",r=>{r.preventDefault(),r.stopPropagation(),Be(e,r.ctrlKey)}),t.addEventListener("keydown",r=>{if(r.key==="ArrowRight"&&!r.altKey&&!r.ctrlKey&&!r.metaKey){const a=e.element.querySelector(".deep-dive-expand-button");a&&(r.preventDefault(),r.stopPropagation(),qe(e,a))}else r.key==="ArrowLeft"&&!r.altKey&&!r.ctrlKey&&!r.metaKey&&(r.preventDefault(),r.stopPropagation(),document.getElementById("deep-dive-template-popup")?(I(),t.focus()):Me(t,e))});let i=null;if((e.type==="section"||e.type==="list")&&(i=Mt(e)),e.type==="section")e.element.style.position="relative",e.element.style.display="flex",e.element.style.alignItems="center",e.element.style.gap="8px",e.element.appendChild(t),i&&e.element.appendChild(i);else if(e.type==="table"){const r=e.element.querySelector(".table-footer");if(r){const a=r.querySelector(".copy-button");a?r.insertBefore(t,a):r.appendChild(t)}}else e.type==="blockquote"?(e.element.style.position="relative",t.style.position="absolute",t.style.top="8px",t.style.right="8px",e.element.appendChild(t)):e.type==="orphan"?(e.element.style.position="relative",t.style.position="absolute",t.style.top="0",t.style.right="0",e.element.appendChild(t)):e.type==="list"&&(e.element.style.position="relative",t.style.position="absolute",t.style.top="0",t.style.right="0",e.element.appendChild(t),i&&(i.style.position="absolute",i.style.top="0",i.style.right="32px",e.element.appendChild(i)))}function Mt(e){const t=document.createElement("button");return t.className="deep-dive-expand-button",t.setAttribute("aria-label","Expand to select"),t.setAttribute("data-action","expand"),t.setAttribute("tabindex","-1"),t.title="Expand to select",t.textContent="+",t.style.fontSize="14px",t.style.fontWeight="bold",t.dataset.targetId=Math.random().toString(36).substr(2,9),e.expandButtonId=t.dataset.targetId,t.addEventListener("click",n=>{n.preventDefault(),n.stopPropagation(),qe(e,t)}),t}function qe(e,t){t.getAttribute("data-action")==="collapse"?(Bt(e),t.setAttribute("data-action","expand"),t.setAttribute("aria-label","Expand to select"),t.title="Expand to select",t.textContent="+"):(Pt(e),t.setAttribute("data-action","collapse"),t.setAttribute("aria-label","Collapse"),t.title="Collapse",t.textContent="-")}function Pt(e){if(e.type==="section"){let n=e.element.nextElementSibling;for(;n&&!n.matches("h1, h2, h3, h4, h5, h6, hr");){if(n.classList.contains("table-block-component")){n=n.nextElementSibling;continue}n.tagName==="P"&&!n.querySelector(".deep-dive-child-button")&&re(n),(n.tagName==="UL"||n.tagName==="OL")&&n.hasAttribute("data-path-to-node")&&n.querySelectorAll(":scope > li").forEach(i=>{i.querySelector(".deep-dive-child-button")||re(i)}),n=n.nextElementSibling}}else e.type==="list"&&e.element.querySelectorAll(":scope > li").forEach(n=>{n.querySelector(".deep-dive-child-button")||re(n)})}function re(e){e.style.position="relative";const t=document.createElement("button");t.className="deep-dive-button-inline deep-dive-child-button",t.setAttribute("aria-label","Deep dive into this content"),t.setAttribute("data-action","deep-dive"),t.title="Deep dive into this content",t.style.position="absolute",t.style.top="0",t.style.right="0";const n=document.createElementNS("http://www.w3.org/2000/svg","svg");n.setAttribute("width","16"),n.setAttribute("height","16"),n.setAttribute("viewBox","0 0 24 24"),n.setAttribute("fill","currentColor");const o=document.createElementNS("http://www.w3.org/2000/svg","path");o.setAttribute("d","M19 15l-6 6-1.5-1.5L15 16H4V9h2v5h9l-3.5-3.5L13 9l6 6z"),n.appendChild(o),t.appendChild(n);const i={type:"child",element:e,getContent:()=>e.textContent?.trim()??""};t.addEventListener("click",r=>{r.preventDefault(),r.stopPropagation(),Be(i,r.ctrlKey)}),t.addEventListener("keydown",r=>{r.key==="ArrowLeft"&&!r.altKey&&!r.ctrlKey&&!r.metaKey&&(r.preventDefault(),r.stopPropagation(),document.getElementById("deep-dive-template-popup")?(I(),t.focus()):Me(t,i))}),e.appendChild(t)}function Bt(e){if(e.type==="section"){let n=e.element.nextElementSibling;for(;n&&!n.matches("h1, h2, h3, h4, h5, h6, hr");){if(n.classList.contains("table-block-component")){n=n.nextElementSibling;continue}n.querySelectorAll(".deep-dive-child-button").forEach(o=>o.remove()),n=n.nextElementSibling}}else e.type==="list"&&e.element.querySelectorAll(".deep-dive-child-button").forEach(t=>t.remove())}async function Me(e,t){I();const n=await new Promise(m=>{chrome.storage.sync.get(["deepDiveModes","currentDeepDiveModeId","deepDiveRecentModes"],m)}),o=n.deepDiveModes&&n.deepDiveModes.length>0?n.deepDiveModes:j,i=n.deepDiveRecentModes||[],r=[...o].sort((m,G)=>{const N=i.indexOf(m.id),b=i.indexOf(G.id);return N===-1&&b===-1?0:N===-1?1:b===-1?-1:N-b}),a=document.createElement("div");a.className="deep-dive-template-popup",a.id="deep-dive-template-popup",a.setAttribute("role","menu");const s=(m,G,N)=>{const b=document.createElement("button");return b.className="deep-dive-template-item",b.setAttribute("role","menuitem"),b.textContent=m,G&&(b.title=G),b.addEventListener("mousedown",H=>{H.preventDefault(),H.stopPropagation()}),b.addEventListener("click",H=>{H.preventDefault(),H.stopPropagation(),I(),N()}),b};r.forEach(m=>{a.appendChild(s(m.id,m.prompt||"",()=>Lt(t,m)))}),document.body.appendChild(a);const l=e.getBoundingClientRect(),c=160;let d=l.left+window.scrollX;d+c>window.innerWidth-8&&(d=window.innerWidth-c-8),a.style.top=`${l.bottom+window.scrollY+4}px`,a.style.left=`${d}px`;const p=Array.from(a.querySelectorAll(".deep-dive-template-item"));let u=0;p[0]?.focus(),a.addEventListener("keydown",m=>{m.key==="Escape"||m.key==="ArrowLeft"?(m.preventDefault(),I(),e.focus()):m.key==="ArrowDown"?(m.preventDefault(),u=(u+1)%p.length,p[u].focus()):m.key==="ArrowUp"?(m.preventDefault(),u=(u-1+p.length)%p.length,p[u].focus()):m.key==="Tab"&&(m.preventDefault(),m.shiftKey?u=(u-1+p.length)%p.length:u=(u+1)%p.length,p[u].focus())}),setTimeout(()=>{document.addEventListener("click",I,{once:!0})},0)}function I(){document.getElementById("deep-dive-template-popup")?.remove()}function Pe(e,t){const n=document.querySelector('div[contenteditable="true"][role="textbox"]');if(!n)return;for(;n.firstChild;)n.removeChild(n.firstChild);e.split(`
`).forEach(r=>{const a=document.createElement("p");r.trim()===""?a.appendChild(document.createElement("br")):a.textContent=r,n.appendChild(a)}),n.focus();const o=document.createRange(),i=window.getSelection();o.selectNodeContents(n),o.collapse(!1),i?.removeAllRanges(),i?.addRange(o),n.dispatchEvent(new Event("input",{bubbles:!0})),t&&setTimeout(()=>{const r=document.querySelector('button[aria-label*="送信"], button[aria-label*="Send"]');r&&!r.disabled&&r.click()},100)}function Lt(e,t){const i=e.getContent().split(`
`).map(r=>`> ${r}`).join(`
`)+`

`+(t.prompt||"これについて詳しく");Pe(i,!0),chrome.storage.sync.get(["deepDiveRecentModes"],r=>{const a=(r.deepDiveRecentModes||[]).filter(s=>s!==t.id);a.unshift(t.id),chrome.storage.sync.set({deepDiveRecentModes:a.slice(0,20)})})}async function Be(e,t=!1){if(!document.querySelector('div[contenteditable="true"][role="textbox"]'))return;const o=e.getContent().split(`
`).map(a=>`> ${a}`).join(`
`);let i,r=!1;if(t)i=o+`

`;else{const a=await new Promise(u=>{chrome.storage.sync.get(["deepDiveModes","currentDeepDiveModeId"],u)}),s=a.deepDiveModes&&a.deepDiveModes.length>0?a.deepDiveModes:j;let d=new URLSearchParams(location.search).get("mode_id")||a.currentDeepDiveModeId||s[0]?.id;s.some(u=>u.id===d)||(d=s[0]?.id);const p=s.find(u=>u.id===d)||s[0]||j[0];i=o+`

`+(p.prompt||"これについて詳しく"),r=!0}Pe(i,r)}function Nt(){const e="gemini-deep-dive-styles";if(document.getElementById(e))return;const t=document.createElement("style");t.id=e,t.textContent=`
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
  `,document.head.appendChild(t)}function Le(){const e=document.getElementById("gemini-deep-dive-mode-selector");e&&e.remove(),chrome.storage.sync.get(["deepDiveModes","currentDeepDiveModeId"],t=>{const n=t.deepDiveModes&&t.deepDiveModes.length>0?t.deepDiveModes:j,o=document.createElement("div");o.id="gemini-deep-dive-mode-selector",o.className="gemini-deep-dive-mode-selector";const i=document.createElement("select");i.id="gemini-deep-dive-mode",i.title="深掘りモード",i.setAttribute("aria-label","深掘りモード"),n.forEach(p=>{const u=document.createElement("option");u.value=p.id,u.textContent=p.id,i.appendChild(u)}),i.addEventListener("change",()=>{chrome.storage.sync.set({currentDeepDiveModeId:i.value})}),o.appendChild(i);const r=document.querySelector('button[aria-label*="ファイル"], button[aria-label*="追加"]'),s=document.querySelector('button[aria-label*="ツール"], button[aria-label*="Tool"]')||r&&r.nextElementSibling;if(s&&s.parentElement)s.parentElement.insertBefore(o,s.nextSibling);else{const p=document.querySelector('div[contenteditable="true"][role="textbox"]');if(p){const u=p.closest("form")||p.parentElement?.parentElement;u?u.insertBefore(o,u.firstChild):document.body.appendChild(o)}else document.body.appendChild(o)}const c=new URLSearchParams(location.search).get("mode_id");let d=t.currentDeepDiveModeId;c&&n.some(p=>p.id===c)&&(d=c,chrome.storage.sync.set({currentDeepDiveModeId:c})),d&&n.some(p=>p.id===d)?i.value=d:n.length>0&&(i.value=n[0].id)})}let ae=null;function Ht(){Nt();const e=()=>{document.querySelector('button[aria-label*="ツール"], button[aria-label*="Tool"], button[aria-label*="ファイル"], button[aria-label*="追加"]')||document.querySelector('div[contenteditable="true"][role="textbox"]')?Le():setTimeout(e,500)};e(),chrome.storage.onChanged.addListener((n,o)=>{o==="sync"&&n.deepDiveModes&&location.href.includes("gemini.google.com")&&document.querySelector('button[aria-label*="ツール"], button[aria-label*="Tool"], div[contenteditable="true"][role="textbox"]')&&Le()}),new MutationObserver(n=>{let o=!1;for(const i of n){if(i.addedNodes.length>0){for(const r of i.addedNodes)if(r.nodeType===1){const a=r;if(a.matches?.("[data-path-to-node]")||a.querySelector?.("[data-path-to-node]")){o=!0;break}}}if(o)break}o&&(ae&&clearTimeout(ae),ae=setTimeout(()=>Ie(),500))}).observe(document.body,{childList:!0,subtree:!0}),setTimeout(()=>Ie(),1e3)}let W=!1;const k="gemini-map-panel",Ne="gemini-map-styles";function Rt(){if(document.getElementById(Ne))return;const e=document.createElement("style");e.id=Ne,e.textContent=`
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
  `,document.head.appendChild(e)}function $t(e){let n=e.querySelector('h1, h2, h3, [role="heading"]')?.textContent?.trim()||e.textContent?.trim()||"";return n=n.replace(/^あなたのプロンプト\s*/,""),n=n.replace(/^>\s*/,""),n.substring(0,60)||"(空)"}function He(){return Array.from(document.querySelectorAll("infinite-scroller.chat-history > .conversation-container"))}function Re(){const e=document.createElement("div");e.id=k;const t=document.createElement("div");t.className="map-header",t.textContent="このチャットの流れ",e.appendChild(t);const n=He();if(n.length===0){const i=document.createElement("div");return i.style.cssText="padding: 10px; opacity: 0.45; font-size: 12px;",i.textContent="チャットがまだありません",e.appendChild(i),e}const o=document.createElement("ul");return n.forEach((i,r)=>{const a=i.querySelector("user-query");if(!a)return;const s=$t(a),l=document.createElement("li"),c=document.createElement("button"),d=document.createElement("span");d.className="map-turn-index",d.textContent=`${r+1}.`,c.appendChild(d),c.appendChild(document.createTextNode(s)),c.addEventListener("click",()=>{i.scrollIntoView({behavior:"smooth",block:"start"})}),l.appendChild(c),o.appendChild(l)}),e.appendChild(o),e}function Ut(){const e=document.getElementById(k);return e?Array.from(e.querySelectorAll("li button")):[]}let C=null;const q=new Set;function $e(){C&&C.disconnect(),q.clear();const e=He();e.length!==0&&(C=new IntersectionObserver(t=>{t.forEach(i=>{const r=e.indexOf(i.target);r!==-1&&(i.isIntersecting?q.add(r):q.delete(r))});const n=Ut();if(n.forEach((i,r)=>{i.classList.toggle("map-item-current",q.has(r))}),document.getElementById(k)){const i=n.find((r,a)=>q.has(a));i&&i.scrollIntoView({block:"nearest",behavior:"smooth"})}},{threshold:.15}),e.forEach(t=>C.observe(t)))}function Ue(){C&&(C.disconnect(),C=null),q.clear()}let D=null;function Ot(){D&&D.disconnect();const e=document.querySelector("infinite-scroller.chat-history");if(!e)return;let t=null;D=new MutationObserver(()=>{W&&(t&&clearTimeout(t),t=setTimeout(()=>zt(),300))}),D.observe(e,{childList:!0,subtree:!1})}function _t(){D&&(D.disconnect(),D=null)}function zt(){if(!W)return;const e=document.getElementById(k),t=e?e.scrollTop:0;e&&e.remove(),Ue();const n=Re();document.body.appendChild(n),n.scrollTop=t,$e()}function Oe(){Rt();const e=document.getElementById(k);e&&e.remove();const t=Re();document.body.appendChild(t),W=!0,$e(),Ot()}function Kt(){_t(),Ue();const e=document.getElementById(k);e&&e.remove(),W=!1}class jt{constructor(){this.elementSelectors={textarea:['[role="textbox"][contenteditable="true"]','[aria-label*="プロンプト"]',".ql-editor.textarea",'rich-textarea [contenteditable="true"]'],sidebar:['[role="navigation"]',"bard-sidenav",".side-nav-container","aside"],sidebarToggle:['button[aria-label*="メインメニュー"]','button[aria-label*="Main menu"]','button[data-test-id="side-nav-menu-button"]'],chatHistory:['.conversation[role="button"]','[data-test-id="conversation"]',".conversation-items-container .conversation"],newChatButton:['a[href="https://gemini.google.com/app"]','a[aria-label*="新規作成"]','[data-test-id="new-chat-button"]'],copyButtons:['button[aria-label*="コピー"]','button[aria-label*="Copy"]',".copy-button"],chatContainer:["chat-window","main.main",".conversation-container"]}}findElement(t){const n=this.elementSelectors[t]||[];for(const o of n)try{const i=document.querySelector(o);if(i)return{element:i,selector:o}}catch{}return{element:null,selector:null}}findAllElements(){const t={};for(const n in this.elementSelectors)t[n]=this.findElement(n);return t}capturePageStructure(){return{timestamp:Date.now(),url:window.location.href,title:document.title,elements:this.findAllElements(),interactiveElements:this.getInteractiveElements(),metadata:{viewport:{width:window.innerWidth,height:window.innerHeight},scrollPosition:{x:window.scrollX,y:window.scrollY}}}}getInteractiveElements(){const t=[];return document.querySelectorAll('button, a, input, textarea, [role="button"], [contenteditable="true"]').forEach((i,r)=>{if(r>=50)return;const a=i.getBoundingClientRect();a.width===0||a.height===0||t.push({index:r,type:i.tagName.toLowerCase(),role:i.getAttribute("role")||"",ariaLabel:i.getAttribute("aria-label")||"",text:i.textContent?.trim().substring(0,50)||"",description:i.getAttribute("description")||"",isVisible:a.width>0&&a.height>0,position:{x:Math.round(a.x),y:Math.round(a.y)}})}),t}exportForAI(){const t=this.capturePageStructure();let n=`## Gemini Chat Page Structure

`;n+=`**URL**: ${t.url}
`,n+=`**Title**: ${t.title}

`,n+=`### Main Elements

`;for(const[o,i]of Object.entries(t.elements))i.element?n+=`- **${o}**: \`${i.selector}\` ✓
`:n+=`- **${o}**: Not found ✗
`;return n+=`
### Interactive Elements (${t.interactiveElements.length})

`,t.interactiveElements.slice(0,10).forEach(o=>{o.text&&(n+=`- [${o.type}] ${o.text} (${o.ariaLabel||o.role})
`)}),n}async copyToClipboard(){const t=this.exportForAI();try{return await navigator.clipboard.writeText(t),this.showNotification("ページ構造をクリップボードにコピーしました"),!0}catch{return this.showNotification("コピーに失敗しました","error"),!1}}showNotification(t,n="success"){const o=document.createElement("div");o.style.cssText=`
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
    `,o.textContent=t;const i=document.createElement("style");i.textContent=`
      @keyframes slideIn {
        from { transform: translateX(400px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `,document.head.appendChild(i),document.body.appendChild(o),setTimeout(()=>{o.style.transition="opacity 0.3s",o.style.opacity="0",setTimeout(()=>o.remove(),300)},3e3)}}function Wt(){window.domAnalyzer=new jt,window.analyzePage=()=>{console.log(window.domAnalyzer.capturePageStructure())},window.copyPageStructure=()=>{window.domAnalyzer.copyToClipboard()}}const Vt={matches:["https://gemini.google.com/app*","https://gemini.google.com/search*"],runAt:"document_end",main(){window.rememberActionButtonPosition=St,Wt(),Gt()}};function _e(){const e="gemini-improve-ui-custom-styles";document.getElementById(e)?.remove();const t=document.createElement("style");t.id=e,t.textContent=`
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
  `,document.head.appendChild(t)}function ze(e){document.documentElement.style.setProperty("--chat-max-width",`${e}px`)}function Ft(){chrome.storage.sync.get(["chatWidth"],e=>{ze(e.chatWidth||900)})}function Gt(){Ft(),_e(),window.addEventListener("popstate",()=>{z()});let e=location.href;new MutationObserver(()=>{const t=location.href;t!==e&&(e=t,window.rememberActionButtonPosition?.(-1),Kt(),setTimeout(()=>{X(),ge(),B()||Oe(),document.getElementById("gemini-export-note-button")?.remove(),De()},1500))}).observe(document,{subtree:!0,childList:!0}),Dt(),B()?(pt(),ge()):(rt(),Ht(),setTimeout(()=>{De()},1500),setTimeout(()=>{Oe()},1500)),chrome.storage.onChanged.addListener((t,n)=>{n==="sync"&&t.chatWidth&&(ze(t.chatWidth.newValue),_e())})}function V(e,...t){}const Yt={debug:(...e)=>V(console.debug,...e),log:(...e)=>V(console.log,...e),warn:(...e)=>V(console.warn,...e),error:(...e)=>V(console.error,...e)},Ke=globalThis.browser?.runtime?.id?globalThis.browser:globalThis.chrome;var je=class We extends Event{static EVENT_NAME=se("wxt:locationchange");constructor(t,n){super(We.EVENT_NAME,{}),this.newUrl=t,this.oldUrl=n}};function se(e){return`${Ke?.runtime?.id}:content:${e}`}const Qt=typeof globalThis.navigation?.addEventListener=="function";function Xt(e){let t,n=!1;return{run(){n||(n=!0,t=new URL(location.href),Qt?globalThis.navigation.addEventListener("navigate",o=>{const i=new URL(o.destination.url);i.href!==t.href&&(window.dispatchEvent(new je(i,t)),t=i)},{signal:e.signal}):e.setInterval(()=>{const o=new URL(location.href);o.href!==t.href&&(window.dispatchEvent(new je(o,t)),t=o)},1e3))}}}var Jt=class R{static SCRIPT_STARTED_MESSAGE_TYPE=se("wxt:content-script-started");id;abortController;locationWatcher=Xt(this);constructor(t,n){this.contentScriptName=t,this.options=n,this.id=Math.random().toString(36).slice(2),this.abortController=new AbortController,this.stopOldScripts(),this.listenForNewerScripts()}get signal(){return this.abortController.signal}abort(t){return this.abortController.abort(t)}get isInvalid(){return Ke.runtime?.id==null&&this.notifyInvalidated(),this.signal.aborted}get isValid(){return!this.isInvalid}onInvalidated(t){return this.signal.addEventListener("abort",t),()=>this.signal.removeEventListener("abort",t)}block(){return new Promise(()=>{})}setInterval(t,n){const o=setInterval(()=>{this.isValid&&t()},n);return this.onInvalidated(()=>clearInterval(o)),o}setTimeout(t,n){const o=setTimeout(()=>{this.isValid&&t()},n);return this.onInvalidated(()=>clearTimeout(o)),o}requestAnimationFrame(t){const n=requestAnimationFrame((...o)=>{this.isValid&&t(...o)});return this.onInvalidated(()=>cancelAnimationFrame(n)),n}requestIdleCallback(t,n){const o=requestIdleCallback((...i)=>{this.signal.aborted||t(...i)},n);return this.onInvalidated(()=>cancelIdleCallback(o)),o}addEventListener(t,n,o,i){n==="wxt:locationchange"&&this.isValid&&this.locationWatcher.run(),t.addEventListener?.(n.startsWith("wxt:")?se(n):n,o,{...i,signal:this.signal})}notifyInvalidated(){this.abort("Content script context invalidated"),Yt.debug(`Content script "${this.contentScriptName}" context invalidated`)}stopOldScripts(){document.dispatchEvent(new CustomEvent(R.SCRIPT_STARTED_MESSAGE_TYPE,{detail:{contentScriptName:this.contentScriptName,messageId:this.id}})),window.postMessage({type:R.SCRIPT_STARTED_MESSAGE_TYPE,contentScriptName:this.contentScriptName,messageId:this.id},"*")}verifyScriptStartedEvent(t){const n=t.detail?.contentScriptName===this.contentScriptName,o=t.detail?.messageId===this.id;return n&&!o}listenForNewerScripts(){const t=n=>{!(n instanceof CustomEvent)||!this.verifyScriptStartedEvent(n)||this.notifyInvalidated()};document.addEventListener(R.SCRIPT_STARTED_MESSAGE_TYPE,t),this.onInvalidated(()=>document.removeEventListener(R.SCRIPT_STARTED_MESSAGE_TYPE,t))}};function nn(){}function F(e,...t){}const Zt={debug:(...e)=>F(console.debug,...e),log:(...e)=>F(console.log,...e),warn:(...e)=>F(console.warn,...e),error:(...e)=>F(console.error,...e)};return(async()=>{try{const{main:e,...t}=Vt;return await e(new Jt("content",t))}catch(e){throw Zt.error('The content script "content" crashed on startup!',e),e}})()})();
content;