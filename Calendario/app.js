/* app.js - Calendario PWA (local storage) */

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('service-worker.js').catch(e => console.log('SW err', e));
}

const LS_KEY = 'calendario_v1';

function uid(){ return Math.random().toString(36).slice(2,10); }
function startOfDayISO(d){ const x=new Date(d); x.setHours(0,0,0,0); return x.toISOString(); }
function sameDay(a,b){ return new Date(a).toDateString() === new Date(b).toDateString(); }
function fmt(d){ return new Date(d).toLocaleString(); }

const defaultState = {
  users: [],
  classes: [],
  groups: [],
  currentUserId: null
};

function loadState(){ try{ const s=localStorage.getItem(LS_KEY); if(!s){ localStorage.setItem(LS_KEY, JSON.stringify(defaultState)); return JSON.parse(JSON.stringify(defaultState)); } return JSON.parse(s);}catch(e){ console.error(e); return JSON.parse(JSON.stringify(defaultState)); } }
function saveState(){ localStorage.setItem(LS_KEY, JSON.stringify(state)); }

let state = loadState();
// seed demo
if(state.users.length===0){
  const profId = uid();
  state.users.push({id:profId, username:'profe', password:'1234', role:'profesor', displayName:'Profesor Demo', joinedClassIDs:[], groupIDs:[], personalNonSchoolDays:[]});
  state.classes.push({id:uid(), title:'Matemáticas 1º', teacherID:profId, code:'MATE123', members:[], scheduleEntries:[{id:uid(), weekday:1, startHour:9, startMinute:0, duration:60, title:'Matemáticas'}], exams:[], nonSchoolDays:[], absences:[]});
  saveState();
}

// DOM helpers
const $ = id => document.getElementById(id);
const show = id => $(id).classList.remove('hidden');
const hide = id => $(id).classList.add('hidden');

// Auth UI
$('signup-btn').addEventListener('click', ()=>{
  const display = $('display').value.trim();
  const username = $('username').value.trim();
  const password = $('password').value;
  const role = $('role').value;
  if(!username || !password){ $('auth-msg').textContent='Usuario y contraseña obligatorios'; return; }
  if(state.users.some(u=>u.username===username)){ $('auth-msg').textContent='Usuario ya existe'; return; }
  const u = {id:uid(), username, password, role, displayName: display||username, joinedClassIDs:[], groupIDs:[], personalNonSchoolDays:[]};
  state.users.push(u); state.currentUserId = u.id; saveState(); initApp();
});

$('login-btn').addEventListener('click', ()=>{
  const username = $('username').value.trim();
  const password = $('password').value;
  const found = state.users.find(u=>u.username===username && u.password===password);
  if(!found){ $('auth-msg').textContent='Usuario o contraseña incorrectos'; return; }
  state.currentUserId = found.id; saveState(); initApp();
});

function logout(){ state.currentUserId = null; saveState(); location.reload(); }

// Tabs
document.querySelectorAll('.tabs button').forEach(b=>b.addEventListener('click', ()=>{
  document.querySelectorAll('.tabs button').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  const tab = b.dataset.tab;
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  document.getElementById('tab-'+tab).classList.add('active');
  if(tab==='calendar') renderCalendar();
  if(tab==='classes') renderClasses();
  if(tab==='exams') renderExams();
  if(tab==='groups') renderGroups();
  if(tab==='settings') renderSettings();
}));

// Academic months Sep 2025 - Aug 2026
function academicMonths(){
  const arr=[]; const start=new Date(2025,8,1);
  for(let i=0;i<12;i++){ arr.push(new Date(start.getFullYear(), start.getMonth()+i, 1)); }
  return arr;
}
let currentMonthIndex = 0;

function initApp(){
  hide('auth-screen'); show('main-screen');
  populateClassSelectors();
  renderCalendar();
  renderClasses();
  renderExams();
  renderGroups();
  renderSettings();
}

