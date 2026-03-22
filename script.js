// --- Stato Applicazione ---
let data = { plans: [], tests: [], logs: [] };
let activeSession = null;
let createMode = 'plan';
let secondsRemaining = 0;
let currentUser = null;

// --- Gestione Autenticazione ---
async function handleAuth(type) {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    if (!email || !password) return alert("Compila tutti i campi");

    const { data: authData, error } = (type === 'signup') 
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password });

    if (error) {
        alert("Errore: " + error.message);
    } else {
        // Se la registrazione ha successo ma l'email va confermata, avvisa l'utente
        if (type === 'signup' && !authData.session) {
            alert("Registrazione completata! Controlla la tua email per confermare l'account.");
        }
        checkUser();
    }
}

async function checkUser() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        currentUser = session.user;
        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('app-content').classList.remove('hidden');
        document.getElementById('bottom-nav').classList.remove('hidden');
        await loadAllData();
    } else {
        document.getElementById('auth-screen').classList.remove('hidden');
        document.getElementById('app-content').classList.add('hidden');
        document.getElementById('bottom-nav').classList.add('hidden');
    }
}

async function loadAllData() {
    if (!currentUser) return;
    
    // Carichiamo i piani (usando i nomi colonne del tuo SQL)
    const { data: plans } = await supabase.from('plans').select('*').eq('user_id', currentUser.id);
    const { data: logs } = await supabase.from('logs').select('*').eq('user_id', currentUser.id).order('id', { ascending: false });

    // Adattiamo i dati dal database (is_archived) alla logica JS (isArchived)
    data.plans = (plans || []).map(p => ({
        ...p,
        isArchived: p.is_archived // Convertiamo per il JS
    }));
    
    data.logs = (logs || []).map(l => ({
        ...l,
        parentId: l.parent_id, // Convertiamo per il JS
        dayIdx: l.day_idx,
        dayName: l.day_name,
        isSkipped: l.is_skipped,
        finalNote: l.final_note
    }));

    renderHome();
}

async function syncToSupabase(table, record) {
    record.user_id = currentUser.id;
    
    // Prepariamo l'oggetto per il database convertendo i nomi in snake_case
    let dbRecord = { ...record };
    
    if (table === 'plans') {
        dbRecord.is_archived = record.isArchived;
        delete dbRecord.isArchived;
    } else if (table === 'logs') {
        dbRecord.parent_id = record.parentId;
        dbRecord.day_idx = record.dayIdx;
        dbRecord.day_name = record.dayName;
        dbRecord.is_skipped = record.isSkipped;
        dbRecord.final_note = record.finalNote;
        // Rimuoviamo le versioni camelCase per non sporcare la query
        delete dbRecord.parentId; delete dbRecord.dayIdx; delete dbRecord.dayName;
        delete dbRecord.isSkipped; delete dbRecord.finalNote;
    }

    const { error } = await supabase.from(table).upsert(dbRecord);
    if (error) console.error("Errore salvataggio:", error);
}

// --- Navigation ---
function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
    document.getElementById(tabId).classList.remove('hidden');
    
    const btns = document.querySelectorAll('.nav-button');
    btns.forEach(b => b.classList.remove('active', 'text-emerald-500'));
    
    if(tabId === 'home') btns[0].classList.add('active', 'text-emerald-500');
    if(tabId === 'create') btns[1].classList.add('active', 'text-emerald-500');
    if(tabId === 'history') btns[2].classList.add('active', 'text-emerald-500');

    if(tabId !== 'create') {
        document.getElementById('edit-id').value = '';
        document.getElementById('save-btn').innerText = 'Salva Programma';
        document.getElementById('create-days-container').innerHTML = '';
        document.getElementById('create-name').value = '';
    }

    if(tabId === 'home') renderHome();
    if(tabId === 'history') renderHistory();
    backToHome();
    window.scrollTo(0, 0);
}

// --- Rendering Home ---
function renderHome() {
    const planGrid = document.getElementById('plan-list');
    const archiveGrid = document.getElementById('archive-list');
    const archiveSection = document.getElementById('archive-section');

    const activePlans = data.plans.filter(p => !p.isArchived);
    const archivedPlans = data.plans.filter(p => p.isArchived);

    planGrid.innerHTML = activePlans.map(p => renderCard(p, 'plan')).join('') || '<p class="text-xs text-slate-600 italic p-4 text-center">Nessun piano attivo.</p>';

    if (archivedPlans.length > 0) {
        archiveSection.classList.remove('hidden');
        archiveGrid.innerHTML = archivedPlans.map(p => renderCard(p, 'plan', true)).join('');
    } else {
        archiveSection.classList.add('hidden');
    }
}

