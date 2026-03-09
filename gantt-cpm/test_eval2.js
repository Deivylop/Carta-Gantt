const dates = [20, 21, 22, 23, 24, 25, 26].map(d => new Date('2026-03-'+d+'T00:00:00').getTime());
let points = dates.map(time => ({ dateMs: time, planned: [0, 240, 480, 720, 960, 1200, 1200][dates.indexOf(time)] }));

// simulate status date shift
let sTime = new Date('2026-03-20T00:00:00').getTime();
let sTimeEndOfDay = sTime + 86400000; // Mar 21
let sdPt = points.find(p => p.dateMs === sTime);
if (sdPt) sdPt.dateMs = sTimeEndOfDay;

const getValAtMs = (msTarget) => {
    const exact = points.find(p => p.dateMs === msTarget);
    if (exact) return exact.planned;
    const pastPoints = points.filter(p => p.dateMs <= msTarget);
    if (pastPoints.length === 0) return 0;
    return pastPoints[pastPoints.length - 1].planned;
};

for(let i=0; i<dates.length-1; i++) {
    let prog = getValAtMs(dates[i+1]) - getValAtMs(dates[i]);
    console.log(new Date(dates[i]).getDate() + " prog: " + prog);
}