// Populate selectors with classes
function populateClassSelectors(){
  const sel = $('select-class'); sel.innerHTML = '<option value="">-- seleccionar --</option>';
  const ex = $('exam-class'); ex.innerHTML = '<option value="">Personal (sin clase)</option>';
  const gsel = $('group-class'); gsel.innerHTML = '<option value="">Selecciona clase (opcional)</option>';
  state.classes.forEach(c=>{
    const o = document.createElement('option'); o.value=c.id; o.textContent=c.title; sel.appendChild(o);
    const o2 = o.cloneNode(true); ex.appendChild(o2);
    const o3 = o.cloneNode(true); gsel.appendChild(o3);
  });
}

// Calendar render
function renderCalendar(){
  const cal = $('calendar'); cal.innerHTML='';
  const months = academicMonths(); const monthDate = months[currentMonthIndex];
  $('month-title').textContent = monthDate.toLocaleString('es-ES',{month:'long', year:'numeric'});
  const firstWeekday = new Date(monthDate.getFullYear(), monthDate.getMonth(),1).getDay();
  const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth()+1,0).getDate();
  for(let i=0;i<firstWeekday;i++){ const e=document.createElement('div'); e.className='day'; cal.appendChild(e); }
  const selectedClassId = $('select-class').value || null;
  for(let d=1; d<=daysInMonth; d++){
    const dateObj = new Date(monthDate.getFullYear(), monthDate.getMonth(), d);
    const day = document.createElement('div'); day.className='day';
    const dateSpan = document.createElement('div'); dateSpan.className='date'; dateSpan.textContent = d; day.appendChild(dateSpan);
    let isNon = false;
    if(selectedClassId){
      const c = state.classes.find(x=>x.id===selectedClassId);
      if(c && c.nonSchoolDays && c.nonSchoolDays.some(nd=>sameDay(nd, dateObj))) isNon = true;
      if(c && c.exams && c.exams.some(ex=>sameDay(ex.date, dateObj))){
        const dot=document.createElement('span'); dot.className='dot exam'; day.appendChild(dot);
      }
      if(c && c.scheduleEntries && c.scheduleEntries.some(se=>se.weekday===dateObj.getDay())){
        const dot=document.createElement('span'); dot.className='dot class'; day.appendChild(dot);
      }
    }
    const user = state.users.find(u=>u.id===state.currentUserId);
    if(user && user.personalNonSchoolDays && user.personalNonSchoolDays.some(nd=>sameDay(nd, dateObj))) isNon = true;
    if(isNon){ const p=document.createElement('div'); p.className='small'; p.textContent='No lectivo'; day.appendChild(p); }
    day.addEventListener('click', ()=> openDateDetail(dateObj, selectedClassId));
    cal.appendChild(day);
  }
}

// month nav
$('prev-month').addEventListener('click', ()=>{ currentMonthIndex = Math.max(0, currentMonthIndex-1); renderCalendar(); });
$('next-month').addEventListener('click', ()=>{ currentMonthIndex = Math.min(11, currentMonthIndex+1); renderCalendar(); });

// Date detail
function openDateDetail(dateObj, classId){
  const user = state.users.find(u=>u.id===state.currentUserId);
  if(!user) return;
  if(classId){
    const c = state.classes.find(x=>x.id===classId);
    const isNon = c.nonSchoolDays && c.nonSchoolDays.some(nd=>sameDay(nd,dateObj));
    if(user.role==='profesor' && user.id===c.teacherID){
      if(confirm(`Clase: ${c.title}\nFecha: ${dateObj.toDateString()}\n¿Alternar No lectivo para la clase?`)){ toggleClassNonSchoolDay(c.id, dateObj); renderCalendar(); return; }
    }
    const exams = c.exams.filter(ex=>sameDay(ex.date,dateObj));
    if(exams.length>0){ alert('Exámenes:\\n' + exams.map(e=>`${e.title} — ${fmt(e.date)}`).join('\\n')); return; }
    if(confirm('Crear examen de clase en esta fecha?')){ const title = prompt('Título del examen')||'Examen'; const remind = Number(prompt('Recordar X días antes','1')||1); createExam({title, date:new Date(dateObj.getFullYear(),dateObj.getMonth(),dateObj.getDate(),9,0).toISOString(), createdBy:user.id, classID:c.id, remindBeforeDays:remind}); renderCalendar(); return; }
  } else {
    // personal toggle
    const personal = user.personalNonSchoolDays && user.personalNonSchoolDays.some(nd=>sameDay(nd,dateObj));
    if(confirm(`${dateObj.toDateString()}\\n¿Alternar No lectivo personal?`)){ toggleUserPersonalNonSchool(user.id, dateObj); renderCalendar(); return; }
  }
}