function renderCard(obj, type, isArchived = false) {
    const next = getNextSessionInfo(obj, type);
    let dots = '';
    
    if(type === 'plan') {
        for(let w=1; w<=obj.weeks; w++) {
            const completedInWeek = data.logs.filter(l => l.parentId === obj.id && l.week == w && !l.isSkipped).length;
            const done = completedInWeek >= obj.days.length;
            dots += `<div class="dot ${done ? 'completed' : ''}"></div>`;
        }
    }

    const colorClass = 'card-gradient-workout';
    let statusLabel = next.isFinished ? 'Programma Completato' : `Prossimo: ${next.dayName} • Sett. ${next.week}`;
    if (isArchived) statusLabel = "Archiviato - Ripristina";

    const clickAction = isArchived ? `restoreObject(${obj.id})` : `startSession(${obj.id}, '${type}')`;

    return `
        <div class="${colorClass} p-6 rounded-[32px] shadow-xl border border-white/5 active:scale-[0.98] transition-all cursor-pointer relative">
            <div onclick="${clickAction}" class="flex justify-between items-center pr-12">
                <div class="flex-1">
                    <h3 class="font-extrabold text-white text-lg tracking-tight">${obj.name}</h3>
                    <p class="text-[9px] font-black ${next.isFinished ? 'text-emerald-500' : 'text-slate-400'} uppercase mt-2 tracking-widest">${statusLabel}</p>
                </div>
                <div class="flex flex-wrap gap-1.5 justify-end max-w-[60px]">
                    ${dots}
                </div>
            </div>
            <button onclick="editObject(${obj.id}, '${type}')" class="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-slate-900/50 rounded-2xl text-slate-400 hover:text-emerald-500 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            </button>
        </div>
    `;
}

function getNextSessionInfo(obj, type) {
    const logs = data.logs.filter(l => l.parentId === obj.id);
    if(logs.length === 0) return { week: 1, dayIdx: 0, dayName: obj.days[0]?.name || "Day 1" };
    const lastLog = logs[0];
    let nextWeek = lastLog.week;
    let nextDayIdx = lastLog.dayIdx + 1;
    if(nextDayIdx >= obj.days.length) { nextDayIdx = 0; nextWeek++; }
    if(nextWeek > obj.weeks) return { isFinished: true };
    return { week: nextWeek, dayIdx: nextDayIdx, dayName: obj.days[nextDayIdx]?.name || "Day" };
}

// --- Session Logic ---
function startSession(id, type) {
    const obj = data.plans.find(p => p.id === id);
    const next = getNextSessionInfo(obj, type);
    const dayIdx = next.isFinished ? 0 : next.dayIdx;
    const week = next.isFinished ? 1 : next.week;
    let exercisesCopy = JSON.parse(JSON.stringify(obj.days[dayIdx].exercises));

    if (week > 1) {
        exercisesCopy = exercisesCopy.map(ex => {
            const m = week - 1;
            const p = ex.progression;
            if (p) {
                return {
                    ...ex,
                    sets: parseInt(ex.sets || 0) + (parseInt(p.sets || 0) * m),
                    reps: (parseInt(ex.reps) || 0) + (parseInt(p.reps || 0) * m),
                    kg: parseFloat(ex.kg || 0) + (parseFloat(p.kg || 0) * m),
                    rest: Math.max(0, parseInt(ex.rest || 0) - (parseInt(p.rest || 0) * m))
                };
            }
            return ex;
        });
    }
    activeSession = { parentId: obj.id, parentName: obj.name, type, week, dayIdx, dayName: obj.days[dayIdx].name, exercises: exercisesCopy };
    document.getElementById('home-main-view').classList.add('hidden');
    document.getElementById('active-session-container').classList.remove('hidden');
    document.getElementById('header-back-btn').classList.remove('hidden');
    updateSessionUI();
}

