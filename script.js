// --- Registrazione Service Worker ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW registration failed:', err));
    });
}

// --- Stato Applicazione ---
let data = { plans: [], tests: [], logs: [] };
let activeSession = null;
let createMode = 'plan';
let currentUser = null;

// --- Inizializzazione ---
async function init() {
    const { data: { session } } = await window.supabase.auth.getSession();
    if (session) {
        currentUser = session.user;
        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('app-content').classList.remove('hidden');
        document.getElementById('bottom-nav').classList.remove('hidden');
        document.getElementById('bottom-nav').classList.add('flex');
        await loadAllData();
    } else {
        document.getElementById('auth-screen').classList.remove('hidden');
        document.getElementById('app-content').classList.add('hidden');
        document.getElementById('bottom-nav').classList.add('hidden');
        document.getElementById('bottom-nav').classList.remove('flex');
        console.log("Utente non loggato");
    }
}

async function loadAllData() {
    if (!currentUser) return;
    const [p, t, l] = await Promise.all([
        window.supabase.from('plans').select('*').eq('user_id', currentUser.id),
        window.supabase.from('tests').select('*').eq('user_id', currentUser.id),
        window.supabase.from('logs').select('*').eq('user_id', currentUser.id).order('id', { ascending: false })
    ]);

    data.plans = (p.data || []).map(item => ({ ...item, isArchived: item.is_archived }));
    data.tests = (t.data || []);
    data.logs = (l.data || []).map(item => ({
        ...item,
        parentId: item.parent_id,
        parentName: item.parent_name,
        dayIdx: item.day_idx,
        dayName: item.day_name,
        isSkipped: item.is_skipped,
        finalNote: item.final_note
    }));
    renderHome();
    renderHistory();
}

async function syncToSupabase(table, record) {
    if (!currentUser) return;
    let dbRecord = { ...record, user_id: currentUser.id };
    if (table === 'plans') { dbRecord.is_archived = record.isArchived; delete dbRecord.isArchived; }
    if (table === 'logs') {
        dbRecord.parent_id = record.parentId; dbRecord.parent_name = record.parentName;
        dbRecord.day_idx = record.dayIdx; dbRecord.day_name = record.dayName; 
        dbRecord.is_skipped = record.isSkipped; dbRecord.final_note = record.finalNote;
        delete dbRecord.parentId; delete dbRecord.parentName; delete dbRecord.dayIdx; delete dbRecord.dayName; delete dbRecord.isSkipped; delete dbRecord.finalNote;
    }
    const { error } = await window.supabase.from(table).upsert(dbRecord);
    if(error) console.error("Supabase Upsert Error:", error);
}

// --- Render UI e Utils ---
function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden', 'active'));
    document.getElementById(tabId).classList.remove('hidden');
    document.getElementById(tabId).classList.add('active');
    
    document.querySelectorAll('.nav-button').forEach(btn => {
        btn.classList.remove('text-emerald-500');
        btn.classList.add('text-slate-500');
    });
    
    const activeBtn = document.getElementById(`nav-btn-${tabId}`);
    if (activeBtn) {
        activeBtn.classList.remove('text-slate-500');
        activeBtn.classList.add('text-emerald-500');
    }

    if(tabId === 'home') renderHome();
    if(tabId === 'history') renderHistory();
}

async function handleAuth(type) {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    if(!email || !password) return alert('Inserisci email e password');
    
    let result;
    if(type === 'login') {
        result = await window.supabase.auth.signInWithPassword({ email, password });
    } else {
        result = await window.supabase.auth.signUp({ email, password });
    }
    
    if(result.error) alert(result.error.message);
    else {
        currentUser = result.data.user;
        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('app-content').classList.remove('hidden');
        document.getElementById('bottom-nav').classList.remove('hidden');
        document.getElementById('bottom-nav').classList.add('flex');
        await loadAllData();
    }
}