// Classes
$('create-class-btn').addEventListener('click', ()=>{
  const title = $('class-title').value.trim(); const code = $('class-code').value.trim() || uid().slice(0,6);
  const user = state.users.find(u=>u.id===state.currentUserId);
  if(!user || user.role!=='profesor'){ alert('Solo profesores pueden crear clases'); return; }
  const c = { id: uid(), title, teacherID: user.id, code, members:[], scheduleEntries:[], exams:[], nonSchoolDays:[], absences:[] };
  state.classes.push(c); saveState(); populateClassSelectors(); renderClasses(); renderCalendar();
});
$('join-class-btn').addEventListener('click', ()=>{
  const code = $('join-code').value.trim(); const user = state.users.find(u=>u.id===state.currentUserId);
  if(!user){ alert('Inicia sesión'); return; }
  const c = state.classes.find(x=>x.code.toLowerCase()===code.toLowerCase()); if(!c){ alert('Código no encontrado'); return; }
  if(!c.members.includes(user.id)) c.members.push(user.id); if(!user.joinedClassIDs.includes(c.id)) user.joinedClassIDs.push(c.id); saveState(); renderClasses(); populateClassSelectors(); renderCalendar();
});

function renderClasses(){
  const div = $('class-list'); div.innerHTML='';
  state.classes.forEach(c=>{
    const node = document.createElement('div'); node.className='card';
    node.innerHTML = `<strong>${c.title}</strong><div class='small'>Código: ${c.code}</div>`;
    const user = state.users.find(u=>u.id===state.currentUserId);
    if(user && user.role==='profesor' && user.id===c.teacherID){
      const b = document.createElement('button'); b.textContent='Marcar hoy como no lectivo (toggle)'; b.addEventListener('click', ()=>{ toggleClassNonSchoolDay(c.id, new Date()); renderClasses(); renderCalendar(); });
      node.appendChild(b);
    }
    div.appendChild(node);
  });
}

// Exams
$('create-exam-btn').addEventListener('click', ()=>{
  const title = $('exam-title').value.trim(); const datev = $('exam-date').value;
  const classId = $('exam-class').value || null; const remind = Number($('exam-remind').value||0);
  const user = state.users.find(u=>u.id===state.currentUserId);
  if(!user){ alert('Inicia sesión'); return; }
  if(!title || !datev){ alert('Título y fecha obligatorios'); return; }
  createExam({title, date:new Date(datev).toISOString(), createdBy:user.id, classID:classId, remindBeforeDays:remind});
  $('exam-title').value=''; $('exam-date').value=''; renderExams(); renderCalendar();
});

function createExam({title,date,createdBy,classID,remindBeforeDays}){
  const ex = { id: uid(), title, date, createdBy, remindBeforeDays:remindBeforeDays||0, classID };
  if(classID){
    const c = state.classes.find(x=>x.id===classID); if(c) c.exams.push(ex);
  } else {
    const u = state.users.find(x=>x.id===createdBy); if(u){ u.personalExams = u.personalExams||[]; u.personalExams.push(ex); }
  }
  saveState(); scheduleNotificationForExam(ex);
}