function updateSessionUI() {
    const header = document.getElementById('session-header');
    header.innerHTML = `
        <div class="p-6 bg-slate-800 rounded-[35px] border border-white/5 shadow-xl flex justify-between items-center">
            <div>
                <p class="text-[9px] font-black uppercase text-emerald-500 mb-1">${activeSession.parentName} • Sett. ${activeSession.week}</p>
                <h2 class="text-2xl font-black text-white uppercase tracking-tighter">${activeSession.dayName}</h2>
            </div>
            <div class="flex items-center gap-4">
                <button onclick="secondsRemaining=0;updateTimerDisplay()" class="reset-btn">Reset</button>
                <div id="session-timer-val" onclick="secondsRemaining++;updateTimerDisplay()" class="counter-circle">${secondsRemaining}</div>
            </div>
        </div>
    `;
    const container = document.getElementById('session-exercises');
    container.innerHTML = activeSession.exercises.map((ex, i) => `
        <div class="bg-slate-800 p-7 rounded-[32px] border border-white/5 shadow-lg session-ex-card" data-index="${i}">
            <div class="flex justify-between items-start mb-6">
                <div>
                    <h4 class="text-lg font-bold text-white mb-1">${ex.name}</h4>
                    <p class="text-[10px] font-black uppercase text-emerald-500 tracking-widest">${ex.sets}x${ex.reps} @ ${ex.kg}kg <span class="text-slate-500 mx-1">/</span> Rec: ${ex.rest}s</p>
                </div>
            </div>
            <div class="space-y-4">
                <label class="text-[9px] font-black text-slate-500 uppercase tracking-widest block text-center">Intensità (RPE)</label>
                <input type="range" min="1" max="10" value="7" oninput="this.nextElementSibling.innerText = this.value" class="w-full">
                <div class="text-center text-xl font-black text-emerald-500">7</div>
                <textarea class="w-full bg-slate-900 rounded-[24px] p-4 text-xs text-white outline-none ex-comment" placeholder="Note..."></textarea>
            </div>
        </div>
    `).join('');
}

function updateTimerDisplay() { document.getElementById('session-timer-val').innerText = secondsRemaining; }

async function finishSession() {
    const log = {
        id: Date.now(), 
        parentId: activeSession.parentId, 
        parentName: activeSession.parentName,
        week: activeSession.week, 
        dayIdx: activeSession.dayIdx, 
        dayName: activeSession.dayName,
        date: new Date().toLocaleDateString('it-IT', { day: '2-digit', month: 'short' }),
        isSkipped: false, 
        finalNote: document.getElementById('session-final-note').value, 
        exercises: []
    };
    document.querySelectorAll('.session-ex-card').forEach(card => {
        const idx = card.dataset.index;
        const baseEx = activeSession.exercises[idx];
        log.exercises.push({
            name: baseEx.name, sets: baseEx.sets, reps: baseEx.reps, kg: baseEx.kg,
            rating: card.querySelector('input[type=range]').value,
            comment: card.querySelector('.ex-comment').value
        });
    });
    await syncToSupabase('logs', log);
    await loadAllData();
    backToHome();
}

async function skipSession() {
    const log = { id: Date.now(), parentId: activeSession.parentId, parentName: activeSession.parentName, week: activeSession.week, dayIdx: activeSession.dayIdx, dayName: activeSession.dayName, date: new Date().toLocaleDateString('it-IT', { day: '2-digit', month: 'short' }), isSkipped: true, exercises: [] };
    await syncToSupabase('logs', log);
    await loadAllData();
    backToHome();
}

function backToHome() {
    document.getElementById('home-main-view').classList.remove('hidden');
    document.getElementById('active-session-container').classList.add('hidden');
    document.getElementById('header-back-btn').classList.add('hidden');
    renderHome();
}

// --- Creazione Logic ---
function addCreateDay() {
    const dayId = Date.now();
    const html = `
        <div class="create-day-box pt-10 border-t border-slate-700/50 mt-10 first:mt-0 first:pt-0" id="day-${dayId}">
            <div class="flex items-center justify-between mb-6">
                <input type="text" placeholder="Nome Sessione" class="day-name bg-transparent text-2xl font-black text-white outline-none w-full">
                <button onclick="document.getElementById('day-${dayId}').remove()" class="p-3 text-red-500">✕</button>
            </div>
            <div class="create-ex-list space-y-4"></div>
            <button onclick="addCreateExercise(this)" class="w-full py-4 mt-4 rounded-2xl bg-slate-900 border border-white/5 text-[10px] font-black text-slate-500 uppercase">+ Esercizio</button>
        </div>
    `;
    document.getElementById('create-days-container').insertAdjacentHTML('beforeend', html);
}

