if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}
"use strict";
/* ================= DATA ================= */
const G={Popcorn:["#ffd36b","#d6781b"],Beverages:["#7ec8ff","#2a5fc4"],Snacks:["#ffb36b","#c4481b"],Combos:["#ff9aa8","#b0213f"],Dessert:["#ffc3e0","#b6458a"]};
const MENU=[
["Popcorn","Salted Popcorn",150,"salted-popcorn","Freshly popped \u00B7 classic butter & salt",1],
["Popcorn","Caramel Popcorn",180,"caramel-popcorn","Crackly caramel glaze, sweet & crunchy",1],
["Popcorn","Cheese Popcorn",190,"cheese-popcorn","Bold cheddar dust on hot popcorn",0],
["Beverages","Coke",90,"coke","Ice-cold classic \u00B7 300 ml",0],
["Beverages","Pepsi",90,"pepsi","Chilled & fizzy \u00B7 300 ml",0],
["Beverages","Cold Coffee",120,"cold-coffee","Thick, frothy & caffeinated",0],
["Beverages","Water Bottle",40,"water-bottle","Chilled packaged water \u00B7 500 ml",0],
["Snacks","Veg Burger",140,"veg-burger","Crispy patty, fresh veggies & sauce",0],
["Snacks","Samosa (2 pcs)",60,"samosas","Flaky pastry, spiced potato filling",0],
["Snacks","French Fries",110,"fries","Golden & salted, with dip",0],
["Snacks","Nachos with Cheese",160,"cheese-nachos","Corn chips, molten cheese sauce",0],
["Combos","Large Popcorn + 2 Cokes",380,"popcorn-cola-combo","The share-worthy movie bundle",1],
["Dessert","Ice Cream Cup",80,"ice-cream","Vanilla & strawberry scoops",0]
].map((m,i)=>({id:"m"+i,cat:m[0],name:m[1],price:m[2],art:`<img src="images/${m[3]}.webp" width="384" height="384" alt="" decoding="async" loading="lazy">`,desc:m[4],pop:!!m[5]}));
const FLOW=["RECEIVED","PREPARING","READY","OUT_FOR_DELIVERY","DELIVERED"];
const LBL={RECEIVED:"Order received",PREPARING:"Being prepared",READY:"Ready",OUT_FOR_DELIVERY:"On the way to your seat",DELIVERED:"Delivered",CANCELLED:"Cancelled"};
const SUB={RECEIVED:"The stall has your order",PREPARING:"Fresh off the counter",READY:"Packed for your row",OUT_FOR_DELIVERY:"Our runner is walking to you",DELIVERED:"Enjoy the show \uD83C\uDF7F"};
const ETA={RECEIVED:"Usually at your seat in 5\u20137 minutes",PREPARING:"Almost there \u2013 about 3\u20135 minutes",READY:"A runner is picking it up now",OUT_FOR_DELIVERY:"Arriving at your seat any moment"};
const DEFAULT_BASE=location.origin+"/";
const inr=n=>"\u20B9"+Math.round(n).toLocaleString("en-IN");
const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const LS={g:(k,d)=>{try{return JSON.parse(localStorage.getItem(k))||d}catch(e){return d}},s:(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};
/* ================= LOGGING (client) ================= */
const log = (level, msg, extra) => {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const line = '['+ts+'] '+level.toUpperCase().padEnd(5)+' '+msg;
  if (level === 'error') console.error(line, extra || '');
  else if (level === 'warn') console.warn(line, extra || '');
  else console.log(line, extra || '');
};
const logErr = (msg, err) => log('error', msg, err ? { message: err.message, stack: err.stack } : '');
const reduced=matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ================= ICONS ================= */
const I=(b,v="0 0 24 24")=>`<svg viewBox="${v}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${b}</svg>`;
const IC={
back:I('<path d="M15 5l-7 7 7 7"/>'),
sun:I('<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5 5l1.7 1.7M17.3 17.3L19 19M19 5l-1.7 1.7M6.7 17.3L5 19"/>'),
moon:I('<path d="M20 13.5A8.1 8.1 0 0110.5 4 8.1 8.1 0 1020 13.5z"/>'),
bag:I('<path d="M5.5 8h13l-1 12.5h-11z"/><path d="M9 10.5V6.8a3 3 0 016 0v3.7"/>'),
plus:I('<path d="M12 5v14M5 12h14"/>'),
minus:I('<path d="M5 12h14"/>'),
lock:I('<rect x="5.5" y="10.5" width="13" height="9.5" rx="2.5"/><path d="M8.5 10.5V7.8a3.5 3.5 0 017 0v2.7"/>'),
shield:I('<path d="M12 3l7.5 3v5.6c0 4.6-3.2 7.6-7.5 9.4-4.3-1.8-7.5-4.8-7.5-9.4V6z"/><path d="M9 11.8l2.2 2.2 3.8-4.2"/>'),
check:I('<path d="M4.5 12.5l5 5 10-11"/>'),
bell:I('<path d="M6 16v-5.5a6 6 0 0112 0V16l1.8 2.6H4.2z"/><path d="M10 21a2.2 2.2 0 004 0"/>'),
receipt:I('<path d="M6 3.5h12v17l-2.4-1.6-1.8 1.6-1.8-1.6-1.8 1.6-1.8-1.6L6 20.5z"/><path d="M9 8h6M9 11.5h6M9 15h4"/>'),
pan:I('<path d="M4 13.5h13v2.2a5 5 0 01-5 5H9a5 5 0 01-5-5z"/><path d="M17 14.5h4M8 10.5c0-1.6 1.4-1.6 1.4-3.2M12 10.5c0-1.6 1.4-1.6 1.4-3.2"/>'),
run:I('<circle cx="14.5" cy="4.8" r="1.9"/><path d="M9 20.5l2.6-5-2-2 1.4-5 3.5 1.5 2.5 2.5 3 .8M11 8.5L7.5 10l-1 3.4M13.6 15.5l2.4 2 .8 3.5"/>'),
seat:I('<path d="M6.5 11V6.5a2.5 2.5 0 012.5-2.5h6a2.5 2.5 0 012.5 2.5V11"/><path d="M4.5 18.5v-4a2 2 0 012-2h11a2 2 0 012 2v4"/><path d="M6.5 18.5v2M17.5 18.5v2"/>'),
qr:I('<rect x="4" y="4" width="6.5" height="6.5" rx="1.2"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.2"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.2"/><path d="M13.5 13.5h2.8v2.8h-2.8zM17.2 17.2H20V20h-2.8z"/>'),
print:I('<path d="M7 8V3.5h10V8"/><rect x="4" y="8" width="16" height="8.5" rx="2"/><path d="M7 13.5h10v7H7z"/>'),
out:I('<path d="M14 4.5h5.5V20H14"/><path d="M4.5 12h10M11 8.5l3.5 3.5-3.5 3.5"/>'),
alert:I('<path d="M12 3.5L22 20H2z"/><path d="M12 10v4.2M12 17.2v.1"/>'),
info:I('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 7.8v.1"/>'),
arrow:I('<path d="M4.5 12h15M13.5 6l6 6-6 6"/>'),
spark:I('<path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z"/>'),
scan:I('<path d="M4 8V5.5A1.5 1.5 0 015.5 4H8M16 4h2.5A1.5 1.5 0 0120 5.5V8M20 16v2.5a1.5 1.5 0 01-1.5 1.5H16M8 20H5.5A1.5 1.5 0 014 18.5V16"/><path d="M4 12h16"/>'),
film:I('<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="M8 5v14M16 5v14M3.5 9.5H8M3.5 14.5H8M16 9.5h4.5M16 14.5h4.5"/>'),
pcat:I('<path d="M6 9.5h12l-1.6 11H7.6z"/><path d="M6.5 9.5a3 3 0 013-3 3.4 3.4 0 015-.9 3 3 0 013 3.9"/>'),
bcat:I('<path d="M7 8h10l-1.3 12.5H8.3z"/><path d="M12 8l2-4.5M6.5 8h11"/>'),
scat:I('<path d="M12 4l8 16H4z"/>'),
ccat:I('<path d="M12 4l2 4.6 5 .5-3.8 3.3 1.2 4.9L12 14.7l-4.4 2.6 1.2-4.9L5 9.1l5-.5z"/>'),
dcat:I('<path d="M7 11h10l-1.4 9.5H8.4z"/><circle cx="9.5" cy="8" r="2.6"/><circle cx="14.5" cy="8" r="2.6"/><circle cx="12" cy="5.5" r="2.6"/>')};
const CATIC={All:IC.spark,Popcorn:IC.pcat,Beverages:IC.bcat,Snacks:IC.scat,Combos:IC.ccat,Dessert:IC.dcat};

/* ================= STATE ================= */
let cfg={payments:"demo"},rep=null,repRange="today",orders=[],sold=[],cart={},seat=LS.g("ss_seat",null),view="menu",pay=null,tab="board",myId=LS.g("ss_my",null),known=new Set(),ownerOK=false,cat="All",msg="",base=LS.g("ss_base",DEFAULT_BASE);
const isOwner=()=>location.hash==="#owner";
let token=LS.g("ss_tok",null),live=false,es=null,local=false,paying=false,popId=null,lastView="",lastKey="",celebrated=new Set(),qrMade=false;
const theme=()=>document.documentElement.dataset.theme==="light"?"light":"dark";

/* ================= API (server first, local demo fallback) ================= */
async function api(p,o={}){if(!local){let r=null,j=null;try{r=await fetch("/api"+p,{method:o.method||"GET",headers:{"Content-Type":"application/json",...(token?{Authorization:"Bearer "+token}:{})},body:o.body?JSON.stringify(o.body):undefined});j=await r.json()}catch(e){logErr("API fetch failed: "+p,e);r=null}
 if(r&&j&&typeof j==="object"&&(r.ok||j.error)){if(!r.ok)throw new Error(j.error);return j}
 local=true;live=false}
 return lapi(p,o)}
function lapi(p,o){const b=o.body||{},m=o.method||"GET",rd=()=>LS.g("ss_orders",[]),wr=a=>LS.s("ss_orders",a);
 if(p==="/sold"){let s=LS.g("ss_sold",[]);if(m==="POST"){s=s.includes(b.id)?s.filter(x=>x!==b.id):[...s,b.id];LS.s("ss_sold",s);sold=s;render()}return{ids:s}}
 if(p==="/login"){if(String(b.pin)==="1234")return{token:"local"};throw new Error("Wrong PIN")}
 if(p==="/orders")return rd();
 if(p==="/pay"){const u=String(b.upi||"").toLowerCase();if(u.startsWith("fail"))throw new Error("Payment failed. Try again or use another UPI ID.");
  const items=[];let s=0;(b.items||[]).forEach(i=>{const x=MENU.find(y=>y.id===i.id);if(x&&i.q>0){items.push({n:x.name,q:i.q,p:x.price});s+=x.price*i.q}});if(!items.length)throw new Error("Cart is empty.");
  const sd=b.seat,od={id:"SS"+Math.random().toString(36).slice(2,7).toUpperCase(),seat:`Screen ${sd.scr} \u00B7 Row ${sd.row} \u00B7 Seat ${sd.no}`,screen:String(sd.scr),row:sd.row,name:b.name,note:b.note,items,total:Math.round(s*1.05),status:"RECEIVED",paid:"UPI "+u,t:Date.now()};wr([...rd(),od]);return od}
 const mm=p.match(/^\/orders\/(\w+)$/);if(mm){const a=rd(),o=a.find(x=>x.id===mm[1]);if(!o)throw new Error("Not found");if(m==="PATCH"){const i=FLOW.indexOf(o.status);if(b.action==="issue")o.issue=true;else if(b.action==="advance"&&i<FLOW.length-1){o.status=FLOW[i+1];o.issue=false}else if(b.action==="cancel")o.status="CANCELLED";wr(a);upsert(o)}return o}
 throw new Error("Unknown request")}

/* ================= REALTIME ================= */
let polling=false,lastJ="";
function startPoll(){if(polling)return;polling=true;const tick=()=>{let a=LS.g("ss_orders",[]);if(!ownerOK)a=a.filter(o=>o.id===myId);const j=JSON.stringify(a);if(j!==lastJ){const had=new Set(orders.map(o=>o.id));if(ownerOK&&lastJ&&a.some(o=>!had.has(o.id)&&o.status==="RECEIVED"))beep();lastJ=j;orders=a;render()}sold=LS.g("ss_sold",[])};setInterval(tick,1500);addEventListener("storage",tick)}
function upsert(o){const i=orders.findIndex(x=>x.id===o.id),nw=i<0;if(nw)orders.push(o);else orders[i]=o;if(nw&&o.status==="RECEIVED"&&ownerOK)beep();render()}
function connect(){if(local){startPoll();return}if(es)es.close();const q=ownerOK?"token="+encodeURIComponent(token):myId?"order="+myId:"";es=new EventSource("/api/events?"+q);es.onopen=()=>{live=true;render()};es.onerror=()=>{live=false};es.onmessage=e=>{const m=JSON.parse(e.data);if(m.type==="order")upsert(m.order);if(m.type==="sold"){sold=m.ids;render()}}}
async function login(){const el=$("#pin");try{const r=await api("/login",{method:"POST",body:{pin:el.value}});token=r.token;LS.s("ss_tok",token);ownerOK=true;orders=await api("/orders");connect();toast("Welcome back, boss","ok");el&&el.blur()}catch(e){el&&(el.value="");const c=$("#pincard");c&&(c.classList.remove("shake"),void c.offsetWidth,c.classList.add("shake"));toast("Wrong PIN \u2013 try again","err")}render()}
function lockOwner(){token=null;LS.s("ss_tok",null);ownerOK=false;orders=myId?orders.filter(o=>o.id===myId):[];connect();render();toast("Dashboard locked","info")}
async function initStore(){try{sold=(await api("/sold")).ids}catch(e){}
 try{cfg=await api("/config")}catch(e){}
 if(token){try{orders=await api("/orders");ownerOK=true}catch(e){token=null;LS.s("ss_tok",null)}}
 if(!ownerOK&&myId){try{orders=[await api("/orders/"+myId)]}catch(e){myId=null}}
 connect();render()}
async function setSold(id){try{await api("/sold",{method:"POST",body:{id}});if(local){sold=LS.g("ss_sold",[]);render()}}catch(e){toast(e.message,"err")}}
function beep(){try{const c=new AudioContext(),t=c.currentTime;[880,1174.7].forEach((f,i)=>{const o=c.createOscillator(),g=c.createGain();o.frequency.value=f;o.type="sine";g.gain.setValueAtTime(.0001,t+i*.12);g.gain.exponentialRampToValueAtTime(.16,t+i*.12+.02);g.gain.exponentialRampToValueAtTime(.0001,t+i*.12+.3);o.connect(g);g.connect(c.destination);o.start(t+i*.12);o.stop(t+i*.12+.32)})}catch(e){}}
const buzz=ms=>{try{navigator.vibrate&&navigator.vibrate(ms)}catch(e){}};

/* ================= FX ================= */
function toast(text,type="info"){const box=$("#toasts");if(!box)return;const t=document.createElement("div");t.className="toast "+type;t.innerHTML=(type==="ok"?IC.check:type==="err"?IC.alert:IC.info)+`<span>${esc(text)}</span>`;box.appendChild(t);while(box.children.length>3)box.firstChild.remove();setTimeout(()=>{t.classList.add("out");setTimeout(()=>t.remove(),320)},2600)}
function flyToCart(r,bar){
 if(reduced || !r || !bar.animate)return;
 const b=bar.getBoundingClientRect(), x=r.left+r.width/2, y=r.top+r.height/2;
 const dx=b.left+b.width/2-x, dy=b.top-y;
 const drop=document.createElement("i");drop.className="fly";
 drop.style.left=(x-7)+"px";drop.style.top=(y-7)+"px";
 document.body.append(drop);
 const flight=drop.animate([
  {transform:"translate(0,0)"},
  {transform:`translate(${dx*.5}px,${dy*.5-48}px) scale(.8)`,offset:.5},
  {transform:`translate(${dx}px,${dy}px) scale(.35)`}
 ],{duration:440,easing:"cubic-bezier(.35,.08,.7,1)"});
 flight.onfinish=()=>{
  drop.remove();
  if(!bar.isConnected || bar.closest(".bar").hidden)return;
  const wave=document.createElement("i");wave.className="cart-wave";wave.setAttribute("aria-hidden","true");bar.append(wave);
  wave.animate([{transform:"translate(-50%,-50%) scale(.02)",opacity:.85},{transform:"translate(-50%,-50%) scale(1.5)",opacity:0}],{duration:480,easing:"ease-out"}).onfinish=()=>wave.remove();
 };
}
function confetti(){if(reduced)return;const c=document.createElement("canvas");c.className="confetti";c.width=innerWidth*devicePixelRatio;c.height=innerHeight*devicePixelRatio;c.style.width=innerWidth+"px";c.style.height=innerHeight+"px";document.body.appendChild(c);
 const x=c.getContext("2d");x.scale(devicePixelRatio,devicePixelRatio);const cols=["#F6D98A","#D4A437","#FFF6E0","#B8860B","#3ECF8E","#F3D27A"];
 const P=Array.from({length:90},()=>({x:innerWidth/2+(Math.random()-.5)*innerWidth*.5,y:innerHeight*.3,vx:(Math.random()-.5)*9,vy:-Math.random()*9-3,s:Math.random()*7+4,r:Math.random()*Math.PI,vr:(Math.random()-.5)*.3,c:cols[Math.random()*cols.length|0],sh:Math.random()<.4}));
 const t0=performance.now();(function tick(t){const dt=Math.min(32,t-t0);x.clearRect(0,0,innerWidth,innerHeight);let alive=false;
  for(const p of P){p.vy+=.16;p.vx*=.992;p.x+=p.vx;p.y+=p.vy;p.r+=p.vr;if(p.y<innerHeight+30)alive=true;
   x.save();x.translate(p.x,p.y);x.rotate(p.r);x.fillStyle=p.c;x.globalAlpha=Math.max(0,1-(t-t0)/2200);
   if(p.sh){x.beginPath();x.arc(0,0,p.s/2,0,7);x.fill()}else x.fillRect(-p.s/2,-p.s/3,p.s,p.s*.66);x.restore()}
  if(alive&&t-t0<2300)requestAnimationFrame(tick);else c.remove()})(t0)}
function showProc(sub,dur){const d=document.createElement("div");d.className="proc";d.innerHTML=`<div class="box"><div class="ring"><span class="k">\uD83C\uDF7F</span></div><div class="eyebrow">Secure checkout</div><h2 style="margin:8px 0 4px">Waiting for UPI approval\u2026</h2><p class="mu">${esc(sub)}</p>${dur?`<div class="pbar"><i></i></div>`:""}</div>`;document.body.appendChild(d);
 if(dur){const b=d.querySelector(".pbar i");b.style.transition=`width ${dur}ms linear`;requestAnimationFrame(()=>requestAnimationFrame(()=>b.style.width="100%"))}
 return()=>d.remove()}

/* ================= ROUTER & RENDER ================= */
const seatLabel=()=>`Screen ${seat.scr} \u00B7 Row ${seat.row} \u00B7 Seat ${seat.no}`;
const lines=()=>Object.entries(cart).filter(([,q])=>q>0).map(([id,q])=>({...MENU.find(m=>m.id===id),q}));
const sub=()=>lines().reduce((a,l)=>a+l.price*l.q,0),tot=()=>sub()*1.05;
function route(){const h=location.hash,m=h.match(/^#seat-(\d+)-([A-Za-z]+)-(\d+)(?:-([a-f0-9]{12}))?$/);
 if(m){const fresh=!seat||seat.scr!==m[1]||seat.row!==m[2].toUpperCase()||seat.no!==m[3];seat={scr:m[1],row:m[2].toUpperCase(),no:m[3],sig:m[4]||""};LS.s("ss_seat",seat);if(view==="landing"||view==="owner")view="menu";if(fresh&&view==="menu")setTimeout(()=>toast(`Seat locked \u00B7 Row ${seat.row} \u00B7 Seat ${seat.no}`,"ok"),350)}
 if(h==="#owner")view="owner";else if(view==="owner")view=seat?"menu":"landing";
 if(!seat&&view!=="owner")view="landing";render()}
addEventListener("hashchange",route);
function menuControl(m,q,so){return so?`<span class="tag red">Sold out</span>`:q?`<span class="q"><button class="g" onclick="add('${m.id}',-1,event)" aria-label="Remove one ${m.name}">${IC.minus}</button><b>${q}</b><button onclick="add('${m.id}',1,event)" aria-label="Add one ${m.name}">${IC.plus}</button></span>`:`<button class="s gh addb" onclick="add('${m.id}',1,event)">${IC.plus} Add</button>`}
function add(id,d,ev){
 const old=cart[id]||0, q=Math.max(0,Math.min(10,old+d));
 if(q===old)return;
 const origin=ev?.currentTarget?.getBoundingClientRect();
 cart[id]=q;buzz(8);
 if(view!=="menu"){render();return}
 const control=$("#qty-"+id);
 if(old && q)control.querySelector("b").textContent=q;
 else {
  control.innerHTML=menuControl(MENU.find(m=>m.id===id),q,false);
  if(ev?.detail===0)control.querySelector("button:last-child")?.focus({preventScroll:true});
 }
 const n=lines().reduce((sum,item)=>sum+item.q,0),bar=$("#cartbar");
 bar.closest(".bar").hidden=!n;
 bar.querySelector(".bub").textContent=n;
 bar.querySelector(".cart-label").textContent="View cart \u00B7 "+inr(tot());
 if(d>0)flyToCart(origin,bar);
}
function go(v){view=v;render()}
function toggleTheme(){const t=theme()==="dark"?"light":"dark";if(t==="light")document.documentElement.dataset.theme="light";else delete document.documentElement.dataset.theme;LS.s("ss_theme",t);$("#metaTheme").content=t==="light"?"#F5EFE3":"#0B0A12";render()}
const themeBtn=()=>`<button class="ib" onclick="toggleTheme()" aria-label="Switch to ${theme()==="dark"?"light":"dark"} mode">${theme()==="dark"?IC.sun:IC.moon}</button>`;
const liveTag=()=>`<span class="live ${live?"on":""}"><i></i>${local?"Demo":live?"Live":"\u2026"}</span>`;
const wordmark=()=>`<img class="wordmark-img" src="images/cinezo-wordmark-${theme()==="light"?"light":"dark"}.svg" alt="Cinezo" width="120" height="auto">`;
const hd=()=>`<header class="hd"><div class="hdin">${wordmark()}<span class="hacts">${liveTag()}${themeBtn()}</span></div></header>`;
const navrow=(title,back)=>`<div class="navrow"><button class="ib" onclick="go('${back}')" aria-label="Back">${IC.back}</button><span class="eyebrow">${title}</span>${themeBtn()}</div>`;
const tk=()=>`<div class="tk"><i class="sheen"></i><div><small>YOUR SEAT</small><b>Row ${esc(seat.row)} \u00B7 Seat ${esc(seat.no)}</b></div><div class="scr"><small>SCREEN</small><b>${esc(seat.scr)}</b></div><i class="bars"></i></div>`;
const greet=()=>{const h=new Date().getHours();return h<12?"Good morning":h<17?"Good afternoon":"Good evening"};

function render(){const a=document.activeElement;if(a&&(a.tagName==="INPUT"||a.tagName==="TEXTAREA")&&view!=="menu"&&view!=="done")return;
 const v={landing:vLanding,menu:vMenu,cart:vCart,pay:()=>pay?vPay():vMenu(),track:vTrack,done:vDone,owner:vOwner}[view]||vMenu;
 const changed=view!==lastView,key=view+"|"+cat,anim=key!==lastKey,sc=scrollY;
 const app=$("#app");app.className=(view==="owner"?"w ow":"w")+(changed?" vin":"");
 app.innerHTML=v(anim);
 if(changed)scrollTo(0,0);else scrollTo(0,sc);
 lastView=view;lastKey=key;drawQR();
 if((view==="done"&&myId&&!celebrated.has(myId))||(view==="track"&&orders.find(o=>o.id===myId)?.status==="DELIVERED"&&!celebrated.has(myId))){celebrated.add(myId);setTimeout(confetti,450)}}

/* ================= VIEWS \u00B7 CUSTOMER ================= */
function vLanding(){const seats=[["2","F","12"],["2","F","13"],["3","A","5"]];
return `<header class="hd"><div class="hdin">${wordmark()}<span class="hacts">${themeBtn()}</span></div></header>
<div class="hero welcome"><img src="images/cinema.webp" alt="" fetchpriority="high">
<div class="eyebrow" style="text-transform:none">craveit . scan it. enjoy it</div>
<h1>Snacks come<br><em>to you.</em></h1>
<p class="mu">Scan the QR on the seat in front of you. Order in seconds, pay with UPI, and never miss a scene.</p></div>
<div class="mq" aria-hidden="true"><div class="mqin">${Array(2).fill("Fresh Popcorn \u2766 Ice-cold Drinks \u2766 Hot Nachos \u2766 Movie Combos \u2766 Sweet Endings \u2766 ").join("")}</div></div>
<h2 style="text-align:center">Try it \u2013 <em>tap a seat</em></h2>
<p class="mu" style="text-align:center;margin-top:0">These are demo seat stickers. On a real seat, you'd scan the QR.</p>
<div style="text-align:center;margin:6px 0 4px">${seats.map(s=>`<a href="#seat-${s.join("-")}" style="text-decoration:none" aria-label="Open menu for Screen ${s[0]}, Row ${s[1]}, Seat ${s[2]}"><span class="qr"><img class="wordmark-img" src="images/cinezo-wordmark-dark.svg" alt="Cinezo"><span class="qrc" data-qr="${s.join("-")}"></span><b>Screen ${s[0]} \u00B7 ${s[1]}${s[2]}</b><small>craveit . scan it. enjoy it</small></span></a>`).join("")}</div>
<div class="steps3">
<div class="card"><span class="no">01</span>${IC.scan}<b>Scan</b><div class="mu">QR on your seat</div></div>
<div class="card"><span class="no">02</span>${IC.bag}<b>Order</b><div class="mu">Pay with UPI</div></div>
<div class="card"><span class="no">03</span>${IC.film}<b>Enjoy</b><div class="mu">We find your row</div></div>
</div>
<p style="text-align:center;margin-top:22px"><a href="#owner" style="text-decoration:none;font-weight:600;font-size:13.5px">Stall owner? Open dashboard ${IC.arrow.replace('viewBox="0 0 24 24"','viewBox="0 0 24 24" style="width:14px;height:14px;vertical-align:-2px"')}</a></p>
<p class="mu" style="text-align:center;font-size:11px;letter-spacing:.14em;text-transform:uppercase">Demo build \u00B7 no real payments</p>`}

function vMenu(anim){const cats=["All",...Object.keys(G)],items=MENU.filter(m=>cat==="All"||m.cat===cat),n=lines().reduce((a,l)=>a+l.q,0);
const active=orders.find(o=>o.id===myId&&o.status!=="DELIVERED"&&o.status!=="CANCELLED");
return `${hd()}
<div class="greet"><div class="eyebrow">${greet()} \u00B7 enjoy the show</div><h1>What would you <em>like?</em></h1></div>
${tk()}
${active?`<button class="g full" style="justify-content:space-between" onclick="go('track')"><span style="display:inline-flex;align-items:center;gap:9px">${IC.bell}<span>Order ${esc(active.id)} \u00B7 <b style="color:var(--ac2)">${LBL[active.status]}</b></span></span>${IC.arrow}</button>`:""}
<div class="chips" role="tablist">${cats.map(c=>`<button role="tab" aria-selected="${c===cat}" class="chip ${c===cat?"":"g"}" onclick="cat='${c}';render()">${CATIC[c]}${c}</button>`).join("")}</div>
<div class="${anim?"enter":""}">
${items.map((m,i)=>{const so=sold.includes(m.id),q=cart[m.id]||0;return `<div class="it ${so?"so":""}" style="--i:${Math.min(i,10)}">
${m.pop&&!so?`<span class="pop-tag">POPULAR</span>`:""}
<div class="im">${m.art}</div>
<div class="in"><b class="nm">${m.name}</b><div class="ds">${m.desc}</div>
<div class="row"><span class="pr">${inr(m.price)}</span>
<span id="qty-${m.id}">${menuControl(m,q,so)}</span></div>
<div class="meta" style="margin-top:5px"><span class="dot"></span>Veg</div></div></div>`}).join("")}
</div>
<p class="mu" style="text-align:center;margin-top:20px;font-size:11.5px">Delivered quietly to your seat \u00B7 Prices incl. of GST at checkout</p>
<div class="bar" ${n?"":"hidden"}><div><button id="cartbar" class="full" onclick="go('cart')"><span class="bub">${n}</span><span class="cart-label">View cart \u00B7 ${inr(tot())}</span>${IC.arrow}</button></div></div>`}

function vCart(){const l=lines();
return `${navrow("Your order","menu")}<h1 style="margin:6px 0 2px">The <em>cart</em></h1>${tk()}
${l.length?l.map(x=>`<div class="it"><div class="im" style="flex-basis:62px;height:62px">${x.art}</div><div class="in"><b class="nm">${x.name}</b><div class="row" style="margin-top:6px"><span class="pr">${inr(x.price*x.q)}</span><span class="q ${popId===x.id?"pop":""}"><button class="g" onclick="add('${x.id}',-1,event)" aria-label="Remove one">${IC.minus}</button><b>${x.q}</b><button onclick="add('${x.id}',1,event)" aria-label="Add one">${IC.plus}</button></span></div></div></div>`).join(""):`<div class="card" style="text-align:center;padding:34px 16px"><img src="images/salted-popcorn.webp" alt="" width="72" height="72" style="border-radius:16px"><h2 style="margin:12px 0 4px">Nothing here yet</h2><p class="mu">The popcorn is calling.</p><button class="s" style="margin-top:8px" onclick="go('menu')">Browse menu</button></div>`}
${l.length?`<div class="card rc"><div class="row"><span class="mu">Subtotal</span><span>${inr(sub())}</span></div><div class="row"><span class="mu">GST \u00B7 5%</span><span>${inr(sub()*.05)}</span></div><div class="tear"></div><div class="row"><b>Total</b><b class="serif" style="font-size:24px;color:var(--ac2)">${inr(tot())}</b></div></div>
<div class="fld"><input id="nm" placeholder=" " maxlength="40" value="${esc(pay?.name&&pay.name!=="Guest"?pay.name:"")}" oninput="pay={...(pay||{}),name:this.value}"><label>Your name (optional)</label></div>
<div class="fld"><input id="nt" placeholder=" " maxlength="120" value="${esc(pay?.note||"")}" oninput="pay={...(pay||{}),note:this.value}"><label>Notes \u2013 e.g. less salt, no ice</label></div>
<div class="bar"><div><button class="full" onclick="toPay()">${IC.lock} Pay ${inr(tot())} \u00B7 UPI</button></div></div>`:""}`}

function toPay(){pay={name:($("#nm")||{}).value||"Guest",note:($("#nt")||{}).value||"",amt:tot()};msg="";document.activeElement&&document.activeElement.blur&&document.activeElement.blur();view="pay";render()}
function vPay(){return `${navrow("Secure checkout","cart")}
<h1 style="margin:6px 0 14px">Pay with <em>UPI</em></h1>${tk()}
<div class="card"><div class="merch">${wordmark()}<div style="flex:1"><b>cinezo</b><div class="mu" style="font-size:12px">Cinema counter \u00B7 Screen ${esc(seat.scr)}</div></div>${cfg.payments==="razorpay"?"":`<span class="tag gold">DEMO</span>`}</div>
<div class="amt">${inr(pay.amt)}</div><div class="mu">incl. 5% GST \u00B7 ${lines().reduce((a,l)=>a+l.q,0)} item(s)</div>
<hr class="sep">
${payFields()}
${msg?`<p style="color:var(--er);font-size:13.5px;font-weight:600">${esc(msg)}</p>`:""}
<button class="full" onclick="doPay()" ${paying?"disabled":""}>${IC.lock} Pay now</button>
<div class="trust">${IC.shield} ${cfg.payments==="razorpay"?"Secured by Razorpay Payments":"Encrypted demo gateway \u00B7 no real money moves"}</div></div>
<button class="g full" onclick="go('cart')">Back to cart</button>`}

function payFields(){
 if(cfg.payments==="razorpay")return `<div class="fld"><input id="phone" type="tel" inputmode="numeric" maxlength="10" placeholder=" " value="${esc(pay.phone||"")}" autocomplete="tel-national" oninput="pay.phone=this.value"><label>Mobile number</label></div><p class="mu" style="font-size:12px;margin:2px 0 10px">Pay with any UPI app in the next step.</p>`;
 return `<div class="fld"><input id="upi" placeholder=" " value="${esc(pay.upi||"success@demo")}" autocapitalize="off" autocomplete="off" spellcheck="false" oninput="pay.upi=this.value"><label>Your UPI ID</label></div>
<div class="upichips"><span class="mu" style="align-self:center;font-size:11.5px;font-weight:700">TRY:</span><button class="g" onclick="pay.upi='success@demo';$('#upi').value=pay.upi">success@demo</button><button class="g" onclick="pay.upi='fail@demo';$('#upi').value=pay.upi">fail@demo</button><button class="g" onclick="pay.upi='pending@demo';$('#upi').value=pay.upi">pending@demo</button></div>`}
const loadRazorpay=()=>window.Razorpay?Promise.resolve():new Promise((ok,no)=>{const s=document.createElement("script");s.src="https://checkout.razorpay.com/v1/checkout.js";s.onload=ok;s.onerror=()=>no(new Error("Could not load the payment window. Check your connection."));document.head.appendChild(s)});
async function doRazorpay(){
 const phone=($("#phone").value||"").replace(/\D/g,"").slice(-10);pay.phone=phone;
 if(!/^[6-9]\d{9}$/.test(phone)){msg="Enter a valid 10-digit mobile number.";return render()}
 paying=true;msg="";render();
 try{
  const o=await api("/pay",{method:"POST",body:{seat,items:lines().map(l=>({id:l.id,q:l.q})),name:pay.name,note:pay.note,phone}});
  await loadRazorpay();
  const rzp=new window.Razorpay({
   key:o.keyId,amount:o.amount,currency:"INR",order_id:o.sessionId,name:"cinezo",
   description:"In-seat snack order \u00B7 "+seatLabel(),
   prefill:{contact:phone,name:pay.name||""},
   theme:{color:"#C9A227"},
   handler:async(response)=>{
    try{
     const done=await api("/pay/verify",{method:"POST",body:{id:o.id,razorpay_payment_id:response.razorpay_payment_id,razorpay_signature:response.razorpay_signature}});
      myId=done.id;LS.s("ss_my",myId);cart={};orders=[done];connect();view="done";buzz([12,40,12]);render();
    }catch(e){logErr("Razorpay checkout failed",e);msg=e.message;toast(e.message,"err");paying=false;render()}
   },
modal:{ondismiss:async()=>{
     paying=false;
     // Checkout v2 closes automatically after success without calling handler.
     // Poll the server to confirm the payment with Razorpay.
     log("info", "ondismiss: Razorpay modal closed, polling for confirmation", { orderId: o.id });
     for(let i=0;i<8;i++){
      try{
       log("debug", "ondismiss: poll attempt "+(i+1)+"/8", { orderId: o.id });
       const st=await api("/orders/"+o.id+"/confirm",{method:"POST"});
       log("info", "ondismiss: confirm response", { orderId: o.id, status: st.status, paid: st.paid });
       if(st.status==="RECEIVED"||st.status==="PREPARING"||st.status==="READY"||st.status==="OUT_FOR_DELIVERY"||st.status==="DELIVERED"){
        log("info", "ondismiss: payment confirmed, showing success page", { orderId: o.id });
        myId=o.id;LS.s("ss_my",myId);orders=[st];connect();view="done";buzz([12,40,12]);render();
        return;
       }
      }catch(e){logErr("ondismiss: poll error",e)}
      await new Promise(r=>setTimeout(r,1500));
     }
     log("warn", "ondismiss: all polls failed, showing cancelled", { orderId: o.id });
     msg="Payment cancelled.";toast("Payment cancelled.","info");render();
    }}
  });
  rzp.open();
 }catch(e){msg=e.message;toast(e.message,"err");paying=false;render()}
}
async function doPay(){if(paying)return;if(cfg.payments==="razorpay")return doRazorpay();const u=($("#upi").value||"").trim().toLowerCase();pay.upi=u;
 if(!/^[\w.-]+@[\w-]+$/.test(u)){msg="Enter a valid UPI ID.";return render()}
 if(u.startsWith("fail")){msg="Payment failed. Try again or use another UPI ID.";return render()}
 paying=true;document.activeElement&&document.activeElement.blur&&document.activeElement.blur();
 const wait=u.startsWith("pending")?10000:1400;
 const hide=showProc(u.startsWith("pending")?"Approve the request in your UPI app \u2013 about 10 seconds.":"Processing your payment\u2026",u.startsWith("pending")?wait:0);
 await new Promise(r=>setTimeout(r,wait));
  try{const o=await api("/pay",{method:"POST",body:{seat,items:lines().map(l=>({id:l.id,q:l.q})),name:pay.name,note:pay.note,upi:u}});myId=o.id;LS.s("ss_my",myId);cart={};orders=[o];connect();view="done";buzz([12,40,12]);render()}
 catch(e){logErr("Payment failed",e);msg=e.message;view="pay";toast(e.message,"err")}
 hide();paying=false;render()}

function vDone(){const o=orders.find(x=>x.id===myId)||{id:"",seat:seatLabel(),items:[],total:pay?pay.amt:0};
return `<div class="hero"><svg class="ck" viewBox="0 0 52 52" aria-hidden="true"><circle class="ring" cx="26" cy="26" r="24"/><path class="tick" d="M15 27l8 8 15-17"/></svg>
<div class="eyebrow" style="margin-top:16px">Payment successful</div><h1 class="up">Order <em>confirmed!</em></h1><p class="mu up">Sit back \u2013 we'll bring it to you before the next scene.</p></div>
<div class="card up rc"><div class="row"><span class="mu">Order</span><b style="letter-spacing:.06em">${esc(o.id)}</b></div><div class="row"><span class="mu">Delivering to</span><b>${esc(o.seat)}</b></div><div class="tear"></div><div class="row"><span class="mu">${o.items.reduce((a,x)=>a+x.q,0)} item(s) \u00B7 paid via UPI</span><b class="serif" style="font-size:21px;color:var(--ac2)">${inr(o.total)}</b></div></div>
<button class="full up" onclick="go('track')">${IC.bell} Track my order</button>
<button class="g full up" style="margin-top:10px" onclick="go('menu')">Order more</button>`}

function vTrack(){const o=orders.find(x=>x.id===myId);
 if(!o)return `${navrow("Order","menu")}<div class="card" style="text-align:center;padding:34px 16px"><h2 style="margin:0 0 4px">No active order</h2><p class="mu">Your next snack is one tap away.</p><button class="s" style="margin-top:8px" onclick="go('menu')">Back to menu</button></div>`;
 const i=FLOW.indexOf(o.status),done=o.status==="DELIVERED",cx=o.status==="CANCELLED";
 const icons=[IC.receipt,IC.pan,IC.bell,IC.run,IC.seat];
 return `${navrow("Order "+esc(o.id),"menu")}
<div class="row" style="align-items:flex-start;margin-top:6px"><h1 class="${done||cx?"":"pulse"}" style="flex:1">${cx?"Order <em>cancelled</em>":done?"Delivered. <em>Enjoy!</em>":LBL[o.status]}</h1>${liveTag()}</div>
<div class="mu" style="margin-top:8px">Delivering to <b style="color:var(--tx)">${esc(o.seat)}</b></div>
${ETA[o.status]?`<p class="mu" style="margin-top:4px">${ETA[o.status]}</p>`:""}
${cx?`<div class="card issuebn"><b style="color:var(--er)">This order was cancelled</b><p class="mu" style="margin:6px 0 0">Your UPI refund is on its way \u2013 usually within 24 hours.</p></div>`:`
<div class="tl">${FLOW.map((s,k)=>`<div class="st ${k<i||done?"done":k===i?"now":"next"}"><span class="ic">${k<i||done?IC.check:icons[k]}</span><div style="padding-top:5px"><b>${LBL[s]}</b><div class="mu">${SUB[s]}</div></div></div>`).join("")}</div>`}
<div class="card rc">${o.items.map(x=>`<div class="row"><span>${x.q} \u2014 ${esc(x.n)}</span><span class="mu">${inr(x.p*x.q)}</span></div>`).join("")}<div class="tear"></div><div class="row"><span class="mu">Paid via ${esc(o.paid)}</span><b class="serif" style="font-size:21px;color:var(--ac2)">${inr(o.total)}</b></div></div>
${o.issue?`<div class="card issuebn" style="margin-top:0"><b style="color:var(--er)">Stall notified</b><p class="mu" style="margin:4px 0 0">Help is on the way to your seat.</p></div>`:""}
${!done&&!cx&&!o.issue?`<button class="g full" onclick="reportIssue('${o.id}')">${IC.alert} Not received?</button>`:""}
<button class="full" style="margin-top:10px" onclick="go('menu')">${IC.plus} Order more</button>`}
async function reportIssue(id){try{await api("/orders/"+id,{method:"PATCH",body:{action:"issue"}});toast("We've alerted the stall","ok");const o=orders.find(x=>x.id===id);if(o){o.issue=true;render()}}catch(e){toast(e.message,"err")}}

/* ================= VIEWS \u00B7 OWNER ================= */
const nxt=s=>FLOW[FLOW.indexOf(s)+1];
const adv=id=>{const before=orders.find(o=>o.id===id)?.status;return api("/orders/"+id,{method:"PATCH",body:{action:"advance"}}).then(()=>toast("Moved to "+(LBL[nxt(before)]||"next stage"),"ok")).catch(e=>toast(e.message,"err"))};
const cancel=id=>api("/orders/"+id,{method:"PATCH",body:{action:"cancel"}}).then(()=>toast("Order cancelled","info")).catch(e=>toast(e.message,"err"));
function vOwner(){if(!ownerOK)return `<div class="navrow">${wordmark()}${themeBtn()}</div>
<div class="pinwrap">${wordmark()}<div class="eyebrow">Owner access</div><h1 style="margin:8px 0 6px">Stall <em>dashboard</em></h1><p class="mu">Enter your PIN to manage live orders.</p>
<div class="card" id="pincard" style="text-align:left"><label class="lbl" for="pin">Owner PIN</label><input id="pin" class="plain" type="password" inputmode="numeric" autocomplete="current-password" placeholder="\u2022\u2022\u2022\u2022" onkeydown="if(event.key==='Enter')login()"><button class="full" style="margin-top:10px" onclick="login()">${IC.lock} Open dashboard</button>${local?`<p class="mu" style="text-align:center;margin:12px 0 0;font-size:12px">Demo PIN: <b>1234</b></p>`:""}</div>
<p style="text-align:center"><a href="#" style="font-size:13px;text-decoration:none">\u2190 Back to customer app</a></p></div>`;
const paid=orders.filter(o=>o.status!=="CANCELLED"),rev=paid.reduce((a,o)=>a+o.total,0);
let h=`<div class="navrow">${wordmark()}<span class="hacts">${liveTag()}<span class="tag">${local?"Demo \u00B7 this device":"Owner"}</span>${themeBtn()}<button class="ib" onclick="lockOwner()" aria-label="Lock dashboard">${IC.out}</button></span></div>
<h1 style="margin:8px 0 2px">Stall <em>dashboard</em></h1>
<div class="tabs" role="tablist">${["board","report","menu","qr"].map(t=>`<button role="tab" aria-selected="${t===tab}" class="${t===tab?"on":""}" onclick="tab='${t}';${t==="report"?"loadReport(repRange)":"render()"}">${{board:"Live orders",report:"Reports",menu:"Menu",qr:"Seat QR"}[t]}</button>`).join("")}</div>`;
if(tab==="board"){h+=`<div class="kp"><div class="card"><b>${paid.length}</b><div class="mu">Orders today</div></div><div class="card"><b>${inr(rev)}</b><div class="mu">Revenue today</div></div><div class="card"><b>${paid.length?inr(rev/paid.length):"\u20B90"}</b><div class="mu">Avg order</div></div></div>
<div class="board">`;
 [["RECEIVED","New"],["PREPARING","Preparing"],["READY","Ready \u00B7 by row"],["OUT_FOR_DELIVERY","Out for delivery"]].forEach(([s,t])=>{let l=orders.filter(o=>o.status===s);if(s==="READY")l=l.sort((a,b)=>(a.screen+a.row).localeCompare(b.screen+b.row));
 h+=`<div class="col ${s==="RECEIVED"&&l.length?"hot":""}"><div class="colh">${t}<span class="n">${l.length}</span></div>${l.length?l.map(o=>{const mins=Math.max(0,Math.round((Date.now()-o.t)/60000)),late=Date.now()-o.t>6e5||o.issue;
 return `<div class="card ${late?"late":""}"><div class="row"><b style="letter-spacing:.05em;font-size:13px">${esc(o.id)}</b><span class="tag ${late?"red":""}">${mins} min</span></div><div class="seat">${esc(o.seat)}</div><div class="items">${o.items.map(x=>x.q+"\u2014 "+esc(x.n)).join(", ")}</div>${o.note?`<div class="note">\u201C${esc(o.note)}\u201D</div>`:""}${o.issue?`<div class="iss">\u26A0 Customer: not received</div>`:""}<div class="row" style="margin-top:11px;justify-content:flex-start;gap:8px"><button class="s" onclick="adv('${o.id}')">${{RECEIVED:"Accept",PREPARING:"Mark ready",READY:"Out for delivery",OUT_FOR_DELIVERY:"Delivered"}[s]} ${IC.arrow}</button>${s==="RECEIVED"||s==="PREPARING"?`<button class="s d" onclick="cancel('${o.id}')">Cancel</button>`:""}</div></div>`}).join(""):`<div class="empty">No orders here</div>`}</div>`});
 h+=`</div><p class="mu" style="text-align:center">Delivered today: <b style="color:var(--tx)">${orders.filter(o=>o.status==="DELIVERED").length}</b> \u00B7 Board refreshes live</p>`}
if(tab==="menu")h+=`<p class="mu" style="margin-top:12px">Flip a switch to mark an item sold out \u2013 customers see it instantly.</p>`+MENU.map(m=>{const on=!sold.includes(m.id);return `<div class="it"><div class="im" style="flex-basis:56px;height:56px;--g1:${G[m.cat][0]};--g2:${G[m.cat][1]}">${m.art}</div><div class="in row"><div><b class="nm">${m.name}</b><div class="pr" style="font-size:14px">${inr(m.price)}</div></div><span style="display:inline-flex;align-items:center;gap:10px"><span class="mu" style="font-size:11.5px;font-weight:700">${on?"Available":"Sold out"}</span><button class="sw ${on?"on":""}" role="switch" aria-checked="${on}" aria-label="Toggle availability of ${m.name}" onclick="setSold('${m.id}')"><i></i></button></span></div></div>`}).join("");
if(tab==="qr")h+=`<div class="card"><p class="mu" style="margin-top:0">Each sticker carries its own link, so the seat is fixed by the QR. Print and stick one on the back of every seat.</p>
<label class="lbl">App link</label><input id="base" class="plain" value="${esc(base)}" autocapitalize="off" spellcheck="false">
<div class="sm"><div class="fld"><input id="qs" class="plain" value="2" inputmode="numeric" placeholder=" "><label style="left:10px">Screen</label></div><div class="fld"><input id="qr" class="plain" value="F" placeholder=" " maxlength="2"><label style="left:10px">Row</label></div><div class="fld"><input id="qa" class="plain" value="1" inputmode="numeric" placeholder=" "><label style="left:10px">From</label></div><div class="fld"><input id="qb" class="plain" value="8" inputmode="numeric" placeholder=" "><label style="left:10px">To</label></div></div>
<button class="full" onclick="mkQR()">${IC.qr} Generate stickers</button>
<button class="g full" style="margin-top:9px" onclick="window.print()" ${qrMade?"":"disabled"} id="printbtn">${IC.print} Print stickers</button></div>
<div id="qrs" style="text-align:center"></div>`;
if(tab==="report")h+=vReport();
return h}

async function loadReport(r){repRange=r;rep=null;render();try{rep=await api("/stats?range="+r)}catch(e){toast(e.message,"err")}render()}
function vReport(){
 const R=[["today","Today"],["week","7 days"],["month","30 days"]];
 let h=`<div class="tabs" role="tablist">${R.map(([k,t])=>`<button role="tab" aria-selected="${k===repRange}" class="${k===repRange?"on":""}" onclick="loadReport('${k}')">${t}</button>`).join("")}</div>`;
 if(local)return h+`<div class="empty">Reports need the live server.</div>`;
 if(!rep)return h+`<div class="empty">Loading\u2026</div>`;
 const max=Math.max(1,...rep.buckets.map(b=>b.orders)),step=Math.ceil(rep.buckets.length/8);
 h+=`<div class="kp"><div class="card"><b>${rep.orders}</b><div class="mu">Orders</div></div><div class="card"><b>${inr(rep.revenue)}</b><div class="mu">Revenue</div></div><div class="card"><b>${inr(rep.avg)}</b><div class="mu">Avg order</div></div></div>`;
 h+=`<div class="card"><div class="mu" style="margin:0 0 10px">Orders over time \u00B7 ${rep.cancelled} cancelled</div><div style="display:flex;align-items:flex-end;gap:3px;height:120px">${rep.buckets.map(b=>`<div title="${esc(b.label)}: ${b.orders} orders \u00B7 ${inr(b.revenue)}" style="flex:1;min-width:0;height:${Math.max(2,b.orders/max*100)}%;background:var(--ac);border-radius:3px 3px 0 0"></div>`).join("")}</div><div style="display:flex;gap:3px;margin-top:4px">${rep.buckets.map((b,i)=>`<span class="mu" style="flex:1;min-width:0;font-size:9px;white-space:nowrap">${i%step?"":esc(b.label)}</span>`).join("")}</div></div>`;
 h+=`<div class="card"><div class="mu" style="margin:0 0 8px">Top items</div>${rep.top.length?rep.top.map(t=>`<div class="row"><span>${esc(t.name)}</span><b>${t.qty} \u00B7 ${inr(t.sales)}</b></div>`).join(""):`<div class="empty">No sales yet</div>`}</div>`;
 return h}

/* ================= QR ================= */
async function mkQR(){const b=($("#base").value||base).split("#")[0];base=b;LS.s("ss_base",b);const s=$("#qs").value,r=$("#qr").value.toUpperCase(),a=Math.max(1,+$("#qa").value||1),z=Math.min(+$("#qb").value||a,a+59),box=$("#qrs");
 let sigs={};try{if(!local)(await api("/seats/sign",{method:"POST",body:{scr:s,row:r,from:a,to:z}})).seats.forEach(x=>sigs[x.no]=x.sig)}catch(e){return toast(e.message,"err")}
 box.innerHTML="";
 for(let n=a;n<=z;n++){const d=document.createElement("span");d.className="qr";d.innerHTML=`<img class="wordmark-img" src="images/cinezo-wordmark-dark.svg" alt="Cinezo"><span class="qrc"></span><b>Screen ${esc(s)} \u00B7 ${esc(r)}${n}</b><small>craveit . scan it. enjoy it</small>`;box.appendChild(d);qrTo(d.querySelector(".qrc"),`${b}#seat-${s}-${r}-${n}${sigs[n]?"-"+sigs[n]:""}`,118)}
 qrMade=true;const pb=$("#printbtn");pb&&(pb.disabled=false);toast(`${z-a+1} stickers ready \u2013 hit print`,"ok")}
function qrTo(el,t,w){try{new QRCode(el,{text:t,width:w,height:w,correctLevel:QRCode.CorrectLevel.M})}catch(e){el.innerHTML=`<span style="font-size:10px;color:#8a7c5c;padding:8px;display:block;word-break:break-all">${esc(t)}</span>`}}
function drawQR(){document.querySelectorAll("[data-qr]:empty").forEach(e=>qrTo(e,`${base}#seat-${e.dataset.qr}`,112))}

/* ================= BOOT ================= */
setInterval(()=>{if(view==="owner"&&tab==="board"&&ownerOK)render()},30000);
route();initStore();

/* ================= GLOBAL ERROR HANDLING ================= */
window.addEventListener("error", (e) => logErr("Uncaught error", e.error));
window.addEventListener("unhandledrejection", (e) => logErr("Unhandled promise rejection", e.reason));


