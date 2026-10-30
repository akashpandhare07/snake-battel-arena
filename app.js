const socket = io();
const $ = id => document.getElementById(id);
let roomCode=null, roomData=null, me=null, ready=false, lastState=null, toastTimer;
const screens=["home","lobby","game","results"];
function show(id){screens.forEach(s=>$(s).classList.toggle("hidden",s!==id));}
function toast(msg){$("toast").textContent=msg;$("toast").classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>$("toast").classList.remove("show"),2600)}
function name(){return $("nickname").value.trim().slice(0,16)||"Player"}
$("createBtn").onclick=()=>socket.emit("room:create",{name:name()});
$("joinBtn").onclick=()=>socket.emit("room:join",{code:$("roomCode").value,name:name()});
$("roomCode").addEventListener("keydown",e=>{if(e.key==="Enter")$("joinBtn").click()});
$("copyBtn").onclick=async()=>{try{await navigator.clipboard.writeText(roomCode);toast("Room code copied!")}catch{toast("Room code: "+roomCode)}};
$("leaveBtn").onclick=()=>{location.reload()};
$("readyBtn").onclick=()=>{ready=!ready;socket.emit("player:ready",ready);$("readyBtn").textContent=ready?"CANCEL READY":"I'M READY"};
$("startBtn").onclick=()=>socket.emit("game:start");
$("rematchBtn").onclick=()=>socket.emit("game:rematch");
$("homeBtn").onclick=()=>location.reload();
socket.on("connect",()=>{me=socket.id});
socket.on("room:joined",d=>{roomCode=d.code;$("codeLabel").textContent=roomCode;show("lobby");toast("Joined room "+roomCode)});
socket.on("error:message",toast);
socket.on("room:update",r=>{
  roomData=r;
  if(r.status==="waiting"){
    show("lobby");
    $("playerCount").textContent=`${r.players.length} / 8 players`;
    $("players").innerHTML=r.players.map(p=>`<div class="player-card"><div class="avatar" style="background:${p.color}">${escapeHtml(p.name[0].toUpperCase())}</div><div><b>${escapeHtml(p.name)}</b><small>${p.ready?"✓ READY":"NOT READY"} ${p.id===me?" • YOU":""}</small></div></div>`).join("");
    const mine=r.players.find(p=>p.id===me);
    $("readyBtn").classList.toggle("hidden",!mine);
    $("readyBtn").textContent=mine?.ready?"CANCEL READY":"I'M READY";
    $("startBtn").classList.toggle("hidden",!mine || r.players.length<2);
    $("startBtn").disabled=r.players.length<2||r.players.some(p=>!p.ready);
  }
  if(r.status==="playing"&&r.state){show("game");lastState=r.state;draw(r.state);updateRanks(r.players);const mine=r.players.find(p=>p.id===me);$("myScore").textContent=mine?.score||0;$("timer").textContent=formatTime(r.state.timeLeft)}
});
socket.on("game:over",d=>{show("results");$("winner").textContent=d.winner?`${d.winner.name} — ${d.winner.score} POINTS`:"No winner";$("finalRanks").innerHTML=d.final.map(p=>`<div class="final-row"><span>#${p.rank} ${escapeHtml(p.name)}</span><b>${p.score} pts</b></div>`).join("")});
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function formatTime(s){return `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`}
function updateRanks(players){$("ranking").innerHTML=[...players].sort((a,b)=>b.score-a.score).map((p,i)=>`<div class="rank-row"><span>${i+1}.</span><i class="rank-dot" style="background:${p.color}"></i><span>${escapeHtml(p.name)}${p.id===me?" (you)":""}</span><strong>${p.score}</strong></div>`).join("")}
const canvas=$("arena"),ctx=canvas.getContext("2d");
function draw(s){
 ctx.clearRect(0,0,1000,650);ctx.fillStyle="#07101b";ctx.fillRect(0,0,1000,650);
 ctx.strokeStyle="#14253a";ctx.lineWidth=1;for(let x=0;x<1000;x+=50){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,650);ctx.stroke()}for(let y=0;y<650;y+=50){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(1000,y);ctx.stroke()}
 for(const c of s.coins||[]){ctx.beginPath();ctx.arc(c.x,c.y,c.golden?8:5,0,Math.PI*2);ctx.fillStyle=c.golden?"#ffd166":"#58f5a5";ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=14;ctx.fill();ctx.shadowBlur=0}
 for(const q of s.powerups||[]){ctx.font="20px sans-serif";ctx.fillText("⚡",q.x-10,q.y+8)}
 for(const snake of s.snakes||[]){if(!snake.alive)continue;snake.body.forEach((b,i)=>{ctx.beginPath();ctx.arc(b.x,b.y,i===0?8:6,0,Math.PI*2);ctx.fillStyle=snake.color;ctx.shadowColor=snake.color;ctx.shadowBlur=i===0?18:8;ctx.fill();ctx.shadowBlur=0});const h=snake.body[0];if(h){ctx.fillStyle="#07101b";ctx.beginPath();ctx.arc(h.x-2,h.y-2,1.8,0,7);ctx.fill()}}
}
function direction(d){socket.emit("player:direction",d)}
document.addEventListener("keydown",e=>{const k=e.key.toLowerCase(),m={arrowup:"up",w:"up",arrowdown:"down",s:"down",arrowleft:"left",a:"left",arrowright:"right",d:"right"};if(m[k]){e.preventDefault();direction(m[k])}});
document.querySelectorAll("[data-dir]").forEach(b=>{b.addEventListener("pointerdown",e=>{e.preventDefault();direction(b.dataset.dir)})});