function renderHistory() {
    const container = document.getElementById('history-container');
    if (!container) return;

    const generateCard = (log) => {
        const exercises = log.exercises || [];
        const rpes = exercises.map(ex => parseFloat(ex.rpe)).filter(r => !isNaN(r));
        const avgRpe = rpes.length ? (rpes.reduce((a,b)=>a+b,0) / rpes.length).toFixed(1) : '-';

        return `
        <div class="bg-slate-800 rounded-[28px] border border-white/5 mb-4 overflow-hidden shadow-xl">
            <div onclick="this.nextElementSibling.classList.toggle('hidden'); this.querySelector('.chevron').classList.toggle('rotate-180')" class="p-5 flex justify-between items-center cursor-pointer hover:bg-slate-800/80 transition-colors">
                <div>
                    <span class="text-[9px] font-black uppercase tracking-widest text-emerald-500 mb-1 block">${log.date} • ${log.parentName || 'Sessione'}</span>
                    <h3 class="text-white font-bold text-lg leading-tight h-max">${log.dayName || 'Allenamento Libero'}</h3>
                </div>
                <div class="flex items-center gap-4">
                    ${log.isSkipped ? `
                        <span class="text-xs font-black uppercase text-red-500">Saltato</span>
                    ` : `
                        <div class="text-right">
                            <span class="text-[8px] font-black uppercase tracking-widest text-slate-500 block">Media RPE</span>
                            <span class="text-xl font-black text-emerald-500">${avgRpe}</span>
                        </div>
                    `}
                    <svg class="chevron text-slate-500 transition-transform duration-300" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                </div>
            </div>
            
            <div class="hidden border-t border-dashed border-white/5 bg-slate-800/30 p-5">
                ${!log.isSkipped ? `
                <div class="space-y-4">
                    ${exercises.map(ex => `
                        <div class="flex justify-between items-start border-b border-white/5 pb-3 last:border-0 last:pb-0">
                            <div>
                                <h5 class="text-sm font-bold text-white mb-1.5">${ex.name}</h5>
                                ${ex.comment ? `<p class="text-xs text-slate-400 italic">"${ex.comment}"</p>` : ''}
                            </div>
                            <span class="text-[9px] font-black uppercase bg-slate-900 border border-white/5 text-emerald-500 px-2 py-1 rounded shrink-0 ml-3">RPE ${ex.rpe || '-'}</span>
                        </div>
                    `).join('')}
                </div>
                ${log.finalNote ? `
                    <div class="mt-4 pt-4 border-t border-white/5">
                        <span class="text-[9px] font-black uppercase tracking-widest text-emerald-500 mb-1.5 block">Note Finali</span>
                        <p class="text-xs text-slate-300 italic">"${log.finalNote}"</p>
                    </div>
                ` : ''}
                ` : `
                <p class="text-[10px] text-slate-400 uppercase tracking-widest font-black">Questa sessione è stata ignorata.</p>
                `}
                <div class="mt-5 pt-4 border-t border-white/5 flex justify-end">
                    <button onclick="deleteLog(${log.id})" class="text-[9px] font-black uppercase tracking-widest text-red-500 bg-red-500/10 px-4 py-2.5 rounded-xl hover:bg-red-500/20 transition-colors">
                         Annulla Sessione
                    </button>
                </div>
            </div>
        </div>
        `;
    };

    const recentLogs = data.logs.slice(0, 5);
    const olderLogs = data.logs.slice(5);

    let html = recentLogs.map(generateCard).join('');

    if (olderLogs.length > 0) {
        html += `
            <div class="mt-8 pt-6 border-t border-dashed border-white/10">
                <button onclick="this.nextElementSibling.classList.toggle('hidden'); this.querySelector('.chevron-older').classList.toggle('rotate-180')" class="w-full flex justify-between items-center bg-slate-900/50 hover:bg-slate-800 p-5 rounded-[24px] shadow-lg transition-colors border border-white/5">
                    <span class="text-[9px] font-black uppercase tracking-widest text-slate-400">Precedenti (${olderLogs.length} allenamenti)</span>
                    <svg class="chevron-older text-slate-500 transition-transform duration-300" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                </button>
                <div class="hidden mt-4">
                    ${olderLogs.map(generateCard).join('')}
                </div>
            </div>
        `;
    }

    container.innerHTML = html;
}