function renderExams(){
  const div = $('exams-list'); div.innerHTML='';
  const user = state.users.find(u=>u.id===state.currentUserId);
  if(!user){ div.textContent='Inicia sesión'; return; }
  const myClasses = state.classes.filter(c=> c.teacherID===user.id || c.members.includes(user.id));
  myClasses.forEach(c=> c.exams.forEach(e=>{ const item=document.createElement('div'); item.className='card'; item.innerHTML=`<strong>${e.title}</strong><div class='small'>Clase: ${c.title} — ${fmt(e.date)}</div>`; div.appendChild(item); }));
  if(user.personalExams) user.personalExams.forEach(e=>{ const item=document.createElement('div'); item.className='card'; item.innerHTML=`<strong>${e.title}</strong><div class='small'>Personal — ${fmt(e.date)}</div>`; div.appendChild(item); });
}

// Groups
$('create-group-btn').addEventListener('click', ()=>{
  const title = $('group-title').value.trim(); const classId = $('group-class').value || null;
  if(!title){ alert('Nombre del grupo obligatorio'); return; }
  const g = {id:uid(), title, memberIDs:[], classID:classId, sharedTime:null}; state.groups.push(g); saveState(); renderGroups();
});
function renderGroups(){ const div=$('groups-list'); div.innerHTML=''; state.groups.forEach(g=>{ const n=document.createElement('div'); n.className='card'; n.innerHTML=`<strong>${g.title}</strong><div class='small'>Clase: ${state.classes.find(c=>c.id===g.classID)?.title||'N/A'}</div>`; div.appendChild(n); }); }

// Non-school days toggles
function toggleUserPersonalNonSchool(userId, dateObj){
  const u = state.users.find(x=>x.id===userId); if(!u) return;
  u.personalNonSchoolDays = u.personalNonSchoolDays || []; const iso = startOfDayISO(dateObj);
  const i = u.personalNonSchoolDays.findIndex(d=>d===iso); if(i>=0) u.personalNonSchoolDays.splice(i,1); else u.personalNonSchoolDays.push(iso); saveState();
}
function toggleClassNonSchoolDay(classId, dateObj){
  const c = state.classes.find(x=>x.id===classId); if(!c) return; c.nonSchoolDays = c.nonSchoolDays || []; const iso = startOfDayISO(dateObj); const i = c.nonSchoolDays.findIndex(d=>d===iso); if(i>=0) c.nonSchoolDays.splice(i,1); else c.nonSchoolDays.push(iso); saveState();
}

// Notifications (basic)
$('request-notif').addEventListener('click', async ()=>{ if(!('Notification' in window)){ alert('Notificaciones no soportadas'); return; } const p = await Notification.requestPermission(); alert('Permiso: '+p); });

function scheduleNotificationForExam(ex){
  if(Notification.permission !== 'granted') return;
  const remind = Number(ex.remindBeforeDays||0); const examDate = new Date(ex.date); const notifyDate = new Date(examDate.getTime() - remind*24*60*60*1000); const delay = notifyDate.getTime() - Date.now();
  if(delay<=0){ showNotification(`Examen: ${ex.title}`, { body: `Examen: ${fmt(ex.date)}` }); return; }
  setTimeout(()=> showNotification(`Recordatorio: ${ex.title}`, { body: `Examen el ${fmt(ex.date)}` }), delay);
}

function showNotification(title, options){
  if('serviceWorker' in navigator && navigator.serviceWorker.controller){
    navigator.serviceWorker.controller.postMessage({ type:'SHOW_NOTIFICATION', payload:{ title, options } });
  } else if(Notification.permission === 'granted'){
    new Notification(title, options);
  }
}

// Settings rendering
$('logout-btn').addEventListener('click', ()=>{ state.currentUserId=null; saveState(); showAuth(); });
function renderSettings(){
  const box = $('account-info'); box.innerHTML=''; const u = state.users.find(x=>x.id===state.currentUserId); if(!u){ box.textContent='Nadie conectado'; return; } box.innerHTML = `<div><strong>${u.displayName}</strong><div class='small'>Usuario: ${u.username} — Rol: ${u.role}</div></div>`;
}

// show auth screen
function showAuth(){ show('auth-screen'); hide('main-screen'); }

// initial display depending on logged user
if(state.currentUserId){ initApp(); } else { showAuth(); }

// expose for console/testing
window.__STATE = state;