function addCreateExercise(btn) {
    const list = btn.previousElementSibling;
    const html = `
        <div class="create-ex-row p-4 bg-slate-900/50 rounded-3xl border border-white/5 space-y-4">
            <input type="text" placeholder="Esercizio" class="ex-name w-full bg-slate-800 p-3 rounded-xl text-sm outline-none">
            <div class="grid grid-cols-4 gap-2">
                <input type="number" placeholder="Set" class="ex-sets bg-slate-800 p-2 rounded-xl text-center text-xs">
                <input type="text" placeholder="Rep" class="ex-reps bg-slate-800 p-2 rounded-xl text-center text-xs">
                <input type="number" placeholder="Kg" class="ex-kg bg-slate-800 p-2 rounded-xl text-center text-xs">
                <input type="number" placeholder="Rec" class="ex-rest bg-slate-800 p-2 rounded-xl text-center text-xs">
            </div>
            <div class="prog-inputs hidden grid grid-cols-4 gap-2 border-t border-white/5 pt-2">
                <input type="number" placeholder="+S" class="prog-sets bg-emerald-500/10 p-2 rounded-xl text-center text-[10px]">
                <input type="number" placeholder="+R" class="prog-reps bg-emerald-500/10 p-2 rounded-xl text-center text-[10px]">
                <input type="number" placeholder="+K" class="prog-kg bg-emerald-500/10 p-2 rounded-xl text-center text-[10px]">
                <input type="number" placeholder="-R" class="prog-rest bg-emerald-500/10 p-2 rounded-xl text-center text-[10px]">
            </div>
            <button onclick="this.previousElementSibling.classList.toggle('hidden')" class="text-[8px] font-black text-emerald-500 uppercase w-full">± Progressione</button>
        </div>
    `;
    list.insertAdjacentHTML('beforeend', html);
}

async function saveCreatedObject() {
    const name = document.getElementById('create-name').value;
    const editId = document.getElementById('edit-id').value;
    if(!name) return alert("Inserisci un nome");

    const obj = { 
        id: editId ? parseInt(editId) : Date.now(), 
        name, 
        isArchived: false, 
        weeks: parseInt(document.getElementById('create-weeks').value) || 1, 
        days: [] 
    };

    document.querySelectorAll('.create-day-box').forEach(box => {
        const day = { name: box.querySelector('.day-name').value || "Sessione", exercises: [] };
        box.querySelectorAll('.create-ex-row').forEach(row => {
            day.exercises.push({
                name: row.querySelector('.ex-name').value || "Ex",
                sets: row.querySelector('.ex-sets').value || "0", 
                reps: row.querySelector('.ex-reps').value || "0",
                kg: row.querySelector('.ex-kg').value || "0", 
                rest: row.querySelector('.ex-rest').value || "0",
                progression: { 
                    sets: row.querySelector('.prog-sets').value || "0", 
                    reps: row.querySelector('.prog-reps').value || "0", 
                    kg: row.querySelector('.prog-kg').value || "0", 
                    rest: row.querySelector('.prog-rest').value || "0" 
                }
            });
        });
        if(day.exercises.length > 0) obj.days.push(day);
    });

    await syncToSupabase('plans', obj);
    await loadAllData();
    switchTab('home');
}

function renderHistory() {
    const cont = document.getElementById('history-container');
    if(data.logs.length === 0) return cont.innerHTML = '<p class="text-center text-slate-600 py-10">Nessun log.</p>';
    cont.innerHTML = data.logs.map(log => `
        <div class="bg-slate-800 p-6 rounded-[30px] border border-white/5 log-card" onclick="this.classList.toggle('open')">
            <div class="flex justify-between items-center">
                <div>
                    <p class="text-[8px] font-black text-emerald-500 uppercase">${log.date} • Sett. ${log.week}</p>
                    <h4 class="text-lg font-black text-white uppercase">${log.dayName}</h4>
                </div>
                <button onclick="event.stopPropagation(); deleteLog(${log.id})" class="text-red-500/30 hover:text-red-500">✕</button>
            </div>
            <div class="log-details space-y-2">
                ${log.exercises.map(e => `
                    <div class="flex justify-between text-[10px] bg-slate-900/50 p-3 rounded-xl">
                        <span class="font-bold">${e.name}</span>
                        <span class="text-emerald-500">${e.sets}x${e.reps} @ ${e.kg}kg (RPE ${e.rating})</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');
}

async function deleteLog(id) {
    if(confirm("Eliminare?")) {
        await supabase.from('logs').delete().eq('id', id);
        await loadAllData();
    }
}

// --- Init ---
checkUser();