// --- Rendering Home (Esattamente come v7.9) ---
function renderHome() {
    const planList = document.getElementById('plan-list');
    const testList = document.getElementById('test-list');
    const archiveList = document.getElementById('archive-list');
    const archiveSection = document.getElementById('archive-section');

    const activePlans = data.plans.filter(p => !p.isArchived);
    const archivedPlans = data.plans.filter(p => p.isArchived);

    planList.innerHTML = activePlans.map(p => renderCard(p, 'plan')).join('');
    testList.innerHTML = data.tests.map(t => renderCard(t, 'test')).join('');

    if (archivedPlans.length > 0) {
        archiveSection.classList.remove('hidden');
        archiveList.innerHTML = archivedPlans.map(p => renderCard(p, 'plan', true)).join('');
    } else {
        archiveSection.classList.add('hidden');
    }
}

function renderCard(obj, type, isArchived = false) {
    const next = getNextSessionInfo(obj, type);
    let dots = '';
    if(type === 'plan') {
        for(let w=1; w<=obj.weeks; w++) {
            const done = data.logs.filter(l => l.parentId === obj.id && l.week == w).length >= obj.days.length;
            dots += `<div class="dot ${done ? 'completed' : ''}"></div>`;
        }
    }

    const colorClass = type === 'plan' ? 'card-gradient-workout' : 'card-gradient-test';
    const action = isArchived ? `reusePlan(${obj.id})` : `startSession(${obj.id}, '${type}')`;

    return `
        <div class="${colorClass} p-6 rounded-[32px] relative mb-4 shadow-xl" onclick="${action}">
            <div class="flex justify-between items-center pr-10">
                <div>
                    <h3 class="font-extrabold text-white text-lg">${obj.name}</h3>
                    <p class="text-[9px] font-black text-slate-400 uppercase mt-2 italic">
                        ${isArchived ? 'Ripeti da Zero' : (next.isFinished ? 'Da concludere' : `Prossimo: ${next.dayName} • S${next.week}`)}
                    </p>
                </div>
                <div class="flex flex-wrap gap-1 justify-end max-w-[60px]">${dots}</div>
            </div>
            <button onclick="event.stopPropagation(); editObject(${obj.id}, '${type}')" class="absolute right-4 top-1/2 -translate-y-1/2 p-3 text-slate-500">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            </button>
        </div>
    `;
}

function getNextSessionInfo(obj, type) {
    const logs = data.logs.filter(l => l.parentId === obj.id);
    if(logs.length === 0) return { week: 1, dayIdx: 0, dayName: obj.days[0].name };
    const last = logs[0];
    let nW = last.week, nD = last.dayIdx + 1;
    if(nD >= obj.days.length) { nD = 0; nW++; }
    if(type === 'plan' && nW > obj.weeks) return { isFinished: true };
    return { week: nW, dayIdx: nD, dayName: obj.days[nD].name };
}

// --- Sessione Attiva ---
function startSession(id, type) {
    const obj = type === 'plan' ? data.plans.find(p => p.id === id) : data.tests.find(t => t.id === id);
    const next = getNextSessionInfo(obj, type);
    const dayIdx = next.isFinished ? 0 : next.dayIdx;
    const week = next.isFinished ? 1 : next.week;

    activeSession = { 
        parentId: obj.id, parentName: obj.name, type, week, dayIdx, 
        dayName: obj.days[dayIdx].name, 
        exercises: JSON.parse(JSON.stringify(obj.days[dayIdx].exercises)) 
    };

    // Applica progressione se è un piano e non siamo alla prima settimana
    if(type === 'plan' && week > 1) {
        activeSession.exercises.forEach(ex => {
            if(ex.progression) {
                const m = week - 1;
                ex.sets = parseInt(ex.sets) + (parseInt(ex.progression.sets || 0) * m);
                ex.reps = parseInt(ex.reps) + (parseInt(ex.progression.reps || 0) * m);
                ex.kg = parseFloat(ex.kg) + (parseFloat(ex.progression.kg || 0) * m);
                if(ex.progression.rest) {
                    ex.rest = parseInt(ex.rest) - (parseInt(ex.progression.rest || 0) * m);
                    if(ex.rest < 0) ex.rest = 0;
                }
            }
        });
    }

    document.getElementById('home-main-view').classList.add('hidden');
    document.getElementById('active-session-container').classList.remove('hidden');
    document.getElementById('header-back-btn').classList.remove('hidden');
    updateSessionUI();
}

