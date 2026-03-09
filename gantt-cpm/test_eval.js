const tasks = [
    { ES: new Date('2026-03-21T00:00:00'), EF: new Date('2026-03-26T00:00:00'), work: 1200 }
];
const getExactElapsedRatio = (start, end, evalDate) => {
    if (evalDate <= start) return 0;
    if (evalDate >= end) return 1;
    return (evalDate.getTime() - start.getTime()) / (end.getTime() - start.getTime());
};
const calcPlannedPct = (dateMs) => {
    const d = new Date(dateMs);
    d.setDate(d.getDate() + 1);
    let sum = 0;
    tasks.forEach(t => sum += getExactElapsedRatio(t.ES, t.EF, d) * t.work);
    return sum;
};
const dates = [20, 21, 22, 23, 24, 25, 26].map(d => new Date('2026-03-'+d+'T00:00:00').getTime());
const points = dates.map(time => ({ dateMs: time, planned: calcPlannedPct(time) }));
for(let i=0; i<dates.length-1; i++) {
    console.log(new Date(dates[i]).getDate() + " prog: " + (points[i+1].planned - points[i].planned));
}
