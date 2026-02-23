// Quick test of the backward pass logic
// Simulating a simple chain: A → B → C with FS dependencies and cal=6

function addDays(d, n) {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
}

function dayDiff(a, b) {
    return Math.round((b.getTime() - a.getTime()) / 864e5);
}

function addWorkDays(d, wd, cal) {
    const f = cal === 6 ? 7/6 : cal === 5 ? 7/5 : 1;
    const c = Math.round(wd * f);
    const r = new Date(d);
    r.setDate(r.getDate() + c);
    return r;
}

// Setup: 3 activities in chain A→B→C, cal=6, dur=10 each
const projStart = new Date('2025-02-03T00:00:00');
const statusDate = new Date('2025-06-01T00:00:00');
const cal = 6;

const activities = [
    { id: 'A', dur: 10, pct: 0, preds: [], type: 'task', cal, ES: null, EF: null, LS: null, LF: null, TF: null, crit: false },
    { id: 'B', dur: 10, pct: 0, preds: [{ id: 'A', type: 'FS', lag: 0 }], type: 'task', cal, ES: null, EF: null, LS: null, LF: null, TF: null, crit: false },
    { id: 'C', dur: 10, pct: 0, preds: [{ id: 'B', type: 'FS', lag: 0 }], type: 'task', cal, ES: null, EF: null, LS: null, LF: null, TF: null, crit: false },
];

const byId = {};
activities.forEach(a => { byId[a.id] = a; });

// Forward pass (simplified - no constraints, no status date)
function getES(a) {
    if (a.ES !== null) return a.ES;
    let es = new Date(projStart);
    if (a.preds && a.preds.length) {
        a.preds.forEach(p => {
            const pred = byId[p.id];
            if (!pred) return;
            getES(pred);
            const pEF = pred.EF;
            if (pEF > es) es = new Date(pEF);
        });
    }
    a.ES = es;
    a.EF = addWorkDays(es, a.dur, a.cal);
    return a.ES;
}

activities.forEach(a => getES(a));

console.log("=== FORWARD PASS ===");
activities.forEach(a => {
    console.log(`${a.id}: ES=${a.ES.toISOString().slice(0,10)} EF=${a.EF.toISOString().slice(0,10)} dur=${a.dur}`);
});

// Now simulate retained logic: move all to status date
activities.forEach(a => {
    const newES = new Date(statusDate);
    if (newES > a.ES) {
        a.ES = newES;
        a.EF = addWorkDays(newES, a.dur, a.cal);
    }
});
// Re-do forward pass to respect predecessors
activities.forEach(a => { a.ES = null; a.EF = null; });
function getRetES(a) {
    if (a.ES !== null) return a.ES;
    let es = new Date(statusDate);
    if (a.preds && a.preds.length) {
        a.preds.forEach(p => {
            const pred = byId[p.id];
            if (!pred) return;
            getRetES(pred);
            const pEF = pred.EF;
            if (pEF > es) es = new Date(pEF);
        });
    }
    a.ES = es;
    a.EF = addWorkDays(es, a.dur, a.cal);
    return a.ES;
}
activities.forEach(a => getRetES(a));

console.log("\n=== AFTER RETAINED (all pct=0, statusDate=2025-06-01) ===");
activities.forEach(a => {
    console.log(`${a.id}: ES=${a.ES.toISOString().slice(0,10)} EF=${a.EF.toISOString().slice(0,10)} dur=${a.dur}`);
});

// Backward pass
let projEnd = new Date(projStart);
activities.forEach(a => {
    if (a.EF && a.EF > projEnd) projEnd = new Date(a.EF);
});
console.log(`\nprojEnd = ${projEnd.toISOString().slice(0,10)}`);

activities.forEach(a => { a.LF = new Date(projEnd); });

const sorted = [...activities].sort((a, b) => (b.EF || projEnd).getTime() - (a.EF || projEnd).getTime());
console.log("Sorted order:", sorted.map(a => a.id).join(", "));

const effCalDays = (a) => {
    if (a.ES && a.EF) return Math.max(0, dayDiff(a.ES, a.EF));
    return Math.round(a.dur * (7/6));
};

sorted.forEach(a => {
    a.LS = addDays(a.LF, -effCalDays(a));
    if (a.preds) {
        a.preds.forEach(p => {
            const pred = byId[p.id]; if (!pred) return;
            let newLF; const lag = p.lag || 0;
            if (p.type === 'FS') newLF = addWorkDays(a.LS, -lag, pred.cal);
            else newLF = addWorkDays(a.LS, -lag, pred.cal);
            
            console.log(`  ${a.id} → pred ${pred.id}: a.LS=${a.LS.toISOString().slice(0,10)} newLF=${newLF.toISOString().slice(0,10)} pred.LF=${pred.LF.toISOString().slice(0,10)} update=${newLF < pred.LF}`);
            
            if (!pred.LF || newLF < pred.LF) {
                pred.LF = new Date(newLF);
            }
        });
    }
});

console.log("\n=== BACKWARD PASS RESULT ===");
activities.forEach(a => {
    if (!a.LF) a.LF = new Date(projEnd);
    a.LS = addDays(a.LF, -effCalDays(a));
    const tf = dayDiff(a.ES, a.LS);
    a.TF = Math.max(0, tf);
    a.crit = a.TF <= 1;
    console.log(`${a.id}: ES=${a.ES.toISOString().slice(0,10)} EF=${a.EF.toISOString().slice(0,10)} LF=${a.LF.toISOString().slice(0,10)} LS=${a.LS.toISOString().slice(0,10)} effCal=${effCalDays(a)} TF=${a.TF} crit=${a.crit}`);
});