function updateSessionUI() {
    const header = document.getElementById('session-header');
    header.innerHTML = `
        <div class="p-6 bg-slate-800 rounded-[35px] border border-white/5 flex justify-between items-center shadow-lg">
            <div>
                <p class="text-[9px] font-black uppercase text-emerald-500">${activeSession.parentName} • S${activeSession.week}</p>
                <h2 class="text-2xl font-black text-white uppercase mt-1">${activeSession.dayName}</h2>
            </div>
            <div class="flex flex-col items-center">
                <span class="text-[8px] font-black uppercase tracking-widest text-slate-500 mb-1">Set</span>
                <div class="w-12 h-12 rounded-full cursor-pointer select-none active:scale-90 transition-transform bg-gradient-to-br from-emerald-500 to-emerald-700 shadow-lg shadow-emerald-500/40 text-slate-900 font-black text-xl flex items-center justify-center shrink-0" onclick="this.innerText = parseInt(this.innerText) + 1">0</div>
                <button onclick="this.previousElementSibling.innerText = '0'" class="mt-2 text-[8px] font-black uppercase tracking-widest text-slate-500 hover:text-red-500 transition-colors">Reset</button>
            </div>
        </div>
    `;

    const container = document.getElementById('session-exercises');
    container.innerHTML = activeSession.exercises.map((ex, i) => `
        <div class="bg-slate-800 p-4 rounded-[24px] border border-white/5 session-ex-card" data-index="${i}">
            <div class="flex justify-between items-center mb-3">
                <div>
                    <h4 class="text-sm font-bold text-white leading-tight">${ex.name}</h4>
                    <p class="text-[10px] font-black uppercase text-emerald-500 mt-0.5">${ex.sets}×${ex.reps} @ ${ex.kg}kg · ${ex.rest}s</p>
                </div>
                <span class="text-emerald-500 font-extrabold text-xl rpe-val-display tabular-nums shrink-0 ml-3">5</span>
            </div>
            <input type="range" min="1" max="10" value="5" oninput="this.parentElement.querySelector('.rpe-val-display').innerText = this.value" class="w-full rpe-input mb-3 outline-none bg-slate-900 h-1 rounded-full appearance-none accent-emerald-500">
            <textarea rows="1" class="w-full bg-slate-900 rounded-xl p-3 text-xs text-white outline-none ex-comment border border-white/5 focus:border-emerald-500/30 transition-all placeholder:text-slate-600" placeholder="Note..."></textarea>
        </div>
    `).join('');
}

async function finishSession() {
    const log = {
        id: Date.now(), parentId: activeSession.parentId, parentName: activeSession.parentName,
        week: activeSession.week, dayIdx: activeSession.dayIdx, dayName: activeSession.dayName,
        date: new Date().toLocaleDateString('it-IT', {day:'2-digit', month:'short'}),
        isSkipped: false, finalNote: document.getElementById('session-final-note').value,
        exercises: []
    };

    document.querySelectorAll('.session-ex-card').forEach(card => {
        const idx = card.dataset.index;
        const baseEx = activeSession.exercises[idx];
        log.exercises.push({
            name: baseEx.name,
            sets: baseEx.sets,
            reps: baseEx.reps,
            kg: baseEx.kg,
            rest: baseEx.rest,
            comment: card.querySelector('.ex-comment').value,
            rpe: card.querySelector('.rpe-input').value
        });
    });

    await syncToSupabase('logs', log);
    await loadAllData();
    await checkAutoArchive(activeSession.type, activeSession.parentId);
    backToHome();
}

function backToHome() {
    document.getElementById('home-main-view').classList.remove('hidden');
    document.getElementById('active-session-container').classList.add('hidden');
    document.getElementById('header-back-btn').classList.add('hidden');
    renderHome();
}

async function skipSession() {
    if(!activeSession) return;
    const log = {
        id: Date.now(), parentId: activeSession.parentId, parentName: activeSession.parentName,
        week: activeSession.week, dayIdx: activeSession.dayIdx, dayName: activeSession.dayName,
        date: new Date().toLocaleDateString('it-IT', {day:'2-digit', month:'short'}),
        isSkipped: true, finalNote: 'Sessione saltata',
        exercises: []
    };
    await syncToSupabase('logs', log);
    await loadAllData();
    await checkAutoArchive(activeSession.type, activeSession.parentId);
    backToHome();
}

