const COLORS=['#1D9E75','#378ADD','#BA7517','#D4537E','#7F77DD','#D85A30','#639922','#888780'];
const DAYS=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

const defaultCategories=[
  {id:'sleep',name:'Sleep',color:'#7F77DD',goal:450,subs:[],schedule:{mode:'same'},goalHistory:[]},
  {id:'work',name:'Work',color:'#378ADD',goal:240,subs:['Admin','Meetings','Deep work'],schedule:{mode:'same'},goalHistory:[]},
  {id:'business',name:'Business',color:'#1D9E75',goal:120,subs:['Strategy','Content','Outreach'],schedule:{mode:'same'},goalHistory:[]},
  {id:'sport',name:'Sport & outdoors',color:'#D85A30',goal:60,subs:['Surf','Sailing','Running','Gym'],schedule:{mode:'same'},goalHistory:[]},
  {id:'learning',name:'Learning',color:'#BA7517',goal:60,subs:['Reading','Courses','Research'],schedule:{mode:'same'},goalHistory:[]},
  {id:'social',name:'Social',color:'#D4537E',goal:60,subs:['Family','Friends','Community'],schedule:{mode:'same'},goalHistory:[]},
  {id:'dailylife',name:'Daily life',color:'#639922',goal:90,subs:['Meals','Commute','Errands'],schedule:{mode:'same'},goalHistory:[]},
  {id:'wellbeing',name:'Wellbeing',color:'#888780',goal:30,subs:['Meditation','Rest','Health'],schedule:{mode:'same'},goalHistory:[]}
];

let state={
  categories:defaultCategories,
  timer:{running:false,catId:null,subCat:null,startTs:null,elapsed:0},
  entries:[],selectedCat:null,selectedSub:null,
  currentPeriod:'day',customDays:30,reminderSteps:8,editingCatId:null
};
let schedMode='same';
let timerInterval=null;
let modalTempSubs=[];

