var content=(function(){"use strict";function dn(e){return e}const ue={chat:{focusQuickPrompt:"Insert",toggleSidebar:"Delete",toggleHistoryMode:"End",scrollUp:"PageUp",scrollDown:"PageDown",historyUp:"ArrowUp",historyDown:"ArrowDown",historyOpen:"Enter",historyExit:"Escape"},search:{moveUp:"ArrowUp",moveDown:"ArrowDown",openResult:"Enter",scrollUp:"PageUp",scrollDown:"PageDown"}};let $=null;function Xe(){return new Promise(e=>{chrome.storage.sync.get(["shortcuts"],t=>{t.shortcuts?$=t.shortcuts:$=JSON.parse(JSON.stringify(ue)),e($)})})}function pe(){return $||ue}function f(e,t){const n=pe(),o=t.split(".");let i=n;for(const r of o)if(i=i[r],!i)return!1;if(typeof i=="object"){const r=i.meta?e.metaKey:!e.metaKey,a=i.ctrl?e.ctrlKey:!e.ctrlKey,s=i.shift?e.shiftKey:!e.shiftKey;return e.code===i.key&&r&&a&&s}return e.code===i&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey}const Je=500,Ze=300,me=10,fe=40,he=100;let b=null,h=-1,v=[],Q=null;function O(){return b!==null&&b.style.display==="block"&&v.length>0}function E(e){e.preventDefault(),e.stopPropagation(),e.stopImmediatePropagation()}function U(e){e==="next"?h=h<0?0:(h+1)%v.length:h=h<0||h<=0?v.length-1:h-1,ye()}async function ge(e){if(!e||e.trim().length===0)return[];try{const t=encodeURIComponent(e.trim());return(await(await fetch(`https://www.google.co.jp/complete/search?output=firefox&hl=ja&ie=utf-8&oe=utf-8&q=${t}`)).json())[1]||[]}catch{return[]}}function et(){if(b)return b;const e=document.createElement("div");return e.className="gemini-autocomplete-list",e.style.cssText=`
    position: fixed;
    background: white;
    border: 1px solid #ddd;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    overflow-y: auto;
    z-index: 10000;
    display: none;
    min-width: 300px;
  `,document.body.appendChild(e),b=e,e}function tt(e,t,n){const o=e.getBoundingClientRect();t.style.left=`${o.left}px`,t.style.width=`${o.width}px`,t.style.display="block";const i=window.innerHeight-o.bottom-me,r=o.top-me,a=Math.floor(i/fe),s=Math.floor(r/fe);a<n.length&&s>a?(t.style.bottom=`${window.innerHeight-o.top}px`,t.style.top="auto",t.style.maxHeight=`${Math.max(r,he)}px`):(t.style.top=`${o.bottom}px`,t.style.bottom="auto",t.style.maxHeight=`${Math.max(i,he)}px`)}function be(e,t){if(!t||t.length===0){x();return}const n=et();n.innerHTML="",v=t,h=-1,t.forEach((o,i)=>{const r=document.createElement("div");r.className="gemini-autocomplete-item",r.textContent=o,r.style.cssText=`
      padding: 10px 16px;
      cursor: pointer;
      font-size: 14px;
      border-bottom: 1px solid #f0f0f0;
    `,r.addEventListener("mouseenter",()=>{h=i,ye()}),r.addEventListener("click",()=>{X(e,o)}),n.appendChild(r)}),tt(e,n,t)}function x(){b&&(b.style.display="none"),v=[],h=-1}function ye(){if(!b)return;b.querySelectorAll(".gemini-autocomplete-item").forEach((t,n)=>{t.style.backgroundColor=n===h?"#e8f0fe":"transparent"})}function X(e,t){if(e.contentEditable==="true"){for(;e.firstChild;)e.removeChild(e.firstChild);const n=document.createElement("p");n.textContent=t,e.appendChild(n),e.focus();const o=document.createRange(),i=window.getSelection();o.selectNodeContents(e),o.collapse(!1),i?.removeAllRanges(),i?.addRange(o),e.dispatchEvent(new Event("input",{bubbles:!0}))}else e.value=t,e.focus(),e.setSelectionRange(t.length,t.length),e.dispatchEvent(new Event("input",{bubbles:!0}));x()}function J(){const e=document.querySelector('div[contenteditable="true"][role="textbox"]');if(!e){setTimeout(J,Je);return}e.addEventListener("keydown",async t=>{if(!(!t.isTrusted||t.isComposing)){if(t.metaKey&&t.code==="Space"){E(t);const o=(e.textContent||"").trim();if(o.length===0){x();return}const i=await ge(o);be(e,i);return}if(O())if(t.key==="Tab"||t.key==="ArrowDown")E(t),U("next");else if(t.key==="ArrowUp")E(t),U("prev");else if(t.key==="Enter"){E(t);const n=h>=0?h:0;X(e,v[n])}else t.key==="Escape"&&(t.preventDefault(),x())}},!0),document.addEventListener("click",t=>{b&&!b.contains(t.target)&&t.target!==e&&x()})}function xe(){if(!window.location.pathname.startsWith("/search"))return;let e=0;const t=10,n=setInterval(()=>{e++;const o=document.querySelector('input[data-test-id="search-input"]')||document.querySelector('input[type="text"][placeholder*="検索"]')||document.querySelector('input[type="text"]');o?(clearInterval(n),o.addEventListener("input",i=>{if(!i.isTrusted)return;if(Q&&clearTimeout(Q),(o.value||"").trim().length===0){x();return}Q=setTimeout(async()=>{const s=(o.value||"").trim();if(s.length===0){x();return}const c=await ge(s);be(o,c)},Ze)}),o.addEventListener("keydown",i=>{!i.isTrusted||i.isComposing||O()&&(i.key==="Tab"||i.key==="ArrowDown"?(E(i),U("next")):i.key==="ArrowUp"?(E(i),U("prev")):i.key==="Enter"?h>=0&&(E(i),X(o,v[h])):i.key==="Escape"&&(i.preventDefault(),x()))},!0),document.addEventListener("click",i=>{b&&!b.contains(i.target)&&i.target!==o&&x()})):e>=t&&clearInterval(n)},500)}let I=null,B=0;const nt=5e3;function ot(){const e=Date.now();if(I&&e-B<nt)return I;const t=document.querySelector("infinite-scroller.chat-history");if(t&&t.scrollHeight>t.clientHeight)return I=t,B=e,t;if(document.documentElement.scrollHeight>document.documentElement.clientHeight)return I=document.documentElement,B=e,document.documentElement;const n=["infinite-scroller",'main[class*="main"]',".conversation-container",'[class*="chat-history"]','[class*="messages"]',"main",'[class*="scroll"]','div[class*="conversation"]'];for(const o of n){const i=document.querySelector(o);if(i&&i.scrollHeight>i.clientHeight)return I=i,B=e,i}return I=document.documentElement,B=e,document.documentElement}function we(e){const t=ot(),n=window.innerHeight*.1,o=e==="up"?-n:n;t===document.documentElement||t===document.body?window.scrollBy({top:o,behavior:"auto"}):t.scrollBy({top:o,behavior:"auto"})}function ve(){const e=document.querySelector('div[contenteditable="true"][role="textbox"]')||document.querySelector('[contenteditable="true"]');if(e&&(e.focus(),e.contentEditable==="true")){const t=document.createRange(),n=window.getSelection();t.selectNodeContents(e),t.collapse(!1),n?.removeAllRanges(),n?.addRange(t)}}function it(){let e=0;const t=10,n=setInterval(()=>{e++;const o=document.querySelector('div[contenteditable="true"][role="textbox"]');if(o){for(clearInterval(n);o.firstChild;)o.removeChild(o.firstChild);const i=document.createElement("p");i.appendChild(document.createElement("br")),o.appendChild(i),o.focus(),o.dispatchEvent(new Event("input",{bubbles:!0}))}else e>=t&&clearInterval(n)},200)}function rt(){const e=new URLSearchParams(window.location.search),t=window.location.pathname,o=t==="/app"||t==="/app/"?e.get("q"):null,i=e.get("qt"),r=o||i;if(!r)return;const a=e.get("send"),s=a===null||a==="true"||a==="1";let c=0;const l=20,u=setInterval(()=>{c++;const d=document.querySelector('div[contenteditable="true"][role="textbox"]');if(d){for(clearInterval(u);d.firstChild;)d.removeChild(d.firstChild);const p=document.createElement("p");p.textContent=r,d.appendChild(p),d.focus();const m=document.createRange(),k=window.getSelection();m.selectNodeContents(d),m.collapse(!1),k?.removeAllRanges(),k?.addRange(m),d.dispatchEvent(new Event("input",{bubbles:!0})),s&&setTimeout(()=>{const w=document.querySelector('button[aria-label*="送信"]')||document.querySelector('button[aria-label*="Send"]')||document.querySelector("button.send-button")||Array.from(document.querySelectorAll("button")).find(g=>g.getAttribute("aria-label")?.includes("送信")||g.getAttribute("aria-label")?.includes("Send"));w&&!w.disabled&&w.click()},500)}else c>=l&&clearInterval(u)},200)}function at(e){const t=Z();return t.length===0?!1:(e==="up"?t[t.length-1].focus():t[0].focus(),!0)}function st(e){const t=Z(),n=t.findIndex(o=>o===document.activeElement);return n===-1?!1:e==="up"?(n>0&&(t[n-1].focus(),window.rememberActionButtonPosition?.(n-1)),!0):(n<t.length-1&&(t[n+1].focus(),window.rememberActionButtonPosition?.(n+1)),!0)}function Z(){return Array.from(document.querySelectorAll('button.deep-dive-button-inline, button[data-action="deep-dive"]')).filter(t=>!(t.closest('[data-test-id*="user"]')||t.closest('[data-test-id*="prompt"]')||t.closest('[class*="user"]')))}function ct(){return document.querySelector('[data-test-id="side-nav-toggle"]')||document.querySelector('button[aria-label*="メニュー"]')||document.querySelector('button[aria-label*="menu"]')||document.querySelector('button[aria-label*="Menu"]')}function lt(){const e=ct();e&&e.click()}function dt(){setTimeout(()=>{rt()},1e3),setTimeout(()=>{J()},1500),new MutationObserver(()=>{document.querySelector('[aria-busy="true"]')&&window.rememberActionButtonPosition?.(-1)}).observe(document.body,{attributes:!0,attributeFilter:["aria-busy"],subtree:!0})}let S=0,_=!1;function ee(){return Array.from(document.querySelectorAll('.conversation-items-container .conversation[data-test-id="conversation"]'))}function te(e){const t=ee();if(t.length===0)return;S=Math.max(0,Math.min(e,t.length-1)),t.forEach(o=>{o.style.outline="",o.style.outlineOffset=""});const n=t[S];n&&(n.style.outline="2px solid #1a73e8",n.style.outlineOffset="-2px",n.scrollIntoView({block:"nearest",behavior:"auto"}))}function ut(){te(S-1)}function pt(){te(S+1)}function mt(){const e=ee();e.length===0||!e[S]||(e[S].click(),_=!1,e.forEach(t=>{t.style.outline="",t.style.outlineOffset=""}),it())}function ne(){_=!1,ee().forEach(t=>{t.style.outline="",t.style.outlineOffset=""})}function Ee(){_=!0,document.activeElement&&document.activeElement.blur(),te(S)}function L(){return _}let A=0;function z(){return window.location.pathname.startsWith("/search")}function oe(){let e=Array.from(document.querySelectorAll('search-snippet[tabindex="0"]'));return e.length===0&&(e=Array.from(document.querySelectorAll("search-snippet"))),e.length===0&&(e=Array.from(document.querySelectorAll('div.conversation-container[role="option"]'))),e.length===0&&(e=Array.from(document.querySelectorAll('[role="option"].conversation-container'))),e}function ie(e){const t=oe();if(t.length===0)return;A=Math.max(0,Math.min(e,t.length-1)),t.forEach(o=>{o.style.outline="",o.style.outlineOffset=""});const n=t[A];n&&(n.style.outline="2px solid #1a73e8",n.style.outlineOffset="-2px",n.scrollIntoView({block:"nearest",behavior:"auto"}))}function ft(){ie(A-1);const e=document.querySelector('input[data-test-id="search-input"]');e&&e.focus()}function ht(){ie(A+1);const e=document.querySelector('input[data-test-id="search-input"]');e&&e.focus()}function gt(){const e=oe();if(e.length===0||!e[A])return;const t=e[A],n=t.querySelector("div[jslog]");if(n){n.click(),["mousedown","mouseup","click"].forEach(i=>{n.dispatchEvent(new MouseEvent(i,{view:window,bubbles:!0,cancelable:!0}))}),setTimeout(()=>{t.click()},100);return}const o=t.querySelector("a[href]");if(o){o.click();return}t.click(),["mousedown","mouseup","click"].forEach(i=>{t.dispatchEvent(new MouseEvent(i,{view:window,bubbles:!0,cancelable:!0}))})}function bt(){if(!z())return;let e=0;const t=10,n=setInterval(()=>{e++,oe().length>0?(A=0,ie(0),clearInterval(n)):e>=t&&clearInterval(n)},500)}const Se="gemini-export-note-button";let y=null;function Ae(){return new Promise((e,t)=>{const n=indexedDB.open("gemini-export",1);n.onupgradeneeded=o=>{o.target.result.createObjectStore("handles")},n.onsuccess=o=>e(o.target.result),n.onerror=()=>t(n.error)})}async function yt(){try{const e=await Ae();return new Promise(t=>{const o=e.transaction("handles","readonly").objectStore("handles").get("save_dir");o.onsuccess=()=>t(o.result||null),o.onerror=()=>t(null)})}catch{return null}}async function Ce(e){try{const t=await Ae();await new Promise((n,o)=>{const i=t.transaction("handles","readwrite");i.objectStore("handles").put(e,"save_dir"),i.oncomplete=()=>n(),i.onerror=()=>o(i.error)})}catch{}}async function xt(){if(y&&await y.queryPermission({mode:"readwrite"})==="granted")return y;const e=await yt();if(e&&(await e.queryPermission({mode:"readwrite"})==="granted"||await e.requestPermission({mode:"readwrite"})==="granted"))return y=e,y;const t=await window.showDirectoryPicker({mode:"readwrite"});return await Ce(t),y=t,y}function wt(e){const t=new Set(["button","svg","path","mat-icon"]);function n(i){if(i.nodeType===Node.TEXT_NODE)return i.textContent||"";if(i.nodeType!==Node.ELEMENT_NODE)return"";const r=i,a=r.tagName.toLowerCase();if(t.has(a))return"";const s=()=>Array.from(r.childNodes).map(n).join(""),c=a.match(/^h([1-6])$/);if(c){const l="#".repeat(Number(c[1])),u=s().trim();return`
${l} ${u}

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

`;case"thead":case"tbody":case"tr":case"td":case"th":return"";default:return s()}}function o(i){const r=Array.from(i.querySelectorAll("tr"));if(r.length===0)return"";const a=d=>Array.from(d.querySelectorAll("td, th")).map(p=>Array.from(p.childNodes).map(n).join("").replace(/\n+/g," ").trim()),[s,...c]=r,l=a(s),u=l.map(()=>"---");return[`| ${l.join(" | ")} |`,`| ${u.join(" | ")} |`,...c.map(d=>`| ${a(d).join(" | ")} |`)].join(`
`)}return Array.from(e.childNodes).map(n).join("").replace(/\n{3,}/g,`

`).trim()}const vt=[/^[+＋]$/,/^Google スプレッドシートにエクスポート$/,/^Google Sheets にエクスポート$/,/^Export to Sheets$/];function Et(e){return e.split(`
`).filter(t=>!vt.some(n=>n.test(t.trim()))).join(`
`).replace(/\n{3,}/g,`

`).trim()}async function St(){const e=document.querySelector("infinite-scroller.chat-history");if(!e)return;N("メッセージを読み込み中...");let t=0;for(let n=0;n<30;n++){e.scrollTop=0,await new Promise(i=>setTimeout(i,400));const o=document.querySelectorAll("user-query").length;if(o===t)break;t=o}e.scrollTop=e.scrollHeight}function At(){const e=Array.from(document.querySelectorAll("user-query")),t=Array.from(document.querySelectorAll("model-response")),n=[],o=Math.min(e.length,t.length);for(let i=0;i<o;i++){const r=Array.from(e[i].querySelectorAll(".query-text-line")).map(l=>l.innerText.trim()).filter(Boolean).join(`
`),a=t[i].querySelector("message-content .markdown"),s=a?wt(a).trim():void 0,c=s?Et(s):"";(r||c)&&n.push({user:r||"",model:c||""})}return n}function re(){return location.pathname.split("/").pop()||"unknown"}function K(e){return'"'+e.replace(/\\/g,"\\\\").replace(/"/g,'\\"')+'"'}function De(e,t){return e.split(`
`).map(n=>n===""?"":t+n).join(`
`)}function Ct(e){const t=new Date,n=p=>String(p).padStart(2,"0"),i=`${`${t.getFullYear()}-${n(t.getMonth()+1)}-${n(t.getDate())}`}T${n(t.getHours())}:${n(t.getMinutes())}:${n(t.getSeconds())}`,r=i.replace(/[-:T]/g,""),a=document.querySelector('[data-test-id="conversation-title"]')?.innerText?.trim(),s=(e[0]?.user||"").split(`
`).map(p=>p.trim()).filter(Boolean),c=s.find(p=>!/^https?:\/\//i.test(p))||s[0]||"Gemini chat",l=(a||c).slice(0,60),u=re(),d=[`id: ${K(u)}`,`title: ${K("Gemini: "+l)}`,`date: ${K(i)}`,`source: ${K(location.href)}`,"tags:","  - gemini","  - fleeting","chats:"];for(const p of e)d.push("  - q: |"),d.push(De(p.user,"      ")),d.push("    a: |"),d.push(De(p.model,"      "));return{markdown:d.join(`
`),id:r,title:l}}async function Te(e=!1){await St();const t=At();if(t.length===0){N("保存できる会話が見つかりません","error");return}let n;try{if(e){const c=await window.showDirectoryPicker({mode:"readwrite"});await Ce(c),y=c,n=c,N(`保存先を変更: ${c.name}`)}else n=await xt()}catch{return}const{markdown:o,title:i}=Ct(t),r=re(),s=`gemini-${i.replace(/[\\/:*?"<>|]/g,"").replace(/\s+/g,"-").slice(0,40)}-${r}.yaml`;try{const u=await(await(await n.getDirectoryHandle("inbox",{create:!0})).getFileHandle(s,{create:!0})).createWritable();await u.write(o),await u.close(),N(`保存しました: inbox/${s}`)}catch{N("保存に失敗しました","error")}}function N(e,t="success"){const n=document.getElementById("gemini-export-notification");n&&n.remove();const o=document.createElement("div");o.id="gemini-export-notification",o.style.cssText=`
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
  `,o.textContent=e,document.body.appendChild(o),setTimeout(()=>o.remove(),3e3)}function Dt(){if(document.getElementById(Se)||!(document.querySelector("input-area-v2")||document.querySelector("input-container")))return;const t=document.createElement("button");t.id=Se,t.title=`Save as Zettelkasten note
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
  `,t.addEventListener("mouseenter",()=>{t.style.background="#1557b0"}),t.addEventListener("mouseleave",()=>{t.style.background="#1a73e8"}),t.addEventListener("click",n=>Te(n.shiftKey)),document.body.appendChild(t)}function ke(){re()!=="app"&&Dt()}const j="gemini-quick-prompt-selector",Tt="-- クイック --",Ie=["ここまでの内容をまとめて","続きを教えて","もっと詳しく教えて","具体例を挙げて"];let W=[...Ie];function kt(){return new Promise(e=>{chrome.storage.sync.get(["quickPrompts"],t=>{t.quickPrompts&&t.quickPrompts.length>0&&(W=t.quickPrompts),e(W)})})}function ae(){return document.querySelector('div[contenteditable="true"][role="textbox"]')||document.querySelector('[contenteditable="true"]')}function It(){return document.querySelector('button[aria-label*="送信"], button[aria-label*="Send"]')||document.querySelector("button.send-button")||Array.from(document.querySelectorAll("button")).find(e=>e.getAttribute("aria-label")?.includes("送信")||e.getAttribute("aria-label")?.includes("Send"))||null}function qt(e){const t=ae();if(!t)return;for(;t.firstChild;)t.removeChild(t.firstChild);const n=document.createElement("p");n.textContent=e,t.appendChild(n),t.focus();const o=document.createRange(),i=window.getSelection();o.selectNodeContents(t),o.collapse(!1),i?.removeAllRanges(),i?.addRange(o),t.dispatchEvent(new Event("input",{bubbles:!0})),setTimeout(()=>{const r=It();r&&!r.disabled&&r.click()},200)}function qe(){const e=document.getElementById(j);e&&e.remove();const t=document.createElement("div");t.id=j,t.className="gemini-deep-dive-mode-selector";const n=document.createElement("select");n.title="クイックプロンプト",n.setAttribute("aria-label","クイックプロンプト");const o=document.createElement("option");o.value="",o.textContent=Tt,o.disabled=!0,o.selected=!0,n.appendChild(o),W.forEach(c=>{const l=document.createElement("option");l.value=c,l.textContent=c.length>20?c.substring(0,18)+"…":c,l.title=c,n.appendChild(l)}),n.addEventListener("change",()=>{const c=n.value;c&&(qt(c),n.selectedIndex=0)}),t.appendChild(n);const i=document.getElementById("gemini-deep-dive-mode-selector");if(i?.parentElement){i.parentElement.insertBefore(t,i.nextSibling);return}const r=document.querySelector(".trailing-actions-wrapper");if(r){const c=r.querySelector(".model-picker-container");c?r.insertBefore(t,c):r.insertBefore(t,r.firstChild);return}const s=ae()?.closest(".text-input-field");s&&s.appendChild(t)}function Pt(){const t=document.getElementById(j)?.querySelector("select");t&&(t.focus(),t.showPicker?.())}function Pe(){kt().then(()=>{let e=0;const t=setInterval(()=>{e++,ae()?(clearInterval(t),setTimeout(()=>qe(),500)):e>=15&&clearInterval(t)},500)}),chrome.storage.onChanged.addListener((e,t)=>{t==="sync"&&e.quickPrompts&&(W=e.quickPrompts.newValue||[...Ie],document.getElementById(j)&&qe())})}let se=-1;function Mt(e){se=e}function Bt(e){if(O()&&(e.key==="ArrowUp"||e.key==="ArrowDown"||e.key==="Enter"||e.key==="Tab"||e.key==="Escape"))return!1;if(f(e,"search.moveUp"))return e.preventDefault(),e.stopPropagation(),e.stopImmediatePropagation(),ft(),!0;if(f(e,"search.moveDown"))return e.preventDefault(),e.stopPropagation(),e.stopImmediatePropagation(),ht(),!0;if(f(e,"search.openResult"))return e.isComposing?!1:(e.preventDefault(),e.stopPropagation(),e.stopImmediatePropagation(),gt(),!0);if(f(e,"search.scrollUp"))return e.preventDefault(),window.scrollBy({top:-window.innerHeight*.8,behavior:"auto"}),!0;if(f(e,"search.scrollDown"))return e.preventDefault(),window.scrollBy({top:window.innerHeight*.8,behavior:"auto"}),!0;const t=pe();return!!Object.values(t.chat).includes(e.code)}function Lt(e){const t=e.target.matches('input, textarea, [contenteditable="true"]');if(O()&&(e.key==="ArrowUp"||e.key==="ArrowDown"||e.key==="Enter"||e.key==="Tab"||e.key==="Escape"))return!1;if(e.code==="Home"&&!e.metaKey&&!e.ctrlKey&&!t)return e.preventDefault(),Te(e.shiftKey),!0;if(e.ctrlKey&&e.shiftKey&&e.code==="KeyD")return e.preventDefault(),window.domAnalyzer?.copyToClipboard(),!0;if(f(e,"chat.focusQuickPrompt"))return e.preventDefault(),Pt(),!0;if(f(e,"chat.toggleSidebar"))return e.preventDefault(),lt(),!0;if(f(e,"chat.toggleHistoryMode")){e.preventDefault();const n=Z(),o=n.length>0;if(L())ne(),ve();else if(t)if(o){let i=se;(i<0||i>=n.length)&&(i=n.length-1),n[i].focus()}else Ee();else{const i=document.activeElement;if(i&&(i.classList?.contains("deep-dive-button-inline")||i.getAttribute("data-action")==="deep-dive")){const a=n.findIndex(s=>s===i);a!==-1&&(se=a),Ee()}else ve()}return!0}if(L()&&f(e,"chat.historyExit"))return e.preventDefault(),ne(),!0;if(f(e,"chat.scrollUp"))return e.preventDefault(),we("up"),!0;if(f(e,"chat.scrollDown"))return e.preventDefault(),we("down"),!0;if(L()){if(f(e,"chat.historyUp"))return e.preventDefault(),ut(),!0;if(f(e,"chat.historyDown"))return e.preventDefault(),pt(),!0;if(f(e,"chat.historyOpen"))return e.preventDefault(),mt(),!0}if(!L()&&t&&(f(e,"chat.historyUp")||f(e,"chat.historyDown"))){const n=document.querySelector('div[contenteditable="true"][role="textbox"]');if(n&&n.textContent?.trim()===""){e.preventDefault();const o=f(e,"chat.historyUp")?"up":"down";return at(o),!0}}if(!L()&&!t){const n=document.activeElement;if(n&&(n.classList?.contains("deep-dive-button-inline")||n.getAttribute("data-action")==="deep-dive")){if(f(e,"chat.historyUp")||f(e,"chat.historyDown")){e.preventDefault();const i=f(e,"chat.historyUp")?"up":"down";return st(i),!0}if(e.key==="ArrowRight"||e.key==="ArrowLeft")return!1;if(f(e,"chat.historyOpen"))return e.preventDefault(),n.click(),!0}}return!1}const Me="__geminiKeyboardHandlerVersion";function Nt(){const e=Date.now().toString();document[Me]=e,Xe().then(()=>{document.addEventListener("keydown",t=>{if(document[Me]===e){if(z()){Bt(t);return}Lt(t)}},!0)})}const F=[{id:"default",prompt:"これについて詳しく"}],C=Math.random().toString(36).substr(2,9);function Be(){const e=document.querySelectorAll(".markdown-main-panel");e.length!==0&&e.forEach(t=>{const n=[],o=t.querySelectorAll("h1[data-path-to-node], h2[data-path-to-node], h3[data-path-to-node], h4[data-path-to-node], h5[data-path-to-node], h6[data-path-to-node]");o.length>0?(o.forEach(s=>{const c=s.querySelector(".deep-dive-button-inline");if(c){if(c.getAttribute("data-initialized")===C)return;s.querySelectorAll(".deep-dive-button-inline, .deep-dive-expand-button").forEach(l=>l.remove())}n.push({type:"section",element:s,getContent:()=>Ht(s)})}),t.querySelectorAll("table[data-path-to-node]").forEach(s=>{const c=s.closest(".table-block-component");if(c){const l=c.querySelector(".deep-dive-button-inline");if(l){if(l.getAttribute("data-initialized")===C)return;l.remove()}n.push({type:"table",element:c,getContent:()=>Le(s)})}}),Rt(t,o).forEach(s=>{const c=s.anchor.querySelector(".deep-dive-button-inline");if(c){if(c.getAttribute("data-initialized")===C)return;c.remove()}n.push({type:"orphan",element:s.anchor,getContent:()=>s.elements.map(l=>l.textContent?.trim()??"").filter(Boolean).join(`

`)})})):(t.querySelectorAll("table[data-path-to-node]").forEach(c=>{const l=c.closest(".table-block-component");if(l){const u=l.querySelector(".deep-dive-button-inline");if(u){if(u.getAttribute("data-initialized")===C)return;u.remove()}n.push({type:"table",element:l,getContent:()=>Le(c)})}}),t.querySelectorAll("blockquote[data-path-to-node]").forEach(c=>{const l=c.querySelector(".deep-dive-button-inline");if(l){if(l.getAttribute("data-initialized")===C)return;l.remove()}n.push({type:"blockquote",element:c,getContent:()=>c.textContent?.trim()??""})}),t.querySelectorAll("ol[data-path-to-node], ul[data-path-to-node]").forEach(c=>{const l=c.querySelector(":scope > .deep-dive-button-inline");if(l){if(l.getAttribute("data-initialized")===C)return;c.querySelectorAll(".deep-dive-button-inline, .deep-dive-expand-button").forEach(p=>p.remove())}let u=c.parentElement,d=!1;for(;u&&u!==t;){if((u.tagName==="OL"||u.tagName==="UL")&&u.hasAttribute("data-path-to-node")){d=!0;break}u=u.parentElement}d||n.push({type:"list",element:c,getContent:()=>$t(c)})})),n.forEach(r=>Ot(r))})}function Rt(e,t){const n=new Set(Array.from(t)),o=Array.from(e.children),i=[];let r=[],a=!1;const s=c=>{r.length>0&&!c&&i.push({anchor:r[0],elements:[...r]}),r=[]};for(const c of o){const l=c.tagName,u=l==="P";n.has(c)||l==="H1"||l==="H2"||l==="H3"||l==="H4"||l==="H5"||l==="H6"?(s(a),a=!0):l==="HR"?(s(a),a=!1):u?r.push(c):(s(a),a=!1)}return s(a),i}function Ht(e){let t=(e.textContent?.trim()??"")+`

`,n=e.nextElementSibling;for(;n&&!n.matches("h1, h2, h3, h4, h5, h6, hr");){if(n.classList.contains("table-block-component")){n=n.nextElementSibling;continue}t+=(n.textContent?.trim()??"")+`

`,n=n.nextElementSibling}return t.trim()}function Le(e){let t="";return e.querySelectorAll("tr").forEach((o,i)=>{const r=o.querySelectorAll("td, th"),a=Array.from(r).map(s=>s.textContent?.trim()??"");t+="| "+a.join(" | ")+` |
`,i===0&&(t+="| "+a.map(()=>"---").join(" | ")+` |
`)}),t.trim()}function $t(e){return e.textContent?.trim()??""}function Ot(e){const t=document.createElement("button");t.className="deep-dive-button-inline",t.setAttribute("aria-label","Deep dive into this content"),t.setAttribute("data-action","deep-dive"),t.setAttribute("data-initialized",C),t.title="Deep dive into this content",t._deepDiveTarget=e;const n=document.createElementNS("http://www.w3.org/2000/svg","svg");n.setAttribute("width","16"),n.setAttribute("height","16"),n.setAttribute("viewBox","0 0 24 24"),n.setAttribute("fill","currentColor");const o=document.createElementNS("http://www.w3.org/2000/svg","path");o.setAttribute("d","M19 15l-6 6-1.5-1.5L15 16H4V9h2v5h9l-3.5-3.5L13 9l6 6z"),n.appendChild(o),t.appendChild(n),t.addEventListener("click",r=>{r.preventDefault(),r.stopPropagation(),$e(e,r.ctrlKey)}),t.addEventListener("keydown",r=>{if(r.key==="ArrowRight"&&!r.altKey&&!r.ctrlKey&&!r.metaKey){const a=e.element.querySelector(".deep-dive-expand-button");a&&(r.preventDefault(),r.stopPropagation(),Ne(e,a))}else r.key==="ArrowLeft"&&!r.altKey&&!r.ctrlKey&&!r.metaKey&&(r.preventDefault(),r.stopPropagation(),document.getElementById("deep-dive-template-popup")?(q(),t.focus()):Re(t,e))});let i=null;if((e.type==="section"||e.type==="list")&&(i=Ut(e)),e.type==="section")e.element.style.position="relative",e.element.style.display="flex",e.element.style.alignItems="center",e.element.style.gap="8px",e.element.appendChild(t),i&&e.element.appendChild(i);else if(e.type==="table"){const r=e.element.querySelector(".table-footer");if(r){const a=r.querySelector(".copy-button");a?r.insertBefore(t,a):r.appendChild(t)}}else e.type==="blockquote"?(e.element.style.position="relative",t.style.position="absolute",t.style.top="8px",t.style.right="8px",e.element.appendChild(t)):e.type==="orphan"?(e.element.style.position="relative",t.style.position="absolute",t.style.top="0",t.style.right="0",e.element.appendChild(t)):e.type==="list"&&(e.element.style.position="relative",t.style.position="absolute",t.style.top="0",t.style.right="0",e.element.appendChild(t),i&&(i.style.position="absolute",i.style.top="0",i.style.right="32px",e.element.appendChild(i)))}function Ut(e){const t=document.createElement("button");return t.className="deep-dive-expand-button",t.setAttribute("aria-label","Expand to select"),t.setAttribute("data-action","expand"),t.setAttribute("tabindex","-1"),t.title="Expand to select",t.textContent="+",t.style.fontSize="14px",t.style.fontWeight="bold",t.dataset.targetId=Math.random().toString(36).substr(2,9),e.expandButtonId=t.dataset.targetId,t.addEventListener("click",n=>{n.preventDefault(),n.stopPropagation(),Ne(e,t)}),t}function Ne(e,t){t.getAttribute("data-action")==="collapse"?(zt(e),t.setAttribute("data-action","expand"),t.setAttribute("aria-label","Expand to select"),t.title="Expand to select",t.textContent="+"):(_t(e),t.setAttribute("data-action","collapse"),t.setAttribute("aria-label","Collapse"),t.title="Collapse",t.textContent="-")}function _t(e){if(e.type==="section"){let n=e.element.nextElementSibling;for(;n&&!n.matches("h1, h2, h3, h4, h5, h6, hr");){if(n.classList.contains("table-block-component")){n=n.nextElementSibling;continue}n.tagName==="P"&&!n.querySelector(".deep-dive-child-button")&&ce(n),(n.tagName==="UL"||n.tagName==="OL")&&n.hasAttribute("data-path-to-node")&&n.querySelectorAll(":scope > li").forEach(i=>{i.querySelector(".deep-dive-child-button")||ce(i)}),n=n.nextElementSibling}}else e.type==="list"&&e.element.querySelectorAll(":scope > li").forEach(n=>{n.querySelector(".deep-dive-child-button")||ce(n)})}function ce(e){e.style.position="relative";const t=document.createElement("button");t.className="deep-dive-button-inline deep-dive-child-button",t.setAttribute("aria-label","Deep dive into this content"),t.setAttribute("data-action","deep-dive"),t.title="Deep dive into this content",t.style.position="absolute",t.style.top="0",t.style.right="0";const n=document.createElementNS("http://www.w3.org/2000/svg","svg");n.setAttribute("width","16"),n.setAttribute("height","16"),n.setAttribute("viewBox","0 0 24 24"),n.setAttribute("fill","currentColor");const o=document.createElementNS("http://www.w3.org/2000/svg","path");o.setAttribute("d","M19 15l-6 6-1.5-1.5L15 16H4V9h2v5h9l-3.5-3.5L13 9l6 6z"),n.appendChild(o),t.appendChild(n);const i={type:"child",element:e,getContent:()=>e.textContent?.trim()??""};t.addEventListener("click",r=>{r.preventDefault(),r.stopPropagation(),$e(i,r.ctrlKey)}),t.addEventListener("keydown",r=>{r.key==="ArrowLeft"&&!r.altKey&&!r.ctrlKey&&!r.metaKey&&(r.preventDefault(),r.stopPropagation(),document.getElementById("deep-dive-template-popup")?(q(),t.focus()):Re(t,i))}),e.appendChild(t)}function zt(e){if(e.type==="section"){let n=e.element.nextElementSibling;for(;n&&!n.matches("h1, h2, h3, h4, h5, h6, hr");){if(n.classList.contains("table-block-component")){n=n.nextElementSibling;continue}n.querySelectorAll(".deep-dive-child-button").forEach(o=>o.remove()),n=n.nextElementSibling}}else e.type==="list"&&e.element.querySelectorAll(".deep-dive-child-button").forEach(t=>t.remove())}async function Re(e,t){q();const n=await new Promise(m=>{chrome.storage.sync.get(["deepDiveModes","currentDeepDiveModeId","deepDiveRecentModes"],m)}),o=n.deepDiveModes&&n.deepDiveModes.length>0?n.deepDiveModes:F,i=n.deepDiveRecentModes||[],r=[...o].sort((m,k)=>{const w=i.indexOf(m.id),g=i.indexOf(k.id);return w===-1&&g===-1?0:w===-1?1:g===-1?-1:w-g}),a=document.createElement("div");a.className="deep-dive-template-popup",a.id="deep-dive-template-popup",a.setAttribute("role","menu");const s=(m,k,w)=>{const g=document.createElement("button");return g.className="deep-dive-template-item",g.setAttribute("role","menuitem"),g.textContent=m,k&&(g.title=k),g.addEventListener("mousedown",R=>{R.preventDefault(),R.stopPropagation()}),g.addEventListener("click",R=>{R.preventDefault(),R.stopPropagation(),q(),w()}),g};r.forEach(m=>{a.appendChild(s(m.id,m.prompt||"",()=>Kt(t,m)))}),document.body.appendChild(a);const c=e.getBoundingClientRect(),l=160;let u=c.left+window.scrollX;u+l>window.innerWidth-8&&(u=window.innerWidth-l-8),a.style.top=`${c.bottom+window.scrollY+4}px`,a.style.left=`${u}px`;const d=Array.from(a.querySelectorAll(".deep-dive-template-item"));let p=0;d[0]?.focus(),a.addEventListener("keydown",m=>{m.key==="Escape"||m.key==="ArrowLeft"?(m.preventDefault(),q(),e.focus()):m.key==="ArrowDown"?(m.preventDefault(),p=(p+1)%d.length,d[p].focus()):m.key==="ArrowUp"?(m.preventDefault(),p=(p-1+d.length)%d.length,d[p].focus()):m.key==="Tab"&&(m.preventDefault(),m.shiftKey?p=(p-1+d.length)%d.length:p=(p+1)%d.length,d[p].focus())}),setTimeout(()=>{document.addEventListener("click",q,{once:!0})},0)}function q(){document.getElementById("deep-dive-template-popup")?.remove()}function He(e,t){const n=document.querySelector('div[contenteditable="true"][role="textbox"]');if(!n)return;for(;n.firstChild;)n.removeChild(n.firstChild);e.split(`
`).forEach(r=>{const a=document.createElement("p");r.trim()===""?a.appendChild(document.createElement("br")):a.textContent=r,n.appendChild(a)}),n.focus();const o=document.createRange(),i=window.getSelection();o.selectNodeContents(n),o.collapse(!1),i?.removeAllRanges(),i?.addRange(o),n.dispatchEvent(new Event("input",{bubbles:!0})),t&&setTimeout(()=>{const r=document.querySelector('button[aria-label*="送信"], button[aria-label*="Send"]');r&&!r.disabled&&r.click()},100)}function Kt(e,t){const i=e.getContent().split(`
`).map(r=>`> ${r}`).join(`
`)+`

`+(t.prompt||"これについて詳しく");He(i,!0),chrome.storage.sync.get(["deepDiveRecentModes"],r=>{const a=(r.deepDiveRecentModes||[]).filter(s=>s!==t.id);a.unshift(t.id),chrome.storage.sync.set({deepDiveRecentModes:a.slice(0,20)})})}async function $e(e,t=!1){if(!document.querySelector('div[contenteditable="true"][role="textbox"]'))return;const o=e.getContent().split(`
`).map(a=>`> ${a}`).join(`
`);let i,r=!1;if(t)i=o+`

`;else{const a=await new Promise(p=>{chrome.storage.sync.get(["deepDiveModes","currentDeepDiveModeId"],p)}),s=a.deepDiveModes&&a.deepDiveModes.length>0?a.deepDiveModes:F;let u=new URLSearchParams(location.search).get("mode_id")||a.currentDeepDiveModeId||s[0]?.id;s.some(p=>p.id===u)||(u=s[0]?.id);const d=s.find(p=>p.id===u)||s[0]||F[0];i=o+`

`+(d.prompt||"これについて詳しく"),r=!0}He(i,r)}function jt(){const e="gemini-deep-dive-styles";if(document.getElementById(e))return;const t=document.createElement("style");t.id=e,t.textContent=`
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
  `,document.head.appendChild(t)}function Oe(){const e=document.getElementById("gemini-deep-dive-mode-selector");e&&e.remove(),chrome.storage.sync.get(["deepDiveModes","currentDeepDiveModeId"],t=>{const n=t.deepDiveModes&&t.deepDiveModes.length>0?t.deepDiveModes:F,o=document.createElement("div");o.id="gemini-deep-dive-mode-selector",o.className="gemini-deep-dive-mode-selector";const i=document.createElement("select");i.id="gemini-deep-dive-mode",i.title="深掘りモード",i.setAttribute("aria-label","深掘りモード"),n.forEach(d=>{const p=document.createElement("option");p.value=d.id,p.textContent=d.id,i.appendChild(p)}),i.addEventListener("change",()=>{chrome.storage.sync.set({currentDeepDiveModeId:i.value})}),o.appendChild(i);const r=document.querySelector('button[aria-label*="ファイル"], button[aria-label*="追加"]'),s=document.querySelector('button[aria-label*="ツール"], button[aria-label*="Tool"]')||r&&r.nextElementSibling;if(s&&s.parentElement)s.parentElement.insertBefore(o,s.nextSibling);else{const d=document.querySelector('div[contenteditable="true"][role="textbox"]');if(d){const p=d.closest("form")||d.parentElement?.parentElement;p?p.insertBefore(o,p.firstChild):document.body.appendChild(o)}else document.body.appendChild(o)}const l=new URLSearchParams(location.search).get("mode_id");let u=t.currentDeepDiveModeId;l&&n.some(d=>d.id===l)&&(u=l,chrome.storage.sync.set({currentDeepDiveModeId:l})),u&&n.some(d=>d.id===u)?i.value=u:n.length>0&&(i.value=n[0].id)})}let le=null;function Wt(){jt();const e=()=>{document.querySelector('button[aria-label*="ツール"], button[aria-label*="Tool"], button[aria-label*="ファイル"], button[aria-label*="追加"]')||document.querySelector('div[contenteditable="true"][role="textbox"]')?Oe():setTimeout(e,500)};e(),chrome.storage.onChanged.addListener((n,o)=>{o==="sync"&&n.deepDiveModes&&location.href.includes("gemini.google.com")&&document.querySelector('button[aria-label*="ツール"], button[aria-label*="Tool"], div[contenteditable="true"][role="textbox"]')&&Oe()}),new MutationObserver(n=>{let o=!1;for(const i of n){if(i.addedNodes.length>0){for(const r of i.addedNodes)if(r.nodeType===1){const a=r;if(a.matches?.("[data-path-to-node]")||a.querySelector?.("[data-path-to-node]")){o=!0;break}}}if(o)break}o&&(le&&clearTimeout(le),le=setTimeout(()=>Be(),500))}).observe(document.body,{childList:!0,subtree:!0}),setTimeout(()=>Be(),1e3)}let V=!1;const P="gemini-map-panel",Ue="gemini-map-styles";function Ft(){if(document.getElementById(Ue))return;const e=document.createElement("style");e.id=Ue,e.textContent=`
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
  `,document.head.appendChild(e)}function Vt(e){let n=e.querySelector('h1, h2, h3, [role="heading"]')?.textContent?.trim()||e.textContent?.trim()||"";return n=n.replace(/^あなたのプロンプト\s*/,""),n=n.replace(/^>\s*/,""),n.substring(0,60)||"(空)"}function _e(){return Array.from(document.querySelectorAll("infinite-scroller.chat-history > .conversation-container"))}function ze(){const e=document.createElement("div");e.id=P;const t=document.createElement("div");t.className="map-header",t.textContent="このチャットの流れ",e.appendChild(t);const n=_e();if(n.length===0){const i=document.createElement("div");return i.style.cssText="padding: 10px; opacity: 0.45; font-size: 12px;",i.textContent="チャットがまだありません",e.appendChild(i),e}const o=document.createElement("ul");return n.forEach((i,r)=>{const a=i.querySelector("user-query");if(!a)return;const s=Vt(a),c=document.createElement("li"),l=document.createElement("button"),u=document.createElement("span");u.className="map-turn-index",u.textContent=`${r+1}.`,l.appendChild(u),l.appendChild(document.createTextNode(s)),l.addEventListener("click",()=>{i.scrollIntoView({behavior:"smooth",block:"start"})}),c.appendChild(l),o.appendChild(c)}),e.appendChild(o),e}function Gt(){const e=document.getElementById(P);return e?Array.from(e.querySelectorAll("li button")):[]}let D=null;const M=new Set;function Ke(){D&&D.disconnect(),M.clear();const e=_e();e.length!==0&&(D=new IntersectionObserver(t=>{t.forEach(i=>{const r=e.indexOf(i.target);r!==-1&&(i.isIntersecting?M.add(r):M.delete(r))});const n=Gt();if(n.forEach((i,r)=>{i.classList.toggle("map-item-current",M.has(r))}),document.getElementById(P)){const i=n.find((r,a)=>M.has(a));i&&i.scrollIntoView({block:"nearest",behavior:"smooth"})}},{threshold:.15}),e.forEach(t=>D.observe(t)))}function je(){D&&(D.disconnect(),D=null),M.clear()}let T=null;function Yt(){T&&T.disconnect();const e=document.querySelector("infinite-scroller.chat-history");if(!e)return;let t=null;T=new MutationObserver(()=>{V&&(t&&clearTimeout(t),t=setTimeout(()=>Xt(),300))}),T.observe(e,{childList:!0,subtree:!1})}function Qt(){T&&(T.disconnect(),T=null)}function Xt(){if(!V)return;const e=document.getElementById(P),t=e?e.scrollTop:0;e&&e.remove(),je();const n=ze();document.body.appendChild(n),n.scrollTop=t,Ke()}function We(){Ft();const e=document.getElementById(P);e&&e.remove();const t=ze();document.body.appendChild(t),V=!0,Ke(),Yt()}function Jt(){Qt(),je();const e=document.getElementById(P);e&&e.remove(),V=!1}class Zt{constructor(){this.elementSelectors={textarea:['[role="textbox"][contenteditable="true"]','[aria-label*="プロンプト"]',".ql-editor.textarea",'rich-textarea [contenteditable="true"]'],sidebar:['[role="navigation"]',"bard-sidenav",".side-nav-container","aside"],sidebarToggle:['button[aria-label*="メインメニュー"]','button[aria-label*="Main menu"]','button[data-test-id="side-nav-menu-button"]'],chatHistory:['.conversation[role="button"]','[data-test-id="conversation"]',".conversation-items-container .conversation"],newChatButton:['a[href="https://gemini.google.com/app"]','a[aria-label*="新規作成"]','[data-test-id="new-chat-button"]'],copyButtons:['button[aria-label*="コピー"]','button[aria-label*="Copy"]',".copy-button"],chatContainer:["chat-window","main.main",".conversation-container"]}}findElement(t){const n=this.elementSelectors[t]||[];for(const o of n)try{const i=document.querySelector(o);if(i)return{element:i,selector:o}}catch{}return{element:null,selector:null}}findAllElements(){const t={};for(const n in this.elementSelectors)t[n]=this.findElement(n);return t}capturePageStructure(){return{timestamp:Date.now(),url:window.location.href,title:document.title,elements:this.findAllElements(),interactiveElements:this.getInteractiveElements(),metadata:{viewport:{width:window.innerWidth,height:window.innerHeight},scrollPosition:{x:window.scrollX,y:window.scrollY}}}}getInteractiveElements(){const t=[];return document.querySelectorAll('button, a, input, textarea, [role="button"], [contenteditable="true"]').forEach((i,r)=>{if(r>=50)return;const a=i.getBoundingClientRect();a.width===0||a.height===0||t.push({index:r,type:i.tagName.toLowerCase(),role:i.getAttribute("role")||"",ariaLabel:i.getAttribute("aria-label")||"",text:i.textContent?.trim().substring(0,50)||"",description:i.getAttribute("description")||"",isVisible:a.width>0&&a.height>0,position:{x:Math.round(a.x),y:Math.round(a.y)}})}),t}exportForAI(){const t=this.capturePageStructure();let n=`## Gemini Chat Page Structure

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
    `,document.head.appendChild(i),document.body.appendChild(o),setTimeout(()=>{o.style.transition="opacity 0.3s",o.style.opacity="0",setTimeout(()=>o.remove(),300)},3e3)}}function en(){window.domAnalyzer=new Zt,window.analyzePage=()=>{console.log(window.domAnalyzer.capturePageStructure())},window.copyPageStructure=()=>{window.domAnalyzer.copyToClipboard()}}const tn={matches:["https://gemini.google.com/app*","https://gemini.google.com/search*"],runAt:"document_end",main(){window.rememberActionButtonPosition=Mt,en(),on()}};function Fe(){const e="gemini-improve-ui-custom-styles";document.getElementById(e)?.remove();const t=document.createElement("style");t.id=e,t.textContent=`
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
  `,document.head.appendChild(t)}function Ve(e){document.documentElement.style.setProperty("--chat-max-width",`${e}px`)}function nn(){chrome.storage.sync.get(["chatWidth"],e=>{Ve(e.chatWidth||900)})}function on(){nn(),Fe(),window.addEventListener("popstate",()=>{ne()});let e=location.href;new MutationObserver(()=>{const t=location.href;t!==e&&(e=t,window.rememberActionButtonPosition?.(-1),Jt(),setTimeout(()=>{J(),xe(),z()||(We(),Pe()),document.getElementById("gemini-export-note-button")?.remove(),ke()},1500))}).observe(document,{subtree:!0,childList:!0}),Nt(),z()?(bt(),xe()):(dt(),Wt(),Pe(),setTimeout(()=>{ke()},1500),setTimeout(()=>{We()},1500)),chrome.storage.onChanged.addListener((t,n)=>{n==="sync"&&t.chatWidth&&(Ve(t.chatWidth.newValue),Fe())})}function G(e,...t){}const rn={debug:(...e)=>G(console.debug,...e),log:(...e)=>G(console.log,...e),warn:(...e)=>G(console.warn,...e),error:(...e)=>G(console.error,...e)},Ge=globalThis.browser?.runtime?.id?globalThis.browser:globalThis.chrome;var Ye=class Qe extends Event{static EVENT_NAME=de("wxt:locationchange");constructor(t,n){super(Qe.EVENT_NAME,{}),this.newUrl=t,this.oldUrl=n}};function de(e){return`${Ge?.runtime?.id}:content:${e}`}const an=typeof globalThis.navigation?.addEventListener=="function";function sn(e){let t,n=!1;return{run(){n||(n=!0,t=new URL(location.href),an?globalThis.navigation.addEventListener("navigate",o=>{const i=new URL(o.destination.url);i.href!==t.href&&(window.dispatchEvent(new Ye(i,t)),t=i)},{signal:e.signal}):e.setInterval(()=>{const o=new URL(location.href);o.href!==t.href&&(window.dispatchEvent(new Ye(o,t)),t=o)},1e3))}}}var cn=class H{static SCRIPT_STARTED_MESSAGE_TYPE=de("wxt:content-script-started");id;abortController;locationWatcher=sn(this);constructor(t,n){this.contentScriptName=t,this.options=n,this.id=Math.random().toString(36).slice(2),this.abortController=new AbortController,this.stopOldScripts(),this.listenForNewerScripts()}get signal(){return this.abortController.signal}abort(t){return this.abortController.abort(t)}get isInvalid(){return Ge.runtime?.id==null&&this.notifyInvalidated(),this.signal.aborted}get isValid(){return!this.isInvalid}onInvalidated(t){return this.signal.addEventListener("abort",t),()=>this.signal.removeEventListener("abort",t)}block(){return new Promise(()=>{})}setInterval(t,n){const o=setInterval(()=>{this.isValid&&t()},n);return this.onInvalidated(()=>clearInterval(o)),o}setTimeout(t,n){const o=setTimeout(()=>{this.isValid&&t()},n);return this.onInvalidated(()=>clearTimeout(o)),o}requestAnimationFrame(t){const n=requestAnimationFrame((...o)=>{this.isValid&&t(...o)});return this.onInvalidated(()=>cancelAnimationFrame(n)),n}requestIdleCallback(t,n){const o=requestIdleCallback((...i)=>{this.signal.aborted||t(...i)},n);return this.onInvalidated(()=>cancelIdleCallback(o)),o}addEventListener(t,n,o,i){n==="wxt:locationchange"&&this.isValid&&this.locationWatcher.run(),t.addEventListener?.(n.startsWith("wxt:")?de(n):n,o,{...i,signal:this.signal})}notifyInvalidated(){this.abort("Content script context invalidated"),rn.debug(`Content script "${this.contentScriptName}" context invalidated`)}stopOldScripts(){document.dispatchEvent(new CustomEvent(H.SCRIPT_STARTED_MESSAGE_TYPE,{detail:{contentScriptName:this.contentScriptName,messageId:this.id}})),window.postMessage({type:H.SCRIPT_STARTED_MESSAGE_TYPE,contentScriptName:this.contentScriptName,messageId:this.id},"*")}verifyScriptStartedEvent(t){const n=t.detail?.contentScriptName===this.contentScriptName,o=t.detail?.messageId===this.id;return n&&!o}listenForNewerScripts(){const t=n=>{!(n instanceof CustomEvent)||!this.verifyScriptStartedEvent(n)||this.notifyInvalidated()};document.addEventListener(H.SCRIPT_STARTED_MESSAGE_TYPE,t),this.onInvalidated(()=>document.removeEventListener(H.SCRIPT_STARTED_MESSAGE_TYPE,t))}};function pn(){}function Y(e,...t){}const ln={debug:(...e)=>Y(console.debug,...e),log:(...e)=>Y(console.log,...e),warn:(...e)=>Y(console.warn,...e),error:(...e)=>Y(console.error,...e)};return(async()=>{try{const{main:e,...t}=tn;return await e(new cn("content",t))}catch(e){throw ln.error('The content script "content" crashed on startup!',e),e}})()})();
content;