// --- Funzioni di Creazione (Ripristinate v7.9) ---
function setCreateMode(mode) {
    createMode = mode;
    const btnPlan = document.getElementById('btn-mode-plan');
    const btnTest = document.getElementById('btn-mode-test');
    const weeksContainer = document.getElementById('weeks-input-container');
    
    if (mode === 'plan') {
        btnPlan.className = "flex-1 py-3 rounded-[18px] text-[10px] font-black bg-emerald-500 text-slate-900 uppercase";
        btnTest.className = "flex-1 py-3 rounded-[18px] text-[10px] font-black text-slate-400 uppercase";
        weeksContainer.classList.remove('hidden');
        document.body.classList.remove('is-test-mode');
    } else {
        btnTest.className = "flex-1 py-3 rounded-[18px] text-[10px] font-black bg-emerald-500 text-slate-900 uppercase";
        btnPlan.className = "flex-1 py-3 rounded-[18px] text-[10px] font-black text-slate-400 uppercase";
        weeksContainer.classList.add('hidden');
        document.body.classList.add('is-test-mode');
    }
}

async function checkAutoArchive(type, parentId) {
    if (type !== 'plan') return;
    const plan = data.plans.find(p => p.id === parentId);
    if (plan && !plan.isArchived) {
        const next = getNextSessionInfo(plan, 'plan');
        if (next.isFinished) {
            plan.isArchived = true;
            await syncToSupabase('plans', plan);
            await loadAllData();
            alert(`🏆 Congratulazioni! Hai portato a termine il programma "${plan.name}". Lo troverai custodito nella lista dei "Programmi Conclusi".`);
        }
    }
}

async function reusePlan(id) {
    const p = data.plans.find(x => x.id === id);
    if(p) {
        if(confirm(`Vuoi ripetere da zero la scheda "${p.name}"? Verrà creata una copia nuova e inserita nei Programmi Attivi, in modo da darti un progressivo pulito senza perdere lo storico.`)) {
            const newPlan = JSON.parse(JSON.stringify(p));
            newPlan.id = Date.now();
            newPlan.isArchived = false;
            await syncToSupabase('plans', newPlan);
            await loadAllData();
        }
    }
}

