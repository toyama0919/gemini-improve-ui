var content=(function(){"use strict";function hn(e){return e}const fe={chat:{focusQuickPrompt:"Insert",toggleSidebar:"Delete",toggleHistoryMode:"End",scrollUp:"PageUp",scrollDown:"PageDown",historyUp:"ArrowUp",historyDown:"ArrowDown",historyOpen:"Enter",historyExit:"Escape"},search:{moveUp:"ArrowUp",moveDown:"ArrowDown",openResult:"Enter",scrollUp:"PageUp",scrollDown:"PageDown"}};let B=null;function Ze(){return new Promise(e=>{chrome.storage.sync.get(["shortcuts"],t=>{t.shortcuts?(B=t.shortcuts,et(B)):B=JSON.parse(JSON.stringify(fe)),e(B)})})}function et(e){const t=e.chat;t.navigateToSearch&&!t.focusQuickPrompt&&(t.focusQuickPrompt=t.navigateToSearch,delete t.navigateToSearch,chrome.storage.sync.set({shortcuts:e}))}function he(){return B||fe}function f(e,t){const n=he(),o=t.split(".");let i=n;for(const r of o)if(i=i[r],!i)return!1;if(typeof i=="object"){const r=i.meta?e.metaKey:!e.metaKey,a=i.ctrl?e.ctrlKey:!e.ctrlKey,s=i.shift?e.shiftKey:!e.shiftKey;return e.code===i.key&&r&&a&&s}return e.code===i&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey}const tt=500,nt=300,be=10,ge=40,ye=100;let g=null,h=-1,v=[],J=null;function U(){return g!==null&&g.style.display==="block"&&v.length>0}function E(e){e.preventDefault(),e.stopPropagation(),e.stopImmediatePropagation()}function _(e){e==="next"?h=h<0?0:(h+1)%v.length:h=h<0||h<=0?v.length-1:h-1,ve()}async function we(e){if(!e||e.trim().length===0)return[];try{const t=encodeURIComponent(e.trim());return(await(await fetch(`https://www.google.co.jp/complete/search?output=firefox&hl=ja&ie=utf-8&oe=utf-8&q=${t}`)).json())[1]||[]}catch{return[]}}function ot(){if(g)return g;const e=document.createElement("div");return e.className="gemini-autocomplete-list",e.style.cssText=`
    position: fixed;
    background: white;
    border: 1px solid #ddd;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    overflow-y: auto;
    z-index: 10000;
    display: none;
    min-width: 300px;
  `,document.body.appendChild(e),g=e,e}function it(e,t,n){const o=e.getBoundingClientRect();t.style.left=`${o.left}px`,t.style.width=`${o.width}px`,t.style.display="block";const i=window.innerHeight-o.bottom-be,r=o.top-be,a=Math.floor(i/ge),s=Math.floor(r/ge);a<n.length&&s>a?(t.style.bottom=`${window.innerHeight-o.top}px`,t.style.top="auto",t.style.maxHeight=`${Math.max(r,ye)}px`):(t.style.top=`${o.bottom}px`,t.style.bottom="auto",t.style.maxHeight=`${Math.max(i,ye)}px`)}function xe(e,t){if(!t||t.length===0){w();return}const n=ot();n.innerHTML="",v=t,h=-1,t.forEach((o,i)=>{const r=document.createElement("div");r.className="gemini-autocomplete-item",r.textContent=o,r.style.cssText=`
      padding: 10px 16px;
      cursor: pointer;
      font-size: 14px;
      border-bottom: 1px solid #f0f0f0;
    `,r.addEventListener("mouseenter",()=>{h=i,ve()}),r.addEventListener("click",()=>{Z(e,o)}),n.appendChild(r)}),it(e,n,t)}function w(){g&&(g.style.display="none"),v=[],h=-1}function ve(){if(!g)return;g.querySelectorAll(".gemini-autocomplete-item").forEach((t,n)=>{t.style.backgroundColor=n===h?"#e8f0fe":"transparent"})}function Z(e,t){if(e.contentEditable==="true"){for(;e.firstChild;)e.removeChild(e.firstChild);const n=document.createElement("p");n.textContent=t,e.appendChild(n),e.focus();const o=document.createRange(),i=window.getSelection();o.selectNodeContents(e),o.collapse(!1),i?.removeAllRanges(),i?.addRange(o),e.dispatchEvent(new Event("input",{bubbles:!0}))}else e.value=t,e.focus(),e.setSelectionRange(t.length,t.length),e.dispatchEvent(new Event("input",{bubbles:!0}));w()}function ee(){const e=document.querySelector('div[contenteditable="true"][role="textbox"]');if(!e){setTimeout(ee,tt);return}e.addEventListener("keydown",async t=>{if(!(!t.isTrusted||t.isComposing)){if(t.metaKey&&t.code==="Space"){E(t);const o=(e.textContent||"").trim();if(o.length===0){w();return}const i=await we(o);xe(e,i);return}if(U())if(t.key==="Tab"||t.key==="ArrowDown")E(t),_("next");else if(t.key==="ArrowUp")E(t),_("prev");else if(t.key==="Enter"){E(t);const n=h>=0?h:0;Z(e,v[n])}else t.key==="Escape"&&(t.preventDefault(),w())}},!0),document.addEventListener("click",t=>{g&&!g.contains(t.target)&&t.target!==e&&w()})}function Ee(){if(!window.location.pathname.startsWith("/search"))return;let e=0;const t=10,n=setInterval(()=>{e++;const o=document.querySelector('input[data-test-id="search-input"]')||document.querySelector('input[type="text"][placeholder*="検索"]')||document.querySelector('input[type="text"]');o?(clearInterval(n),o.addEventListener("input",i=>{if(!i.isTrusted)return;if(J&&clearTimeout(J),(o.value||"").trim().length===0){w();return}J=setTimeout(async()=>{const s=(o.value||"").trim();if(s.length===0){w();return}const l=await we(s);xe(o,l)},nt)}),o.addEventListener("keydown",i=>{!i.isTrusted||i.isComposing||U()&&(i.key==="Tab"||i.key==="ArrowDown"?(E(i),_("next")):i.key==="ArrowUp"?(E(i),_("prev")):i.key==="Enter"?h>=0&&(E(i),Z(o,v[h])):i.key==="Escape"&&(i.preventDefault(),w()))},!0),document.addEventListener("click",i=>{g&&!g.contains(i.target)&&i.target!==o&&w()})):e>=t&&clearInterval(n)},500)}let I=null,L=0;const rt=5e3;function at(){const e=Date.now();if(I&&e-L<rt)return I;const t=document.querySelector("infinite-scroller.chat-history");if(t&&t.scrollHeight>t.clientHeight)return I=t,L=e,t;if(document.documentElement.scrollHeight>document.documentElement.clientHeight)return I=document.documentElement,L=e,document.documentElement;const n=["infinite-scroller",'main[class*="main"]',".conversation-container",'[class*="chat-history"]','[class*="messages"]',"main",'[class*="scroll"]','div[class*="conversation"]'];for(const o of n){const i=document.querySelector(o);if(i&&i.scrollHeight>i.clientHeight)return I=i,L=e,i}return I=document.documentElement,L=e,document.documentElement}function Se(e){const t=at(),n=window.innerHeight*.1,o=e==="up"?-n:n;t===document.documentElement||t===document.body?window.scrollBy({top:o,behavior:"auto"}):t.scrollBy({top:o,behavior:"auto"})}function te(){const e=document.querySelector('div[contenteditable="true"][role="textbox"]')||document.querySelector('[contenteditable="true"]');if(e&&(e.focus(),e.contentEditable==="true")){const t=document.createRange(),n=window.getSelection();t.selectNodeContents(e),t.collapse(!1),n?.removeAllRanges(),n?.addRange(t)}}function st(){let e=0;const t=10,n=setInterval(()=>{e++;const o=document.querySelector('div[contenteditable="true"][role="textbox"]');if(o){for(clearInterval(n);o.firstChild;)o.removeChild(o.firstChild);const i=document.createElement("p");i.appendChild(document.createElement("br")),o.appendChild(i),o.focus(),o.dispatchEvent(new Event("input",{bubbles:!0}))}else e>=t&&clearInterval(n)},200)}function lt(){const e=new URLSearchParams(window.location.search),t=window.location.pathname,o=t==="/app"||t==="/app/"?e.get("q"):null,i=e.get("qt"),r=o||i;if(!r)return;const a=e.get("send"),s=a===null||a==="true"||a==="1";let l=0;const c=20,u=setInterval(()=>{l++;const d=document.querySelector('div[contenteditable="true"][role="textbox"]');if(d){for(clearInterval(u);d.firstChild;)d.removeChild(d.firstChild);const p=document.createElement("p");p.textContent=r,d.appendChild(p),d.focus();const m=document.createRange(),D=window.getSelection();m.selectNodeContents(d),m.collapse(!1),D?.removeAllRanges(),D?.addRange(m),d.dispatchEvent(new Event("input",{bubbles:!0})),s&&setTimeout(()=>{const x=document.querySelector('button[aria-label*="送信"]')||document.querySelector('button[aria-label*="Send"]')||document.querySelector("button.send-button")||Array.from(document.querySelectorAll("button")).find(b=>b.getAttribute("aria-label")?.includes("送信")||b.getAttribute("aria-label")?.includes("Send"));x&&!x.disabled&&x.click()},500)}else l>=c&&clearInterval(u)},200)}function ct(e){const t=ne();return t.length===0?!1:(e==="up"?t[t.length-1].focus():t[0].focus(),!0)}function dt(e){const t=ne(),n=t.findIndex(o=>o===document.activeElement);return n===-1?!1:e==="up"?(n>0&&(t[n-1].focus(),window.rememberActionButtonPosition?.(n-1)),!0):(n<t.length-1&&(t[n+1].focus(),window.rememberActionButtonPosition?.(n+1)),!0)}function ne(){return Array.from(document.querySelectorAll('button.deep-dive-button-inline, button[data-action="deep-dive"]')).filter(t=>!(t.closest('[data-test-id*="user"]')||t.closest('[data-test-id*="prompt"]')||t.closest('[class*="user"]')))}function ut(){return document.querySelector('[data-test-id="side-nav-toggle"]')||document.querySelector('button[aria-label*="メニュー"]')||document.querySelector('button[aria-label*="menu"]')||document.querySelector('button[aria-label*="Menu"]')}function pt(){const e=ut();e&&e.click()}function mt(){setTimeout(()=>{lt()},1e3),setTimeout(()=>{ee()},1500),new MutationObserver(()=>{document.querySelector('[aria-busy="true"]')&&window.rememberActionButtonPosition?.(-1)}).observe(document.body,{attributes:!0,attributeFilter:["aria-busy"],subtree:!0})}let S=0,z=!1;function oe(){return Array.from(document.querySelectorAll('.conversation-items-container .conversation[data-test-id="conversation"]'))}function ie(e){const t=oe();if(t.length===0)return;S=Math.max(0,Math.min(e,t.length-1)),t.forEach(o=>{o.style.outline="",o.style.outlineOffset=""});const n=t[S];n&&(n.style.outline="2px solid #1a73e8",n.style.outlineOffset="-2px",n.scrollIntoView({block:"nearest",behavior:"auto"}))}function ft(){ie(S-1)}function ht(){ie(S+1)}function bt(){const e=oe();e.length===0||!e[S]||(e[S].click(),z=!1,e.forEach(t=>{t.style.outline="",t.style.outlineOffset=""}),st())}function re(){z=!1,oe().forEach(t=>{t.style.outline="",t.style.outlineOffset=""})}function Ae(){z=!0,document.activeElement&&document.activeElement.blur(),ie(S)}function N(){return z}let A=0;function K(){return window.location.pathname.startsWith("/search")}function ae(){let e=Array.from(document.querySelectorAll('search-snippet[tabindex="0"]'));return e.length===0&&(e=Array.from(document.querySelectorAll("search-snippet"))),e.length===0&&(e=Array.from(document.querySelectorAll('div.conversation-container[role="option"]'))),e.length===0&&(e=Array.from(document.querySelectorAll('[role="option"].conversation-container'))),e}function se(e){const t=ae();if(t.length===0)return;A=Math.max(0,Math.min(e,t.length-1)),t.forEach(o=>{o.style.outline="",o.style.outlineOffset=""});const n=t[A];n&&(n.style.outline="2px solid #1a73e8",n.style.outlineOffset="-2px",n.scrollIntoView({block:"nearest",behavior:"auto"}))}function gt(){se(A-1);const e=document.querySelector('input[data-test-id="search-input"]');e&&e.focus()}function yt(){se(A+1);const e=document.querySelector('input[data-test-id="search-input"]');e&&e.focus()}function wt(){const e=ae();if(e.length===0||!e[A])return;const t=e[A],n=t.querySelector("div[jslog]");if(n){n.click(),["mousedown","mouseup","click"].forEach(i=>{n.dispatchEvent(new MouseEvent(i,{view:window,bubbles:!0,cancelable:!0}))}),setTimeout(()=>{t.click()},100);return}const o=t.querySelector("a[href]");if(o){o.click();return}t.click(),["mousedown","mouseup","click"].forEach(i=>{t.dispatchEvent(new MouseEvent(i,{view:window,bubbles:!0,cancelable:!0}))})}function xt(){if(!K())return;let e=0;const t=10,n=setInterval(()=>{e++,ae().length>0?(A=0,se(0),clearInterval(n)):e>=t&&clearInterval(n)},500)}const Ce="gemini-export-note-button";let y=null;function ke(){return new Promise((e,t)=>{const n=indexedDB.open("gemini-export",1);n.onupgradeneeded=o=>{o.target.result.createObjectStore("handles")},n.onsuccess=o=>e(o.target.result),n.onerror=()=>t(n.error)})}async function vt(){try{const e=await ke();return new Promise(t=>{const o=e.transaction("handles","readonly").objectStore("handles").get("save_dir");o.onsuccess=()=>t(o.result||null),o.onerror=()=>t(null)})}catch{return null}}async function Te(e){try{const t=await ke();await new Promise((n,o)=>{const i=t.transaction("handles","readwrite");i.objectStore("handles").put(e,"save_dir"),i.oncomplete=()=>n(),i.onerror=()=>o(i.error)})}catch{}}async function Et(){if(y&&await y.queryPermission({mode:"readwrite"})==="granted")return y;const e=await vt();if(e&&(await e.queryPermission({mode:"readwrite"})==="granted"||await e.requestPermission({mode:"readwrite"})==="granted"))return y=e,y;const t=await window.showDirectoryPicker({mode:"readwrite"});return await Te(t),y=t,y}function St(e){const t=new Set(["button","svg","path","mat-icon"]);function n(i){if(i.nodeType===Node.TEXT_NODE)return i.textContent||"";if(i.nodeType!==Node.ELEMENT_NODE)return"";const r=i,a=r.tagName.toLowerCase();if(t.has(a))return"";const s=()=>Array.from(r.childNodes).map(n).join(""),l=a.match(/^h([1-6])$/);if(l){const c="#".repeat(Number(l[1])),u=s().trim();return`
${c} ${u}

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

`;case"thead":case"tbody":case"tr":case"td":case"th":return"";default:return s()}}function o(i){const r=Array.from(i.querySelectorAll("tr"));if(r.length===0)return"";const a=d=>Array.from(d.querySelectorAll("td, th")).map(p=>Array.from(p.childNodes).map(n).join("").replace(/\n+/g," ").trim()),[s,...l]=r,c=a(s),u=c.map(()=>"---");return[`| ${c.join(" | ")} |`,`| ${u.join(" | ")} |`,...l.map(d=>`| ${a(d).join(" | ")} |`)].join(`
`)}return Array.from(e.childNodes).map(n).join("").replace(/\n{3,}/g,`

`).trim()}const At=[/^[+＋]$/,/^Google スプレッドシートにエクスポート$/,/^Google Sheets にエクスポート$/,/^Export to Sheets$/];function Ct(e){return e.split(`
`).filter(t=>!At.some(n=>n.test(t.trim()))).join(`
`).replace(/\n{3,}/g,`

`).trim()}async function kt(){const e=document.querySelector("infinite-scroller.chat-history");if(!e)return;R("メッセージを読み込み中...");let t=0;for(let n=0;n<30;n++){e.scrollTop=0,await new Promise(i=>setTimeout(i,400));const o=document.querySelectorAll("user-query").length;if(o===t)break;t=o}e.scrollTop=e.scrollHeight}function Tt(){const e=Array.from(document.querySelectorAll("user-query")),t=Array.from(document.querySelectorAll("model-response")),n=[],o=Math.min(e.length,t.length);for(let i=0;i<o;i++){const r=Array.from(e[i].querySelectorAll(".query-text-line")).map(c=>c.innerText.trim()).filter(Boolean).join(`
`),a=t[i].querySelector("message-content .markdown"),s=a?St(a).trim():void 0,l=s?Ct(s):"";(r||l)&&n.push({user:r||"",model:l||""})}return n}function le(){return location.pathname.split("/").pop()||"unknown"}function j(e){return'"'+e.replace(/\\/g,"\\\\").replace(/"/g,'\\"')+'"'}function De(e,t){return e.split(`
`).map(n=>n===""?"":t+n).join(`
`)}function Dt(e){const t=new Date,n=p=>String(p).padStart(2,"0"),i=`${`${t.getFullYear()}-${n(t.getMonth()+1)}-${n(t.getDate())}`}T${n(t.getHours())}:${n(t.getMinutes())}:${n(t.getSeconds())}`,r=i.replace(/[-:T]/g,""),a=document.querySelector('[data-test-id="conversation-title"]')?.innerText?.trim(),s=(e[0]?.user||"").split(`
`).map(p=>p.trim()).filter(Boolean),l=s.find(p=>!/^https?:\/\//i.test(p))||s[0]||"Gemini chat",c=(a||l).slice(0,60),u=le(),d=[`id: ${j(u)}`,`title: ${j("Gemini: "+c)}`,`date: ${j(i)}`,`source: ${j(location.href)}`,"tags:","  - gemini","  - fleeting","chats:"];for(const p of e)d.push("  - q: |"),d.push(De(p.user,"      ")),d.push("    a: |"),d.push(De(p.model,"      "));return{markdown:d.join(`
`),id:r,title:c}}async function Ie(e=!1){await kt();const t=Tt();if(t.length===0){R("保存できる会話が見つかりません","error");return}let n;try{if(e){const l=await window.showDirectoryPicker({mode:"readwrite"});await Te(l),y=l,n=l,R(`保存先を変更: ${l.name}`)}else n=await Et()}catch{return}const{markdown:o,title:i}=Dt(t),r=le(),s=`gemini-${i.replace(/[\\/:*?"<>|]/g,"").replace(/\s+/g,"-").slice(0,40)}-${r}.yaml`;try{const u=await(await(await n.getDirectoryHandle("inbox",{create:!0})).getFileHandle(s,{create:!0})).createWritable();await u.write(o),await u.close(),R(`保存しました: inbox/${s}`)}catch{R("保存に失敗しました","error")}}function R(e,t="success"){const n=document.getElementById("gemini-export-notification");n&&n.remove();const o=document.createElement("div");o.id="gemini-export-notification",o.style.cssText=`
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
  `,o.textContent=e,document.body.appendChild(o),setTimeout(()=>o.remove(),3e3)}function It(){if(document.getElementById(Ce)||!(document.querySelector("input-area-v2")||document.querySelector("input-container")))return;const t=document.createElement("button");t.id=Ce,t.title=`Save as Zettelkasten note
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
  `,t.addEventListener("mouseenter",()=>{t.style.background="#1557b0"}),t.addEventListener("mouseleave",()=>{t.style.background="#1a73e8"}),t.addEventListener("click",n=>Ie(n.shiftKey)),document.body.appendChild(t)}function qe(){le()!=="app"&&It()}const H="gemini-quick-prompt-selector",qt="-- クイック --",Pe=["ここまでの内容をまとめて","続きを教えて","もっと詳しく教えて","具体例を挙げて"];let W=[...Pe];function Pt(){return new Promise(e=>{chrome.storage.sync.get(["quickPrompts"],t=>{t.quickPrompts&&t.quickPrompts.length>0&&(W=t.quickPrompts),e(W)})})}function ce(){return document.querySelector('div[contenteditable="true"][role="textbox"]')||document.querySelector('[contenteditable="true"]')}function Mt(){return document.querySelector('button[aria-label*="送信"], button[aria-label*="Send"]')||document.querySelector("button.send-button")||Array.from(document.querySelectorAll("button")).find(e=>e.getAttribute("aria-label")?.includes("送信")||e.getAttribute("aria-label")?.includes("Send"))||null}function Bt(e){const t=ce();if(!t)return;for(;t.firstChild;)t.removeChild(t.firstChild);const n=document.createElement("p");n.textContent=e,t.appendChild(n),t.focus();const o=document.createRange(),i=window.getSelection();o.selectNodeContents(t),o.collapse(!1),i?.removeAllRanges(),i?.addRange(o),t.dispatchEvent(new Event("input",{bubbles:!0})),setTimeout(()=>{const r=Mt();r&&!r.disabled&&r.click()},200)}function Me(){const e=document.getElementById(H);e&&e.remove();const t=document.createElement("div");t.id=H,t.className="gemini-deep-dive-mode-selector";const n=document.createElement("select");n.title="クイックプロンプト",n.setAttribute("aria-label","クイックプロンプト");const o=document.createElement("option");o.value="",o.textContent=qt,o.disabled=!0,o.selected=!0,n.appendChild(o),W.forEach(l=>{const c=document.createElement("option");c.value=l,c.textContent=l.length>20?l.substring(0,18)+"…":l,c.title=l,n.appendChild(c)}),n.addEventListener("change",()=>{const l=n.value;l&&(Bt(l),n.selectedIndex=0)}),t.appendChild(n);const i=document.getElementById("gemini-deep-dive-mode-selector");if(i?.parentElement){i.parentElement.insertBefore(t,i.nextSibling);return}const r=document.querySelector(".trailing-actions-wrapper");if(r){const l=r.querySelector(".model-picker-container");l?r.insertBefore(t,l):r.insertBefore(t,r.firstChild);return}const s=ce()?.closest(".text-input-field");s&&s.appendChild(t)}function Lt(){const t=document.getElementById(H)?.querySelector("select");t&&(t.focus(),t.showPicker?.())}function Nt(){return document.activeElement?.closest(`#${H}`)!==null}function Be(){Pt().then(()=>{let e=0;const t=setInterval(()=>{e++,ce()?(clearInterval(t),setTimeout(()=>Me(),500)):e>=15&&clearInterval(t)},500)}),chrome.storage.onChanged.addListener((e,t)=>{t==="sync"&&e.quickPrompts&&(W=e.quickPrompts.newValue||[...Pe],document.getElementById(H)&&Me())})}let de=-1;function Rt(e){de=e}function Ht(e){if(U()&&(e.key==="ArrowUp"||e.key==="ArrowDown"||e.key==="Enter"||e.key==="Tab"||e.key==="Escape"))return!1;if(f(e,"search.moveUp"))return e.preventDefault(),e.stopPropagation(),e.stopImmediatePropagation(),gt(),!0;if(f(e,"search.moveDown"))return e.preventDefault(),e.stopPropagation(),e.stopImmediatePropagation(),yt(),!0;if(f(e,"search.openResult"))return e.isComposing?!1:(e.preventDefault(),e.stopPropagation(),e.stopImmediatePropagation(),wt(),!0);if(f(e,"search.scrollUp"))return e.preventDefault(),window.scrollBy({top:-window.innerHeight*.8,behavior:"auto"}),!0;if(f(e,"search.scrollDown"))return e.preventDefault(),window.scrollBy({top:window.innerHeight*.8,behavior:"auto"}),!0;const t=he();return!!Object.values(t.chat).includes(e.code)}function $t(e){const t=e.target.matches('input, textarea, [contenteditable="true"]');if(U()&&(e.key==="ArrowUp"||e.key==="ArrowDown"||e.key==="Enter"||e.key==="Tab"||e.key==="Escape"))return!1;if(e.code==="Home"&&!e.metaKey&&!e.ctrlKey)return e.preventDefault(),Ie(e.shiftKey),!0;if(e.ctrlKey&&e.shiftKey&&e.code==="KeyD")return e.preventDefault(),window.domAnalyzer?.copyToClipboard(),!0;if(f(e,"chat.focusQuickPrompt")){const n=document.activeElement;if(!(n&&(n.classList?.contains("deep-dive-button-inline")||n.getAttribute("data-action")==="deep-dive")))return e.preventDefault(),Nt()?te():Lt(),!0}if(f(e,"chat.toggleSidebar"))return e.preventDefault(),pt(),!0;if(f(e,"chat.toggleHistoryMode")){e.preventDefault();const n=ne(),o=n.length>0;if(N())re(),te();else if(t)if(o){let i=de;(i<0||i>=n.length)&&(i=n.length-1),n[i].focus()}else Ae();else{const i=document.activeElement;if(i&&(i.classList?.contains("deep-dive-button-inline")||i.getAttribute("data-action")==="deep-dive")){const a=n.findIndex(s=>s===i);a!==-1&&(de=a),Ae()}else te()}return!0}if(N()&&f(e,"chat.historyExit"))return e.preventDefault(),re(),!0;if(f(e,"chat.scrollUp"))return e.preventDefault(),Se("up"),!0;if(f(e,"chat.scrollDown"))return e.preventDefault(),Se("down"),!0;if(N()){if(f(e,"chat.historyUp"))return e.preventDefault(),ft(),!0;if(f(e,"chat.historyDown"))return e.preventDefault(),ht(),!0;if(f(e,"chat.historyOpen"))return e.preventDefault(),bt(),!0}if(!N()&&t&&(f(e,"chat.historyUp")||f(e,"chat.historyDown"))){const n=document.querySelector('div[contenteditable="true"][role="textbox"]');if(n&&n.textContent?.trim()===""){e.preventDefault();const o=f(e,"chat.historyUp")?"up":"down";return ct(o),!0}}if(!N()&&!t){const n=document.activeElement;if(n&&(n.classList?.contains("deep-dive-button-inline")||n.getAttribute("data-action")==="deep-dive")){if(f(e,"chat.historyUp")||f(e,"chat.historyDown")){e.preventDefault();const i=f(e,"chat.historyUp")?"up":"down";return dt(i),!0}if(e.key==="ArrowRight"||e.key==="ArrowLeft")return!1;if(f(e,"chat.historyOpen"))return e.preventDefault(),n.click(),!0}}return!1}const Le="__geminiKeyboardHandlerVersion";function Ot(){const e=Date.now().toString();document[Le]=e,Ze().then(()=>{document.addEventListener("keydown",t=>{if(document[Le]===e){if(K()){Ht(t);return}$t(t)}},!0)})}const F=[{id:"default",prompt:"これについて詳しく"}],C=Math.random().toString(36).substr(2,9);function Ne(){const e=document.querySelectorAll(".markdown-main-panel");e.length!==0&&e.forEach(t=>{const n=[],o=t.querySelectorAll("h1[data-path-to-node], h2[data-path-to-node], h3[data-path-to-node], h4[data-path-to-node], h5[data-path-to-node], h6[data-path-to-node]");o.length>0?(o.forEach(s=>{const l=s.querySelector(".deep-dive-button-inline");if(l){if(l.getAttribute("data-initialized")===C)return;s.querySelectorAll(".deep-dive-button-inline, .deep-dive-expand-button").forEach(c=>c.remove())}n.push({type:"section",element:s,getContent:()=>_t(s)})}),t.querySelectorAll("table[data-path-to-node]").forEach(s=>{const l=Re(s);if(l){const c=l.querySelector(".deep-dive-button-inline");if(c){if(c.getAttribute("data-initialized")===C)return;c.remove()}l.querySelectorAll(".deep-dive-expand-button, .deep-dive-child-button").forEach(u=>u.remove()),n.push({type:"table",element:l,getContent:()=>He(s)})}}),Ut(t,o).forEach(s=>{const l=s.anchor.querySelector(".deep-dive-button-inline");if(l){if(l.getAttribute("data-initialized")===C)return;l.remove()}n.push({type:"orphan",element:s.anchor,getContent:()=>s.elements.map(c=>c.textContent?.trim()??"").filter(Boolean).join(`

`)})})):(t.querySelectorAll("table[data-path-to-node]").forEach(l=>{const c=Re(l);if(c){const u=c.querySelector(".deep-dive-button-inline");if(u){if(u.getAttribute("data-initialized")===C)return;u.remove()}c.querySelectorAll(".deep-dive-expand-button, .deep-dive-child-button").forEach(d=>d.remove()),n.push({type:"table",element:c,getContent:()=>He(l)})}}),t.querySelectorAll("blockquote[data-path-to-node]").forEach(l=>{const c=l.querySelector(".deep-dive-button-inline");if(c){if(c.getAttribute("data-initialized")===C)return;c.remove()}n.push({type:"blockquote",element:l,getContent:()=>l.textContent?.trim()??""})}),t.querySelectorAll("ol[data-path-to-node], ul[data-path-to-node]").forEach(l=>{const c=l.querySelector(":scope > .deep-dive-button-inline");if(c){if(c.getAttribute("data-initialized")===C)return;l.querySelectorAll(".deep-dive-button-inline, .deep-dive-expand-button").forEach(p=>p.remove())}let u=l.parentElement,d=!1;for(;u&&u!==t;){if((u.tagName==="OL"||u.tagName==="UL")&&u.hasAttribute("data-path-to-node")){d=!0;break}u=u.parentElement}d||n.push({type:"list",element:l,getContent:()=>Kt(l)})})),n.forEach(r=>jt(r))})}function Ut(e,t){const n=new Set(Array.from(t)),o=Array.from(e.children),i=[];let r=[],a=!1;const s=l=>{r.length>0&&!l&&i.push({anchor:r[0],elements:[...r]}),r=[]};for(const l of o){const c=l.tagName,u=c==="P";n.has(l)||c==="H1"||c==="H2"||c==="H3"||c==="H4"||c==="H5"||c==="H6"?(s(a),a=!0):c==="HR"?(s(a),a=!1):u?r.push(l):(s(a),a=!1)}return s(a),i}function Re(e){return e.closest(".table-block-component")??e.closest("table-block")??e.closest(".table-block")}function ue(e){return e.classList.contains("table-block-component")||e.tagName==="TABLE-BLOCK"?!0:e.classList.contains("table-block")&&e.querySelector(":scope > .table-footer")!==null}function _t(e){let t=(e.textContent?.trim()??"")+`

`,n=e.nextElementSibling;for(;n&&!n.matches("h1, h2, h3, h4, h5, h6, hr");){if(ue(n)){n=n.nextElementSibling;continue}t+=(n.textContent?.trim()??"")+`

`,n=n.nextElementSibling}return t.trim()}function He(e){let t="";return e.querySelectorAll("tr").forEach((o,i)=>{const r=o.querySelectorAll("td, th"),a=Array.from(r).map(s=>s.textContent?.trim()??"");t+="| "+a.join(" | ")+` |
`,i===0&&(t+="| "+a.map(()=>"---").join(" | ")+` |
`)}),t.trim()}function zt(e,t){const n=t.querySelectorAll("td, th");return"| "+Array.from(n).map(i=>i.textContent?.trim()??"").join(" | ")+" |"}function Kt(e){return e.textContent?.trim()??""}function jt(e){const t=document.createElement("button");t.className="deep-dive-button-inline",t.setAttribute("aria-label","Deep dive into this content"),t.setAttribute("data-action","deep-dive"),t.setAttribute("data-initialized",C),t.title="Deep dive into this content",t._deepDiveTarget=e;const n=document.createElementNS("http://www.w3.org/2000/svg","svg");n.setAttribute("width","16"),n.setAttribute("height","16"),n.setAttribute("viewBox","0 0 24 24"),n.setAttribute("fill","currentColor");const o=document.createElementNS("http://www.w3.org/2000/svg","path");o.setAttribute("d","M19 15l-6 6-1.5-1.5L15 16H4V9h2v5h9l-3.5-3.5L13 9l6 6z"),n.appendChild(o),t.appendChild(n),t.addEventListener("click",r=>{r.preventDefault(),r.stopPropagation(),G(e,!1)}),t.addEventListener("keydown",r=>{if(f(r,"chat.focusQuickPrompt")){if(!r.isTrusted||r.isComposing)return;r.preventDefault(),r.stopPropagation(),G(e,!0);return}if(r.key==="ArrowRight"&&!r.altKey&&!r.ctrlKey&&!r.metaKey){const a=e.element.querySelector(".deep-dive-expand-button");a&&(r.preventDefault(),r.stopPropagation(),$e(e,a))}else r.key==="ArrowLeft"&&!r.altKey&&!r.ctrlKey&&!r.metaKey&&(r.preventDefault(),r.stopPropagation(),document.getElementById("deep-dive-template-popup")?(q(),t.focus()):Oe(t,e))});let i=null;if((e.type==="section"||e.type==="list"||e.type==="table")&&(i=Wt(e)),e.type==="section")e.element.style.position="relative",e.element.style.display="flex",e.element.style.alignItems="center",e.element.style.gap="8px",e.element.appendChild(t),i&&e.element.appendChild(i);else if(e.type==="table"){const r=e.element.querySelector(".table-footer");if(r){const a=r.querySelector(".copy-button");a?(r.insertBefore(t,a),i&&r.insertBefore(i,a)):(r.appendChild(t),i&&r.appendChild(i))}}else e.type==="blockquote"?(e.element.style.position="relative",t.style.position="absolute",t.style.top="8px",t.style.right="8px",e.element.appendChild(t)):e.type==="orphan"?(e.element.style.position="relative",t.style.position="absolute",t.style.top="0",t.style.right="0",e.element.appendChild(t)):e.type==="list"&&(e.element.style.position="relative",t.style.position="absolute",t.style.top="0",t.style.right="0",e.element.appendChild(t),i&&(i.style.position="absolute",i.style.top="0",i.style.right="32px",e.element.appendChild(i)))}function Wt(e){const t=document.createElement("button");return t.className="deep-dive-expand-button",t.setAttribute("aria-label","Expand to select"),t.setAttribute("data-action","expand"),t.setAttribute("tabindex","-1"),t.title="Expand to select",t.textContent="+",t.style.fontSize="14px",t.style.fontWeight="bold",t.dataset.targetId=Math.random().toString(36).substr(2,9),e.expandButtonId=t.dataset.targetId,t.addEventListener("click",n=>{n.preventDefault(),n.stopPropagation(),$e(e,t)}),t}function $e(e,t){t.getAttribute("data-action")==="collapse"?(Vt(e),t.setAttribute("data-action","expand"),t.setAttribute("aria-label","Expand to select"),t.title="Expand to select",t.textContent="+"):(Ft(e),t.setAttribute("data-action","collapse"),t.setAttribute("aria-label","Collapse"),t.title="Collapse",t.textContent="-")}function Ft(e){if(e.type==="section"){let n=e.element.nextElementSibling;for(;n&&!n.matches("h1, h2, h3, h4, h5, h6, hr");){if(ue(n)){n=n.nextElementSibling;continue}n.tagName==="P"&&!n.querySelector(".deep-dive-child-button")&&V(n),(n.tagName==="UL"||n.tagName==="OL")&&n.hasAttribute("data-path-to-node")&&n.querySelectorAll(":scope > li").forEach(i=>{i.querySelector(".deep-dive-child-button")||V(i)}),n=n.nextElementSibling}}else if(e.type==="list")e.element.querySelectorAll(":scope > li").forEach(n=>{n.querySelector(".deep-dive-child-button")||V(n)});else if(e.type==="table"){const t=e.element.querySelector("table[data-path-to-node]");if(!t)return;t.querySelectorAll("tr").forEach(n=>{n.querySelector(".deep-dive-child-button")||V(n,()=>zt(t,n))})}}function V(e,t=()=>e.textContent?.trim()??""){e.style.position="relative";const n=document.createElement("button");n.className="deep-dive-button-inline deep-dive-child-button",n.setAttribute("aria-label","Deep dive into this content"),n.setAttribute("data-action","deep-dive"),n.title="Deep dive into this content",n.style.position="absolute",n.style.top="0",n.style.right="0";const o=document.createElementNS("http://www.w3.org/2000/svg","svg");o.setAttribute("width","16"),o.setAttribute("height","16"),o.setAttribute("viewBox","0 0 24 24"),o.setAttribute("fill","currentColor");const i=document.createElementNS("http://www.w3.org/2000/svg","path");i.setAttribute("d","M19 15l-6 6-1.5-1.5L15 16H4V9h2v5h9l-3.5-3.5L13 9l6 6z"),o.appendChild(i),n.appendChild(o);const r={type:"child",element:e,getContent:t};n.addEventListener("click",a=>{a.preventDefault(),a.stopPropagation(),G(r,!1)}),n.addEventListener("keydown",a=>{if(f(a,"chat.focusQuickPrompt")){if(!a.isTrusted||a.isComposing)return;a.preventDefault(),a.stopPropagation(),G(r,!0);return}a.key==="ArrowLeft"&&!a.altKey&&!a.ctrlKey&&!a.metaKey&&(a.preventDefault(),a.stopPropagation(),document.getElementById("deep-dive-template-popup")?(q(),n.focus()):Oe(n,r))}),e.appendChild(n)}function Vt(e){if(e.type==="section"){let n=e.element.nextElementSibling;for(;n&&!n.matches("h1, h2, h3, h4, h5, h6, hr");){if(ue(n)){n=n.nextElementSibling;continue}n.querySelectorAll(".deep-dive-child-button").forEach(o=>o.remove()),n=n.nextElementSibling}}else e.type==="list"?e.element.querySelectorAll(".deep-dive-child-button").forEach(t=>t.remove()):e.type==="table"&&e.element.querySelectorAll(".deep-dive-child-button").forEach(t=>t.remove())}async function Oe(e,t){q();const n=await new Promise(m=>{chrome.storage.sync.get(["deepDiveModes","currentDeepDiveModeId","deepDiveRecentModes"],m)}),o=n.deepDiveModes&&n.deepDiveModes.length>0?n.deepDiveModes:F,i=n.deepDiveRecentModes||[],r=[...o].sort((m,D)=>{const x=i.indexOf(m.id),b=i.indexOf(D.id);return x===-1&&b===-1?0:x===-1?1:b===-1?-1:x-b}),a=document.createElement("div");a.className="deep-dive-template-popup",a.id="deep-dive-template-popup",a.setAttribute("role","menu");const s=(m,D,x)=>{const b=document.createElement("button");return b.className="deep-dive-template-item",b.setAttribute("role","menuitem"),b.textContent=m,D&&(b.title=D),b.addEventListener("mousedown",$=>{$.preventDefault(),$.stopPropagation()}),b.addEventListener("click",$=>{$.preventDefault(),$.stopPropagation(),q(),x()}),b};r.forEach(m=>{a.appendChild(s(m.id,m.prompt||"",()=>Gt(t,m)))}),document.body.appendChild(a);const l=e.getBoundingClientRect(),c=160;let u=l.left+window.scrollX;u+c>window.innerWidth-8&&(u=window.innerWidth-c-8),a.style.top=`${l.bottom+window.scrollY+4}px`,a.style.left=`${u}px`;const d=Array.from(a.querySelectorAll(".deep-dive-template-item"));let p=0;d[0]?.focus(),a.addEventListener("keydown",m=>{m.key==="Escape"||m.key==="ArrowLeft"?(m.preventDefault(),q(),e.focus()):m.key==="ArrowDown"?(m.preventDefault(),p=(p+1)%d.length,d[p].focus()):m.key==="ArrowUp"?(m.preventDefault(),p=(p-1+d.length)%d.length,d[p].focus()):m.key==="Tab"&&(m.preventDefault(),m.shiftKey?p=(p-1+d.length)%d.length:p=(p+1)%d.length,d[p].focus())}),setTimeout(()=>{document.addEventListener("click",q,{once:!0})},0)}function q(){document.getElementById("deep-dive-template-popup")?.remove()}function Ue(e,t){const n=document.querySelector('div[contenteditable="true"][role="textbox"]');if(!n)return;for(;n.firstChild;)n.removeChild(n.firstChild);e.split(`
`).forEach(r=>{const a=document.createElement("p");r.trim()===""?a.appendChild(document.createElement("br")):a.textContent=r,n.appendChild(a)}),n.focus();const o=document.createRange(),i=window.getSelection();o.selectNodeContents(n),o.collapse(!1),i?.removeAllRanges(),i?.addRange(o),n.dispatchEvent(new Event("input",{bubbles:!0})),t&&setTimeout(()=>{const r=document.querySelector('button[aria-label*="送信"], button[aria-label*="Send"]');r&&!r.disabled&&r.click()},100)}function Gt(e,t){const i=e.getContent().split(`
`).map(r=>`> ${r}`).join(`
`)+`

`+(t.prompt||"これについて詳しく");Ue(i,!0),chrome.storage.sync.get(["deepDiveRecentModes"],r=>{const a=(r.deepDiveRecentModes||[]).filter(s=>s!==t.id);a.unshift(t.id),chrome.storage.sync.set({deepDiveRecentModes:a.slice(0,20)})})}async function G(e,t=!1){if(!document.querySelector('div[contenteditable="true"][role="textbox"]'))return;const o=e.getContent().split(`
`).map(a=>`> ${a}`).join(`
`);let i,r=!1;if(t)i=o+`

`;else{const a=await new Promise(p=>{chrome.storage.sync.get(["deepDiveModes","currentDeepDiveModeId"],p)}),s=a.deepDiveModes&&a.deepDiveModes.length>0?a.deepDiveModes:F;let u=new URLSearchParams(location.search).get("mode_id")||a.currentDeepDiveModeId||s[0]?.id;s.some(p=>p.id===u)||(u=s[0]?.id);const d=s.find(p=>p.id===u)||s[0]||F[0];i=o+`

`+(d.prompt||"これについて詳しく"),r=!0}Ue(i,r)}function Qt(){const e="gemini-deep-dive-styles";if(document.getElementById(e))return;const t=document.createElement("style");t.id=e,t.textContent=`
    /* 表の幅は entrypoints/content の applyCustomStyles で会話カラムいっぱいに指定 */
    .markdown-main-panel .table-content {
      scroll-padding-inline: 32px;
    }
    .markdown-main-panel tr .deep-dive-child-button {
      scroll-margin-inline: 40px;
    }
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
  `,document.head.appendChild(t)}function _e(){const e=document.getElementById("gemini-deep-dive-mode-selector");e&&e.remove(),chrome.storage.sync.get(["deepDiveModes","currentDeepDiveModeId"],t=>{const n=t.deepDiveModes&&t.deepDiveModes.length>0?t.deepDiveModes:F,o=document.createElement("div");o.id="gemini-deep-dive-mode-selector",o.className="gemini-deep-dive-mode-selector";const i=document.createElement("select");i.id="gemini-deep-dive-mode",i.title="深掘りモード",i.setAttribute("aria-label","深掘りモード"),n.forEach(d=>{const p=document.createElement("option");p.value=d.id,p.textContent=d.id,i.appendChild(p)}),i.addEventListener("change",()=>{chrome.storage.sync.set({currentDeepDiveModeId:i.value})}),o.appendChild(i);const r=document.querySelector('button[aria-label*="ファイル"], button[aria-label*="追加"]'),s=document.querySelector('button[aria-label*="ツール"], button[aria-label*="Tool"]')||r&&r.nextElementSibling;if(s&&s.parentElement)s.parentElement.insertBefore(o,s.nextSibling);else{const d=document.querySelector('div[contenteditable="true"][role="textbox"]');if(d){const p=d.closest("form")||d.parentElement?.parentElement;p?p.insertBefore(o,p.firstChild):document.body.appendChild(o)}else document.body.appendChild(o)}const c=new URLSearchParams(location.search).get("mode_id");let u=t.currentDeepDiveModeId;c&&n.some(d=>d.id===c)&&(u=c,chrome.storage.sync.set({currentDeepDiveModeId:c})),u&&n.some(d=>d.id===u)?i.value=u:n.length>0&&(i.value=n[0].id)})}let pe=null;function Yt(){Qt();const e=()=>{document.querySelector('button[aria-label*="ツール"], button[aria-label*="Tool"], button[aria-label*="ファイル"], button[aria-label*="追加"]')||document.querySelector('div[contenteditable="true"][role="textbox"]')?_e():setTimeout(e,500)};e(),chrome.storage.onChanged.addListener((n,o)=>{o==="sync"&&n.deepDiveModes&&location.href.includes("gemini.google.com")&&document.querySelector('button[aria-label*="ツール"], button[aria-label*="Tool"], div[contenteditable="true"][role="textbox"]')&&_e()}),new MutationObserver(n=>{let o=!1;for(const i of n){if(i.addedNodes.length>0){for(const r of i.addedNodes)if(r.nodeType===1){const a=r;if(a.matches?.("[data-path-to-node]")||a.querySelector?.("[data-path-to-node]")){o=!0;break}}}if(o)break}o&&(pe&&clearTimeout(pe),pe=setTimeout(()=>Ne(),500))}).observe(document.body,{childList:!0,subtree:!0}),setTimeout(()=>Ne(),1e3)}let Q=!1;const P="gemini-map-panel",ze="gemini-map-styles";function Xt(){if(document.getElementById(ze))return;const e=document.createElement("style");e.id=ze,e.textContent=`
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
  `,document.head.appendChild(e)}function Jt(e){let n=e.querySelector('h1, h2, h3, [role="heading"]')?.textContent?.trim()||e.textContent?.trim()||"";return n=n.replace(/^あなたのプロンプト\s*/,""),n=n.replace(/^>\s*/,""),n.substring(0,60)||"(空)"}function Ke(){return Array.from(document.querySelectorAll("infinite-scroller.chat-history > .conversation-container"))}function je(){const e=document.createElement("div");e.id=P;const t=document.createElement("div");t.className="map-header",t.textContent="このチャットの流れ",e.appendChild(t);const n=Ke();if(n.length===0){const i=document.createElement("div");return i.style.cssText="padding: 10px; opacity: 0.45; font-size: 12px;",i.textContent="チャットがまだありません",e.appendChild(i),e}const o=document.createElement("ul");return n.forEach((i,r)=>{const a=i.querySelector("user-query");if(!a)return;const s=Jt(a),l=document.createElement("li"),c=document.createElement("button"),u=document.createElement("span");u.className="map-turn-index",u.textContent=`${r+1}.`,c.appendChild(u),c.appendChild(document.createTextNode(s)),c.addEventListener("click",()=>{i.scrollIntoView({behavior:"smooth",block:"start"})}),l.appendChild(c),o.appendChild(l)}),e.appendChild(o),e}function Zt(){const e=document.getElementById(P);return e?Array.from(e.querySelectorAll("li button")):[]}let k=null;const M=new Set;function We(){k&&k.disconnect(),M.clear();const e=Ke();e.length!==0&&(k=new IntersectionObserver(t=>{t.forEach(i=>{const r=e.indexOf(i.target);r!==-1&&(i.isIntersecting?M.add(r):M.delete(r))});const n=Zt();if(n.forEach((i,r)=>{i.classList.toggle("map-item-current",M.has(r))}),document.getElementById(P)){const i=n.find((r,a)=>M.has(a));i&&i.scrollIntoView({block:"nearest",behavior:"smooth"})}},{threshold:.15}),e.forEach(t=>k.observe(t)))}function Fe(){k&&(k.disconnect(),k=null),M.clear()}let T=null;function en(){T&&T.disconnect();const e=document.querySelector("infinite-scroller.chat-history");if(!e)return;let t=null;T=new MutationObserver(()=>{Q&&(t&&clearTimeout(t),t=setTimeout(()=>nn(),300))}),T.observe(e,{childList:!0,subtree:!1})}function tn(){T&&(T.disconnect(),T=null)}function nn(){if(!Q)return;const e=document.getElementById(P),t=e?e.scrollTop:0;e&&e.remove(),Fe();const n=je();document.body.appendChild(n),n.scrollTop=t,We()}function Ve(){Xt();const e=document.getElementById(P);e&&e.remove();const t=je();document.body.appendChild(t),Q=!0,We(),en()}function on(){tn(),Fe();const e=document.getElementById(P);e&&e.remove(),Q=!1}class rn{constructor(){this.elementSelectors={textarea:['[role="textbox"][contenteditable="true"]','[aria-label*="プロンプト"]',".ql-editor.textarea",'rich-textarea [contenteditable="true"]'],sidebar:['[role="navigation"]',"bard-sidenav",".side-nav-container","aside"],sidebarToggle:['button[aria-label*="メインメニュー"]','button[aria-label*="Main menu"]','button[data-test-id="side-nav-menu-button"]'],chatHistory:['.conversation[role="button"]','[data-test-id="conversation"]',".conversation-items-container .conversation"],newChatButton:['a[href="https://gemini.google.com/app"]','a[aria-label*="新規作成"]','[data-test-id="new-chat-button"]'],copyButtons:['button[aria-label*="コピー"]','button[aria-label*="Copy"]',".copy-button"],chatContainer:["chat-window","main.main",".conversation-container"]}}findElement(t){const n=this.elementSelectors[t]||[];for(const o of n)try{const i=document.querySelector(o);if(i)return{element:i,selector:o}}catch{}return{element:null,selector:null}}findAllElements(){const t={};for(const n in this.elementSelectors)t[n]=this.findElement(n);return t}capturePageStructure(){return{timestamp:Date.now(),url:window.location.href,title:document.title,elements:this.findAllElements(),interactiveElements:this.getInteractiveElements(),metadata:{viewport:{width:window.innerWidth,height:window.innerHeight},scrollPosition:{x:window.scrollX,y:window.scrollY}}}}getInteractiveElements(){const t=[];return document.querySelectorAll('button, a, input, textarea, [role="button"], [contenteditable="true"]').forEach((i,r)=>{if(r>=50)return;const a=i.getBoundingClientRect();a.width===0||a.height===0||t.push({index:r,type:i.tagName.toLowerCase(),role:i.getAttribute("role")||"",ariaLabel:i.getAttribute("aria-label")||"",text:i.textContent?.trim().substring(0,50)||"",description:i.getAttribute("description")||"",isVisible:a.width>0&&a.height>0,position:{x:Math.round(a.x),y:Math.round(a.y)}})}),t}exportForAI(){const t=this.capturePageStructure();let n=`## Gemini Chat Page Structure

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
    `,document.head.appendChild(i),document.body.appendChild(o),setTimeout(()=>{o.style.transition="opacity 0.3s",o.style.opacity="0",setTimeout(()=>o.remove(),300)},3e3)}}function an(){window.domAnalyzer=new rn,window.analyzePage=()=>{console.log(window.domAnalyzer.capturePageStructure())},window.copyPageStructure=()=>{window.domAnalyzer.copyToClipboard()}}const sn={matches:["https://gemini.google.com/*"],runAt:"document_end",main(){window.rememberActionButtonPosition=Rt,an(),cn()}};function Ge(){const e="gemini-improve-ui-custom-styles";document.getElementById(e)?.remove();const t=document.createElement("style");t.id=e,t.textContent=`
    .gems-list-container {
      display: none !important;
    }
    .side-nav-entry-container {
      display: none !important;
    }
    /* Notebook sidebar list (any column; scoped selectors missed real DOM) */
    project-sidenav-list {
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
    /*
     * 表を会話カラム幅いっぱいに使う（狭い .table-content スクロール窓をやめる）。
     * 列が多い場合はセル折り返しで収め、横スクロールより先に幅を確保する。
     */
    .conversation-container .markdown-main-panel table-block,
    .conversation-container .markdown-main-panel .table-block-component,
    .conversation-container .markdown-main-panel .table-block,
    chat-window .markdown-main-panel table-block,
    chat-window .markdown-main-panel .table-block-component,
    chat-window .markdown-main-panel .table-block {
      display: block !important;
      width: 100% !important;
      max-width: none !important;
      box-sizing: border-box !important;
    }
    .conversation-container .markdown-main-panel .table-content,
    chat-window .markdown-main-panel .table-content {
      width: 100% !important;
      max-width: none !important;
      overflow-x: visible !important;
      box-sizing: border-box !important;
    }
    .conversation-container .markdown-main-panel table[data-path-to-node],
    chat-window .markdown-main-panel table[data-path-to-node] {
      width: 100% !important;
      max-width: none !important;
      table-layout: fixed !important;
      box-sizing: border-box !important;
    }
    .conversation-container .markdown-main-panel table[data-path-to-node] th,
    .conversation-container .markdown-main-panel table[data-path-to-node] td,
    chat-window .markdown-main-panel table[data-path-to-node] th,
    chat-window .markdown-main-panel table[data-path-to-node] td {
      overflow-wrap: anywhere !important;
      word-break: break-word !important;
    }
  `,document.head.appendChild(t)}function Qe(e){document.documentElement.style.setProperty("--chat-max-width",`${e}px`)}function ln(){chrome.storage.sync.get(["chatWidth"],e=>{Qe(e.chatWidth||900)})}function cn(){ln(),Ge(),window.addEventListener("popstate",()=>{re()});let e=location.href;new MutationObserver(()=>{const t=location.href;t!==e&&(e=t,window.rememberActionButtonPosition?.(-1),on(),setTimeout(()=>{ee(),Ee(),K()||(Ve(),Be()),document.getElementById("gemini-export-note-button")?.remove(),qe()},1500))}).observe(document,{subtree:!0,childList:!0}),Ot(),K()?(xt(),Ee()):(mt(),Yt(),Be(),setTimeout(()=>{qe()},1500),setTimeout(()=>{Ve()},1500)),chrome.storage.onChanged.addListener((t,n)=>{n==="sync"&&t.chatWidth&&(Qe(t.chatWidth.newValue),Ge())})}function Y(e,...t){}const dn={debug:(...e)=>Y(console.debug,...e),log:(...e)=>Y(console.log,...e),warn:(...e)=>Y(console.warn,...e),error:(...e)=>Y(console.error,...e)},Ye=globalThis.browser?.runtime?.id?globalThis.browser:globalThis.chrome;var Xe=class Je extends Event{static EVENT_NAME=me("wxt:locationchange");constructor(t,n){super(Je.EVENT_NAME,{}),this.newUrl=t,this.oldUrl=n}};function me(e){return`${Ye?.runtime?.id}:content:${e}`}const un=typeof globalThis.navigation?.addEventListener=="function";function pn(e){let t,n=!1;return{run(){n||(n=!0,t=new URL(location.href),un?globalThis.navigation.addEventListener("navigate",o=>{const i=new URL(o.destination.url);i.href!==t.href&&(window.dispatchEvent(new Xe(i,t)),t=i)},{signal:e.signal}):e.setInterval(()=>{const o=new URL(location.href);o.href!==t.href&&(window.dispatchEvent(new Xe(o,t)),t=o)},1e3))}}}var mn=class O{static SCRIPT_STARTED_MESSAGE_TYPE=me("wxt:content-script-started");id;abortController;locationWatcher=pn(this);constructor(t,n){this.contentScriptName=t,this.options=n,this.id=Math.random().toString(36).slice(2),this.abortController=new AbortController,this.stopOldScripts(),this.listenForNewerScripts()}get signal(){return this.abortController.signal}abort(t){return this.abortController.abort(t)}get isInvalid(){return Ye.runtime?.id==null&&this.notifyInvalidated(),this.signal.aborted}get isValid(){return!this.isInvalid}onInvalidated(t){return this.signal.addEventListener("abort",t),()=>this.signal.removeEventListener("abort",t)}block(){return new Promise(()=>{})}setInterval(t,n){const o=setInterval(()=>{this.isValid&&t()},n);return this.onInvalidated(()=>clearInterval(o)),o}setTimeout(t,n){const o=setTimeout(()=>{this.isValid&&t()},n);return this.onInvalidated(()=>clearTimeout(o)),o}requestAnimationFrame(t){const n=requestAnimationFrame((...o)=>{this.isValid&&t(...o)});return this.onInvalidated(()=>cancelAnimationFrame(n)),n}requestIdleCallback(t,n){const o=requestIdleCallback((...i)=>{this.signal.aborted||t(...i)},n);return this.onInvalidated(()=>cancelIdleCallback(o)),o}addEventListener(t,n,o,i){n==="wxt:locationchange"&&this.isValid&&this.locationWatcher.run(),t.addEventListener?.(n.startsWith("wxt:")?me(n):n,o,{...i,signal:this.signal})}notifyInvalidated(){this.abort("Content script context invalidated"),dn.debug(`Content script "${this.contentScriptName}" context invalidated`)}stopOldScripts(){document.dispatchEvent(new CustomEvent(O.SCRIPT_STARTED_MESSAGE_TYPE,{detail:{contentScriptName:this.contentScriptName,messageId:this.id}})),window.postMessage({type:O.SCRIPT_STARTED_MESSAGE_TYPE,contentScriptName:this.contentScriptName,messageId:this.id},"*")}verifyScriptStartedEvent(t){const n=t.detail?.contentScriptName===this.contentScriptName,o=t.detail?.messageId===this.id;return n&&!o}listenForNewerScripts(){const t=n=>{!(n instanceof CustomEvent)||!this.verifyScriptStartedEvent(n)||this.notifyInvalidated()};document.addEventListener(O.SCRIPT_STARTED_MESSAGE_TYPE,t),this.onInvalidated(()=>document.removeEventListener(O.SCRIPT_STARTED_MESSAGE_TYPE,t))}};function gn(){}function X(e,...t){}const fn={debug:(...e)=>X(console.debug,...e),log:(...e)=>X(console.log,...e),warn:(...e)=>X(console.warn,...e),error:(...e)=>X(console.error,...e)};return(async()=>{try{const{main:e,...t}=sn;return await e(new mn("content",t))}catch(e){throw fn.error('The content script "content" crashed on startup!',e),e}})()})();
content;