// ── Persistence ──────────────────────────────────────────────────────────────
function saveState(){try{localStorage.setItem('tt_pwa',JSON.stringify(state))}catch(e){}}
function loadState(){
  try{
    const s=localStorage.getItem('tt_pwa');
    if(s){
      const p=JSON.parse(s);
      Object.assign(state,p);
      state.categories=state.categories.map(c=>({schedule:{mode:'same'},goalHistory:[],subs:[],...c}));
    }
  }catch(e){}
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function minsToHM(m){return Math.floor(m/60)+'h '+(m%60).toString().padStart(2,'0')+'min'}
function hmToMins(h,m){return(parseInt(h)||0)*60+(parseInt(m)||0)}
function todayStr(){return new Date().toISOString().slice(0,10)}
function todayDow(){const d=new Date().getDay();return d===0?6:d-1}
function dateToIso(s){return new Date(s+'T00:00:00')}
function fmtReminder(s){const m=s*15;if(m<60)return m+'min';if(m%60===0)return(m/60)+'h';return Math.floor(m/60)+'h '+(m%60)+'min';}
function fmtDur(ms){const s=Math.floor(ms/1000),h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sc=s%60;return`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sc).padStart(2,'0')}`}
function fmtH(ms){const h=ms/3600000;if(h<1)return Math.round(h*60)+'min';return h.toFixed(1)+'h'}
function getCat(id){return state.categories.find(c=>c.id===id)}

function currentGoalForDay(cat,dow){
  const s=cat.schedule;
  if(!s||s.mode==='same')return cat.goal;
  if(s.mode==='weekday')return dow<5?s.weekday:s.weekend;
  if(s.mode==='custom')return(s.days&&s.days[dow]!=null)?s.days[dow]:cat.goal;
  return cat.goal;
}
function getGoalForDay(cat,dow,dateStr){
  const hist=cat.goalHistory;
  if(hist&&hist.length&&dateStr){
    const d=dateToIso(dateStr);
    const app=hist.filter(h=>dateToIso(h.from)<=d).sort((a,b)=>dateToIso(b.from)-dateToIso(a.from));
    if(app.length){
      const e=app[0];
      if(e.mode==='same')return e.goal;
      if(e.mode==='weekday')return dow<5?e.weekday:e.weekend;
      if(e.mode==='custom')return(e.days&&e.days[dow]!=null)?e.days[dow]:e.goal;
    }
  }
  return currentGoalForDay(cat,dow);
}
function otherTotal(excludeId,dow){
  return state.categories.filter(c=>c.id!==excludeId).reduce((s,c)=>s+currentGoalForDay(c,dow),0);
}

// ── Timer ─────────────────────────────────────────────────────────────────────
function renderCatGrid(){
  const g=document.getElementById('cat-grid');g.innerHTML='';
  state.categories.forEach(c=>{
    const b=document.createElement('button');
    b.className='cat-btn'+(state.selectedCat===c.id?' selected':'');
    if(state.selectedCat===c.id)b.style.borderColor=c.color;
    b.innerHTML=`<span class="cat-dot" style="background:${c.color}"></span><div class="cat-name">${c.name}</div>`;
    b.onclick=()=>selectCat(c.id);g.appendChild(b);
  });
}
function selectCat(id){
  state.selectedCat=id;state.selectedSub=null;
  document.getElementById('start-btn').disabled=false;
  const c=getCat(id);
  const subSec=document.getElementById('sub-section'),subRow=document.getElementById('sub-row');
  if(c.subs&&c.subs.length){
    subSec.style.display='block';subRow.innerHTML='';
    c.subs.forEach(s=>{
      const chip=document.createElement('button');chip.className='sub-chip';chip.textContent=s;
      chip.onclick=()=>{state.selectedSub=s;subRow.querySelectorAll('.sub-chip').forEach(x=>x.classList.remove('active'));chip.classList.add('active');};
      subRow.appendChild(chip);
    });
  }else subSec.style.display='none';
  renderCatGrid();
}
function startTimer(){
  if(!state.selectedCat)return;
  state.timer={running:true,catId:state.selectedCat,subCat:state.selectedSub,startTs:Date.now(),elapsed:0};
  saveState();
  document.getElementById('start-controls').style.display='none';
  document.getElementById('running-controls').style.display='block';
  document.getElementById('timer-card').classList.add('timer-running');
  const c=getCat(state.timer.catId);
  document.getElementById('timer-cat-label').textContent=c.name+(state.timer.subCat?' · '+state.timer.subCat:'');
  startTick();
  requestNotifPermission();
}
function startTick(){
  clearInterval(timerInterval);
  timerInterval=setInterval(()=>{
    if(!state.timer.running)return;
    const elapsed=Date.now()-state.timer.startTs+(state.timer.elapsed||0);
    document.getElementById('timer-display').textContent=fmtDur(elapsed);
    const limit=(state.reminderSteps||8)*15*60000;
    if(elapsed>limit&&!state._reminderShown){state._reminderShown=true;showResumeModal('still-running');}
  },1000);
}
function stopTimer(adj){
  clearInterval(timerInterval);
  const elapsed=adj!=null?adj:(Date.now()-state.timer.startTs+(state.timer.elapsed||0));
  state.entries.push({id:Date.now(),catId:state.timer.catId,subCat:state.timer.subCat,startTs:state.timer.startTs,duration:elapsed,date:todayStr()});
  state.timer={running:false,catId:null,subCat:null,startTs:null,elapsed:0};
  state._reminderShown=false;state.selectedCat=null;state.selectedSub=null;
  saveState();
  document.getElementById('timer-display').textContent='00:00:00';
  document.getElementById('timer-cat-label').textContent='Select a category to start';
  document.getElementById('timer-card').classList.remove('timer-running');
  document.getElementById('running-controls').style.display='none';
  document.getElementById('start-controls').style.display='block';
  document.getElementById('start-btn').disabled=true;
  renderCatGrid();renderEntries();renderDashboard();
}
function showResumeModal(type){
  const c=getCat(state.timer.catId);
  document.getElementById('resume-title').textContent=type==='still-running'?'Still tracking?':'Resume tracking?';
  document.getElementById('resume-q').textContent=`You've been logging "${c?c.name:'?'}" for ${fmtH(Date.now()-state.timer.startTs)}. Still active?`;
  document.getElementById('modal-resume').style.display='flex';
}
function resumeKeep(){closeModal('modal-resume');state._reminderShown=false;}
function resumeStop(){closeModal('modal-resume');stopTimer();}
function resumeAdjust(){
  closeModal('modal-resume');
  const ms=Date.now()-state.timer.startTs;
  const adj=prompt('Actual duration in minutes (logged: '+Math.round(ms/60000)+'min)?');
  if(adj&&!isNaN(adj))stopTimer(parseInt(adj)*60000);else stopTimer();
}
function renderEntries(){
  const list=document.getElementById('entries-list');
  const today=state.entries.filter(e=>e.date===todayStr()).slice().reverse();
  if(!today.length){list.innerHTML='<p style="font-size:13px;color:var(--text-secondary)">No entries yet today.</p>';return;}
  list.innerHTML='';
  today.forEach(e=>{
    const c=getCat(e.catId);if(!c)return;
    const div=document.createElement('div');div.className='entry';
    div.innerHTML=`<span class="entry-dot" style="background:${c.color}"></span><div class="entry-info"><div class="entry-cat">${c.name}${e.subCat?' · '+e.subCat:''}</div><div class="entry-time">${new Date(e.startTs).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</div></div><div class="entry-dur">${fmtH(e.duration)}</div>`;
    list.appendChild(div);
  });
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function getPeriod(){
  const now=new Date(),today=todayStr();
  if(state.currentPeriod==='day')return{start:today,end:today,days:1,label:'Tracked today',totalH:24};
  if(state.currentPeriod==='week'){
    const dow=now.getDay(),mon=new Date(now);mon.setDate(now.getDate()-(dow===0?6:dow-1));
    return{start:mon.toISOString().slice(0,10),end:today,days:7,label:'Tracked this week',totalH:168};
  }
  if(state.currentPeriod==='month'){
    const start=new Date(now.getFullYear(),now.getMonth(),1).toISOString().slice(0,10);
    const dim=new Date(now.getFullYear(),now.getMonth()+1,0).getDate();
    return{start,end:today,days:dim,label:'Tracked this month',totalH:dim*24};
  }
  const d=parseInt(state.customDays)||30;
  return{start:new Date(now-d*86400000).toISOString().slice(0,10),end:today,days:d,label:`Tracked (${d} days)`,totalH:d*24};
}
function getGoalForPeriod(cat){
  const{start,days}=getPeriod();let total=0;
  const sd=dateToIso(start);
  for(let i=0;i<days;i++){const d=new Date(sd);d.setDate(sd.getDate()+i);const ds=d.toISOString().slice(0,10);total+=getGoalForDay(cat,d.getDay()===0?6:d.getDay()-1,ds);}
  return total;
}
function setPeriod(p,btn){
  state.currentPeriod=p;
  document.querySelectorAll('.period-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');
  document.getElementById('custom-row').style.display=p==='custom'?'flex':'none';
  renderDashboard();
}
function updateCustom(){state.customDays=parseInt(document.getElementById('custom-days').value)||30;renderDashboard();}
function renderDashboard(){
  const{days,label,totalH}=getPeriod();
  const{start,end}=getPeriod();
  const entries=state.entries.filter(e=>e.date>=start&&e.date<=end);
  const totalMs=entries.reduce((a,e)=>a+e.duration,0);
  document.getElementById('m-label').textContent=label;
  document.getElementById('m-tracked').textContent=fmtH(totalMs);
  document.getElementById('m-sub').textContent=`of ${totalH}h`;
  const bycat={};entries.forEach(e=>{bycat[e.catId]=(bycat[e.catId]||0)+e.duration;});
  const goalsmet=state.categories.filter(c=>(bycat[c.id]||0)>=getGoalForPeriod(c)*60000).length;
  document.getElementById('m-goals').textContent=`${goalsmet}/${state.categories.length}`;
  document.getElementById('m-goals-sub').textContent=days===1?'categories today':'categories';
  const chart=document.getElementById('bar-chart');chart.innerHTML='';
  state.categories.forEach(c=>{
    const got=bycat[c.id]||0,target=getGoalForPeriod(c)*60000;
    const pct=target>0?Math.min(got/target,1.5):0,delta=got-target;
    chart.innerHTML+=`<div class="bar-row"><span class="bar-label">${c.name.split(' ')[0]}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.round(pct*100/1.5)}%;background:${c.color}"></div><div class="bar-target" style="left:${Math.round(100/1.5)}%"></div></div><span class="bar-val">${fmtH(got)}</span><span class="bar-delta ${delta>=0?'pos':'neg'}">${(delta>=0?'+':'-')+fmtH(Math.abs(delta))}</span></div>`;
  });
  const untrackedMs=Math.max(0,totalH*3600000-totalMs);
  const all=[...state.categories.map(c=>({name:c.name,color:c.color,ms:bycat[c.id]||0})),{name:'Untracked',color:'#B4B2A9',ms:untrackedMs}];
  const tot=all.reduce((a,x)=>a+x.ms,0)||1;
  const canvas=document.getElementById('donut'),ctx=canvas.getContext('2d');
  ctx.clearRect(0,0,110,110);let angle=-Math.PI/2;
  all.forEach(a=>{const slice=a.ms/tot*Math.PI*2;ctx.beginPath();ctx.moveTo(55,55);ctx.arc(55,55,44,angle,angle+slice);ctx.closePath();ctx.fillStyle=a.color;ctx.fill();angle+=slice;});
  ctx.beginPath();ctx.arc(55,55,28,0,Math.PI*2);
  ctx.fillStyle=getComputedStyle(document.documentElement).getPropertyValue('--bg-primary').trim()||'#fff';
  ctx.fill();
  const legend=document.getElementById('donut-legend');legend.innerHTML='';
  all.filter(a=>a.ms>0).forEach(a=>{legend.innerHTML+=`<div class="legend-row"><span class="legend-sq" style="background:${a.color}"></span><span class="legend-name">${a.name.split(' ')[0]}</span><span class="legend-pct">${Math.round(a.ms/tot*100)}%</span></div>`;});
}

// ── Settings ──────────────────────────────────────────────────────────────────
function renderWeekly(){
  const grid=document.getElementById('weekly-grid');grid.innerHTML='';
  const dow=todayDow();
  DAYS.forEach((d,i)=>{
    const total=state.categories.reduce((s,c)=>s+currentGoalForDay(c,i),0),over=total>1440;
    const h=Math.floor(total/60),m=total%60;
    const cell=document.createElement('div');cell.className='day-cell'+(i===dow?' today':'');
    cell.innerHTML=`<div class="day-name">${d}</div><div class="day-val${over?' over':''}">${h>0?(m>0?h+'h<br>'+m+'m':h+'h'):(m+'m')}</div>`;
    grid.appendChild(cell);
  });
}
function renderSettingsCats(){
  renderWeekly();
  const list=document.getElementById('settings-cat-list');list.innerHTML='';
  state.categories.forEach(c=>{
    const s=c.schedule;
    let goalDesc=!s||s.mode==='same'?minsToHM(c.goal)+' / day':s.mode==='weekday'?`Weekdays: ${minsToHM(s.weekday)} · Weekends: ${minsToHM(s.weekend)}`:'Custom per day';
    const subCount=c.subs&&c.subs.length?`${c.subs.length} sub-cat${c.subs.length>1?'s':''}`:' No sub-categories';
    const div=document.createElement('div');div.className='cat-item';
    div.innerHTML=`<span class="cat-dot" style="background:${c.color};margin-top:3px"></span><div class="cat-item-info"><div class="cat-item-name">${c.name}</div><div class="cat-item-goal">${goalDesc} · ${subCount}</div></div><button class="edit-btn" onclick="openEdit('${c.id}')">Edit</button>`;
    list.appendChild(div);
  });
}
function updateReminder(v){state.reminderSteps=parseInt(v);document.getElementById('s-reminder-val').textContent=fmtReminder(parseInt(v));saveState();}

// ── Edit modal ────────────────────────────────────────────────────────────────
function openEdit(id){
  state.editingCatId=id;const c=getCat(id);
  document.getElementById('edit-title').textContent='Edit';
  document.getElementById('edit-cat-name').value=c.name;
  document.getElementById('save-btn').disabled=false;
  modalTempSubs=[...(c.subs||[])];renderModalSubs();
  const mode=(c.schedule&&c.schedule.mode)||'same';
  schedMode=mode;
  document.querySelectorAll('.sched-radio').forEach(el=>el.classList.remove('active'));
  document.getElementById('sched-'+mode+'-lbl').classList.add('active');
  document.querySelector(`input[name="sched"][value="${mode}"]`).checked=true;
  ['same','wd','we'].forEach(k=>{const e=document.getElementById('err-'+k);if(e)e.style.display='none';});
  document.getElementById('goal-same').style.display='none';
  document.getElementById('goal-weekday').style.display='none';
  document.getElementById('goal-custom').style.display='none';
  if(mode==='same'){
    document.getElementById('goal-same').style.display='block';
    document.getElementById('g-same-h').value=Math.floor(c.goal/60);
    document.getElementById('g-same-m').value=c.goal%60;
    validateGoal('same',0);
  }else if(mode==='weekday'){
    document.getElementById('goal-weekday').style.display='block';
    document.getElementById('g-wd-h').value=Math.floor(c.schedule.weekday/60);
    document.getElementById('g-wd-m').value=c.schedule.weekday%60;
    document.getElementById('g-we-h').value=Math.floor(c.schedule.weekend/60);
    document.getElementById('g-we-m').value=c.schedule.weekend%60;
    validateGoal('wd',0);validateGoal('we',5);
  }else{
    document.getElementById('goal-custom').style.display='block';
    renderCustomDays(c);
  }
  document.getElementById('modal-edit').style.display='flex';
}
function renderModalSubs(){
  const cont=document.getElementById('modal-subs');cont.innerHTML='';
  if(!modalTempSubs.length){cont.innerHTML='<span style="font-size:12px;color:var(--text-secondary)">None yet</span>';return;}
  modalTempSubs.forEach((s,i)=>{
    const tag=document.createElement('span');tag.className='sub-tag';
    tag.innerHTML=`<span>${s}</span><button class="sub-tag-del" onclick="modalDelSub(${i})">×</button>`;
    cont.appendChild(tag);
  });
}
function modalAddSub(){
  const inp=document.getElementById('modal-sub-input');
  const v=inp.value.trim();
  if(!v||modalTempSubs.includes(v))return;
  modalTempSubs.push(v);inp.value='';renderModalSubs();
}
function modalDelSub(i){modalTempSubs.splice(i,1);renderModalSubs();}
function validateGoal(key,dow){
  const h=document.getElementById('g-'+key+'-h'),m=document.getElementById('g-'+key+'-m');
  const val=hmToMins(h.value,m.value),others=otherTotal(state.editingCatId,dow),remaining=1440-others,over=val>remaining;
  const remEl=document.getElementById('rem-'+key),errEl=document.getElementById('err-'+key);
  remEl.textContent=over?'':(remaining-val)+'min left';
  remEl.className='rem-hint'+((!over&&remaining-val<60)?' warn':'');
  errEl.style.display=over?'block':'none';
  document.getElementById('save-btn').disabled=hasError();
}
function hasError(){
  if(schedMode==='same')return document.getElementById('err-same').style.display!=='none';
  if(schedMode==='weekday')return document.getElementById('err-wd').style.display!=='none'||document.getElementById('err-we').style.display!=='none';
  for(let i=0;i<7;i++){const e=document.getElementById('err-day-'+i);if(e&&e.style.display!=='none')return true;}
  return false;
}
function renderCustomDays(c){
  const cont=document.getElementById('day-goals-inputs');cont.innerHTML='';
  DAYS.forEach((d,i)=>{
    const val=currentGoalForDay(c,i);
    cont.innerHTML+=`<div class="dg-row"><span class="dg-label">${d}</span><div class="dg-inputs"><input class="dg-inp" type="number" id="g-day-${i}-h" min="0" max="23" value="${Math.floor(val/60)}" oninput="validateDay(${i})"><span class="dg-lbl">h</span><input class="dg-inp" type="number" id="g-day-${i}-m" min="0" max="59" value="${val%60}" oninput="validateDay(${i})"><span class="dg-lbl">min</span><span class="dg-rem" id="rem-day-${i}"></span><span class="dg-err" id="err-day-${i}">Over 24h</span></div></div>`;
  });
  DAYS.forEach((_,i)=>validateDay(i));
}
function validateDay(i){
  const h=document.getElementById('g-day-'+i+'-h'),m=document.getElementById('g-day-'+i+'-m');
  if(!h||!m)return;
  const val=hmToMins(h.value,m.value),others=otherTotal(state.editingCatId,i),remaining=1440-others,over=val>remaining;
  const remEl=document.getElementById('rem-day-'+i),errEl=document.getElementById('err-day-'+i);
  if(remEl)remEl.textContent=over?'':(remaining-val)+'m left';
  if(errEl)errEl.style.display=over?'inline':'none';
  document.getElementById('save-btn').disabled=hasError();
}
function setSchedMode(mode){
  schedMode=mode;
  document.querySelectorAll('.sched-radio').forEach(el=>el.classList.remove('active'));
  document.getElementById('sched-'+mode+'-lbl').classList.add('active');
  document.getElementById('goal-same').style.display=mode==='same'?'block':'none';
  document.getElementById('goal-weekday').style.display=mode==='weekday'?'block':'none';
  document.getElementById('goal-custom').style.display=mode==='custom'?'block':'none';
  if(mode==='custom')renderCustomDays(getCat(state.editingCatId));
  if(mode==='same')validateGoal('same',0);
  if(mode==='weekday'){validateGoal('wd',0);validateGoal('we',5);}
}
function archiveGoal(cat){
  if(!cat.goalHistory)cat.goalHistory=[];
  const s=cat.schedule||{mode:'same'};
  const entry={from:todayStr(),mode:s.mode};
  if(s.mode==='same')entry.goal=cat.goal;
  else if(s.mode==='weekday'){entry.weekday=s.weekday;entry.weekend=s.weekend;entry.goal=s.weekday;}
  else if(s.mode==='custom'){entry.days=[...s.days];entry.goal=cat.goal;}
  const last=cat.goalHistory[cat.goalHistory.length-1];
  if(!last||JSON.stringify(last)!==JSON.stringify(entry))cat.goalHistory.push(entry);
}
function confirmEdit(){
  const c=getCat(state.editingCatId);
  const newName=document.getElementById('edit-cat-name').value.trim();
  if(newName)c.name=newName;
  archiveGoal(c);c.subs=[...modalTempSubs];
  if(schedMode==='same'){c.goal=hmToMins(document.getElementById('g-same-h').value,document.getElementById('g-same-m').value);c.schedule={mode:'same'};}
  else if(schedMode==='weekday'){const wd=hmToMins(document.getElementById('g-wd-h').value,document.getElementById('g-wd-m').value),we=hmToMins(document.getElementById('g-we-h').value,document.getElementById('g-we-m').value);c.schedule={mode:'weekday',weekday:wd,weekend:we};c.goal=wd;}
  else{const days=DAYS.map((_,i)=>hmToMins(document.getElementById('g-day-'+i+'-h').value,document.getElementById('g-day-'+i+'-m').value));c.schedule={mode:'custom',days};c.goal=days[todayDow()];}
  saveState();renderSettingsCats();renderDashboard();renderCatGrid();closeModal('modal-edit');
}
function showAddCat(){document.getElementById('new-cat-name').value='';document.getElementById('new-cat-h').value='';document.getElementById('new-cat-m').value='30';document.getElementById('modal-add-cat').style.display='flex';}
function confirmAddCat(){
  const name=document.getElementById('new-cat-name').value.trim();
  const mins=hmToMins(document.getElementById('new-cat-h').value,document.getElementById('new-cat-m').value);
  if(name){state.categories.push({id:'cat_'+Date.now(),name,color:COLORS[state.categories.length%COLORS.length],goal:mins||30,subs:[],schedule:{mode:'same'},goalHistory:[]});saveState();renderCatGrid();renderSettingsCats();}
  closeModal('modal-add-cat');
}
function closeModal(id){document.getElementById(id).style.display='none';}

// ── Navigation ────────────────────────────────────────────────────────────────
function showScreen(name,btn){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('screen-'+name).classList.add('active');
  if(btn)btn.classList.add('active');
  if(name==='dashboard')renderDashboard();
  if(name==='settings')renderSettingsCats();
}

// ── Notifications ─────────────────────────────────────────────────────────────
function requestNotifPermission(){
  if('Notification' in window&&Notification.permission==='default'){Notification.requestPermission();}
}
function sendNotif(title,body){
  if('Notification' in window&&Notification.permission==='granted'){new Notification(title,{body,icon:'icons/icon-192.png'});}
}

// ── Service Worker ────────────────────────────────────────────────────────────
if('serviceWorker' in navigator){
  window.addEventListener('load',()=>{navigator.serviceWorker.register('sw.js').catch(()=>{});});
}

// ── Init ──────────────────────────────────────────────────────────────────────
function init(){
  loadState();
  document.getElementById('today-date').textContent=new Date().toLocaleDateString([],{weekday:'long',month:'long',day:'numeric'});
  const steps=state.reminderSteps||8;
  document.getElementById('s-reminder').value=steps;
  document.getElementById('s-reminder-val').textContent=fmtReminder(steps);
  document.getElementById('custom-days').value=state.customDays||30;
  renderCatGrid();renderEntries();renderDashboard();renderSettingsCats();
  if(state.timer&&state.timer.running){
    document.getElementById('start-controls').style.display='none';
    document.getElementById('running-controls').style.display='block';
    document.getElementById('timer-card').classList.add('timer-running');
    const c=getCat(state.timer.catId);
    if(c)document.getElementById('timer-cat-label').textContent=c.name+(state.timer.subCat?' · '+state.timer.subCat:'');
    startTick();showResumeModal('was-running');
  }
}
document.addEventListener('DOMContentLoaded',init);