function editObject(id, type) {
    const obj = type === 'plan' ? data.plans.find(p => p.id === id) : data.tests.find(t => t.id === id);
    if (!obj) return;
    
    switchTab('create');
    setCreateMode(type);
    
    document.getElementById('edit-id').value = obj.id;
    document.getElementById('create-name').value = obj.name;
    document.getElementById('btn-delete-object')?.classList.remove('hidden');
    if (type === 'plan') document.getElementById('create-weeks').value = obj.weeks;
    
    const container = document.getElementById('create-days-container');
    container.innerHTML = '';
    
    obj.days.forEach(day => {
        const dayId = Date.now() + Math.random();
        const html = `
            <div class="create-day-box p-6 bg-slate-800/40 rounded-[32px] border border-white/5 mb-8 relative group" id="day-${dayId}">
                <div class="flex justify-between items-center mb-6">
                    <input type="text" placeholder="Giorno / Sessione (es. Spinta)" value="${day.name}" class="day-name bg-transparent text-xl font-black text-white outline-none w-full placeholder:text-slate-600">
                    <button onclick="this.closest('.create-day-box').remove()" class="p-2 text-slate-600 hover:text-red-500 transition-colors ml-2">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                    </button>
                </div>
                <div class="create-ex-list space-y-4">
                    ${day.exercises.map(ex => `
                        <div class="create-ex-row py-5 border-b border-white/5 border-dashed relative group last:border-b-0">
                            <div class="absolute left-0 top-8 bottom-8 w-[2px] bg-emerald-500/30 rounded-full"></div>
                            <button onclick="this.closest('.create-ex-row').remove()" class="absolute top-5 right-0 text-slate-500 hover:text-red-500 transition-colors p-2 z-10">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                            </button>
                            <div class="mb-4 pr-10 pl-4">
                                <input type="text" placeholder="Nome Esercizio" value="${ex.name}" class="ex-name w-full bg-transparent text-base text-white font-bold outline-none placeholder:text-slate-600 focus:text-emerald-400 transition-all">
                            </div>
                            <div class="pl-4">
                                <div class="grid grid-cols-4 gap-2 mb-2">
                                    <div class="text-[9px] font-black text-slate-500 uppercase tracking-widest text-center">Serie</div>
                                    <div class="text-[9px] font-black text-slate-500 uppercase tracking-widest text-center">Reps</div>
                                    <div class="text-[9px] font-black text-slate-500 uppercase tracking-widest text-center">Kg</div>
                                    <div class="text-[9px] font-black text-slate-500 uppercase tracking-widest text-center">Rec(s)</div>
                                    
                                    <input type="number" value="${ex.sets}" class="ex-sets w-full bg-slate-900/40 p-2.5 rounded-[14px] text-center text-xs text-white font-bold outline-none focus:bg-slate-800 transition-all border border-transparent">
                                    <input type="text" value="${ex.reps}" class="ex-reps w-full bg-slate-900/40 p-2.5 rounded-[14px] text-center text-xs text-white font-bold outline-none focus:bg-slate-800 transition-all border border-transparent">
                                    <input type="number" value="${ex.kg}" class="ex-kg w-full bg-slate-900/40 p-2.5 rounded-[14px] text-center text-xs text-white font-bold outline-none focus:bg-slate-800 transition-all border border-transparent">
                                    <input type="number" value="${ex.rest}" class="ex-rest w-full bg-slate-900/40 p-2.5 rounded-[14px] text-center text-xs text-white font-bold outline-none focus:bg-slate-800 transition-all border border-transparent">
                                </div>
                                ${type === 'plan' ? `
                                <div class="mt-4 prog-container">
                                    <button onclick="this.nextElementSibling.classList.toggle('hidden'); this.classList.toggle('text-emerald-500')" class="text-[9px] font-black uppercase tracking-widest ${(ex.progression && (ex.progression.sets || ex.progression.reps || ex.progression.kg || ex.progression.rest)) ? 'text-emerald-500' : 'text-slate-500'} flex items-center gap-1 transition-colors">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
                                        Progressione
                                    </button>
                                    <div class="${(ex.progression && (ex.progression.sets || ex.progression.reps || ex.progression.kg || ex.progression.rest)) ? '' : 'hidden'} mt-3 pt-3 border-t border-dashed border-white/5">
                                        <div class="grid grid-cols-4 gap-2">
                                            <div class="relative">
                                                <span class="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-emerald-600 font-black">+</span>
                                                <input type="number" placeholder="Set" value="${ex.progression?.sets || ''}" class="prog-sets w-full bg-slate-900/20 p-2 pl-6 rounded-[10px] text-center text-[10px] text-emerald-400 font-bold outline-none border border-emerald-500/20 focus:bg-slate-900/50 placeholder:text-emerald-900/50">
                                            </div>
                                            <div class="relative">
                                                <span class="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-emerald-600 font-black">+</span>
                                                <input type="number" placeholder="Rep" value="${ex.progression?.reps || ''}" class="prog-reps w-full bg-slate-900/20 p-2 pl-6 rounded-[10px] text-center text-[10px] text-emerald-400 font-bold outline-none border border-emerald-500/20 focus:bg-slate-900/50 placeholder:text-emerald-900/50">
                                            </div>
                                            <div class="relative">
                                                <span class="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-emerald-600 font-black">+</span>
                                                <input type="number" placeholder="Kg" value="${ex.progression?.kg || ''}" class="prog-kg w-full bg-slate-900/20 p-2 pl-6 rounded-[10px] text-center text-[10px] text-emerald-400 font-bold outline-none border border-emerald-500/20 focus:bg-slate-900/50 placeholder:text-emerald-900/50">
                                            </div>
                                            <div class="relative">
                                                <span class="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-red-500 font-black">-</span>
                                                <input type="number" placeholder="Rec" value="${ex.progression?.rest || ''}" class="prog-rest w-full bg-slate-900/20 p-2 pl-5 rounded-[10px] text-center text-[10px] text-red-400 font-bold outline-none border border-red-500/20 focus:bg-slate-900/50 placeholder:text-red-900/50">
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                ` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
                <button onclick="addCreateExercise(this)" class="w-full py-4 mt-6 rounded-[20px] bg-slate-900 border border-dashed border-white/10 text-[9px] font-black text-emerald-500 uppercase tracking-widest hover:border-emerald-500/30 transition-all shadow-lg">+ Aggiungi Esercizio</button>
            </div>`;
        container.insertAdjacentHTML('beforeend', html);
    });
}

function addCreateDay() {
    const id = Date.now();
    const html = `
        <div class="create-day-box p-6 bg-slate-800/40 rounded-[32px] border border-white/5 mb-8 relative group" id="day-${id}">
            <div class="flex justify-between items-center mb-6">
                <input type="text" placeholder="Giorno / Sessione (es. Spinta)" class="day-name bg-transparent text-xl font-black text-white outline-none w-full placeholder:text-slate-600">
                <button onclick="this.closest('.create-day-box').remove()" class="p-2 text-slate-600 hover:text-red-500 transition-colors ml-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                </button>
            </div>
            <div class="create-ex-list space-y-4"></div>
            <button onclick="addCreateExercise(this)" class="w-full py-4 mt-6 rounded-[20px] bg-slate-900 border border-dashed border-white/10 text-[9px] font-black text-emerald-500 uppercase tracking-widest hover:border-emerald-500/30 transition-all shadow-lg">+ Aggiungi Esercizio</button>
        </div>`;
    document.getElementById('create-days-container').insertAdjacentHTML('beforeend', html);
}

function addCreateExercise(btn) {
    const list = btn.previousElementSibling;
    const html = `
        <div class="create-ex-row py-5 border-b border-white/5 border-dashed relative group last:border-b-0">
            <div class="absolute left-0 top-8 bottom-8 w-[2px] bg-emerald-500/30 rounded-full"></div>
            <button onclick="this.closest('.create-ex-row').remove()" class="absolute top-5 right-0 text-slate-500 hover:text-red-500 transition-colors p-2 z-10">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
            <div class="mb-4 pr-10 pl-4">
                <input type="text" placeholder="Nome Esercizio" class="ex-name w-full bg-transparent text-base text-white font-bold outline-none placeholder:text-slate-600 focus:text-emerald-400 transition-all">
            </div>
            <div class="pl-4">
                <div class="grid grid-cols-4 gap-2 mb-2">
                    <div class="text-[9px] font-black text-slate-500 uppercase tracking-widest text-center">Serie</div>
                    <div class="text-[9px] font-black text-slate-500 uppercase tracking-widest text-center">Reps</div>
                    <div class="text-[9px] font-black text-slate-500 uppercase tracking-widest text-center">Kg</div>
                    <div class="text-[9px] font-black text-slate-500 uppercase tracking-widest text-center">Rec(s)</div>
                    
                    <input type="number" class="ex-sets w-full bg-slate-900/40 p-2.5 rounded-[14px] text-center text-xs text-white font-bold outline-none focus:bg-slate-800 transition-all border border-transparent">
                    <input type="text" class="ex-reps w-full bg-slate-900/40 p-2.5 rounded-[14px] text-center text-xs text-white font-bold outline-none focus:bg-slate-800 transition-all border border-transparent">
                    <input type="number" class="ex-kg w-full bg-slate-900/40 p-2.5 rounded-[14px] text-center text-xs text-white font-bold outline-none focus:bg-slate-800 transition-all border border-transparent">
                    <input type="number" class="ex-rest w-full bg-slate-900/40 p-2.5 rounded-[14px] text-center text-xs text-white font-bold outline-none focus:bg-slate-800 transition-all border border-transparent">
                </div>
                ${createMode === 'plan' ? `
                <div class="mt-4 prog-container">
                    <button onclick="this.nextElementSibling.classList.toggle('hidden'); this.classList.toggle('text-emerald-500')" class="text-[9px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
                        Progressione
                    </button>
                    <div class="hidden mt-3 pt-3 border-t border-dashed border-white/5">
                        <div class="grid grid-cols-4 gap-2">
                            <div class="relative">
                                <span class="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-emerald-600 font-black">+</span>
                                <input type="number" placeholder="Set" class="prog-sets w-full bg-slate-900/20 p-2 pl-6 rounded-[10px] text-center text-[10px] text-emerald-400 font-bold outline-none border border-emerald-500/20 focus:bg-slate-900/50 placeholder:text-emerald-900/50">
                            </div>
                            <div class="relative">
                                <span class="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-emerald-600 font-black">+</span>
                                <input type="number" placeholder="Rep" class="prog-reps w-full bg-slate-900/20 p-2 pl-6 rounded-[10px] text-center text-[10px] text-emerald-400 font-bold outline-none border border-emerald-500/20 focus:bg-slate-900/50 placeholder:text-emerald-900/50">
                            </div>
                            <div class="relative">
                                <span class="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-emerald-600 font-black">+</span>
                                <input type="number" placeholder="Kg" class="prog-kg w-full bg-slate-900/20 p-2 pl-6 rounded-[10px] text-center text-[10px] text-emerald-400 font-bold outline-none border border-emerald-500/20 focus:bg-slate-900/50 placeholder:text-emerald-900/50">
                            </div>
                            <div class="relative">
                                <span class="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-red-500 font-black">-</span>
                                <input type="number" placeholder="Rec" class="prog-rest w-full bg-slate-900/20 p-2 pl-5 rounded-[10px] text-center text-[10px] text-red-400 font-bold outline-none border border-red-500/20 focus:bg-slate-900/50 placeholder:text-red-900/50">
                            </div>
                        </div>
                    </div>
                </div>
                ` : ''}
            </div>
        </div>`;
    list.insertAdjacentHTML('beforeend', html);
}

async function saveCreatedObject() {
    const name = document.getElementById('create-name').value;
    if(!name) return;
    const editId = document.getElementById('edit-id').value;
    const id = editId ? parseInt(editId) : Date.now();
    const obj = { id, name, weeks: parseInt(document.getElementById('create-weeks').value)||1, days: [], isArchived: false };
    
    document.querySelectorAll('.create-day-box').forEach(box => {
        const day = { name: box.querySelector('.day-name').value, exercises: [] };
        box.querySelectorAll('.create-ex-row').forEach(row => {
            day.exercises.push({
                name: row.querySelector('.ex-name').value,
                sets: row.querySelector('.ex-sets').value,
                reps: row.querySelector('.ex-reps').value,
                kg: row.querySelector('.ex-kg').value,
                rest: row.querySelector('.ex-rest').value,
                progression: {
                    sets: row.querySelector('.prog-sets')?.value || '',
                    reps: row.querySelector('.prog-reps')?.value || '',
                    kg: row.querySelector('.prog-kg')?.value || '',
                    rest: row.querySelector('.prog-rest')?.value || ''
                }
            });
        });
        obj.days.push(day);
    });

    await syncToSupabase(createMode === 'plan' ? 'plans' : 'tests', obj);
    document.getElementById('btn-delete-object')?.classList.add('hidden');
    location.reload();
}

async function deleteCurrentObject() {
    const editId = document.getElementById('edit-id').value;
    if(!editId) return;
    if(!confirm("⚠ Vuoi davvero eliminare definitivamente questa scheda? L'operazione non può essere annullata.")) return;
    
    const id = parseInt(editId);
    const table = createMode === 'plan' ? 'plans' : 'tests';
    
    await window.supabase.from(table).delete().eq('id', id);
    
    // Per sicurezza, puliamo cache ed eventuale storico? Di solito se eliminiamo il record padre è ok
    alert("Scheda eliminata con successo.");
    location.reload();
}

async function deleteLog(id) {
    if(!confirm("⚠ Vuoi annullare questa sessione? Annullandola, tutti i progressi e le informazioni di quel giorno torneranno allo stato precedente.")) return;
    
    const { error } = await window.supabase.from('logs').delete().eq('id', id);
    if (!error) {
        data.logs = data.logs.filter(l => l.id !== id);
        renderHistory();
        renderHome();
        alert("Sessione annullata e progressione regredita correttamente.");
    } else {
        alert("Si è verificato un errore durante l'annullamento.");
    }
}

// Avvio
init();