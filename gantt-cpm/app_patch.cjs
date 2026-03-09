const fs = require('fs');
const file = 'src/App.tsx';
let content = fs.readFileSync(file, 'utf8');

const anchor1 = "      if (saved.riskState) dispatch({ type: 'LOAD_RISK_STATE', riskState: saved.riskState });\n      console.log('[handleOpenProject] BRANCH 1: localStorage loaded via explicit dispatches, defCal=', saved.defCal);\n";
const anchor2 = "      if (saved.riskState) dispatch({ type: 'LOAD_RISK_STATE', riskState: saved.riskState });\r\n      console.log('[handleOpenProject] BRANCH 1: localStorage loaded via explicit dispatches, defCal=', saved.defCal);\r\n";

const overlayStr = `
      // ── NEW: Overlay Supabase data to fix stale localStorage ──
      if (proj?.supabaseId) {
        loadFromSupabase(proj.supabaseId).then(data => {
          if (data && data.activities && data.activities.length) {
            if (data.projName) dispatch({ type: 'SET_PROJECT_CONFIG', config: { projName: data.projName, projStart: data.projStart, defCal: data.defCal, statusDate: data.statusDate || undefined, durationType: proj?.durationType, customFilters: data.customFilters || [], filtersMatchAll: data.filtersMatchAll !== undefined ? data.filtersMatchAll : true } });
            if (data.resourcePool && data.resourcePool.length) dispatch({ type: 'SET_RESOURCES', resources: data.resourcePool });
            dispatch({ type: 'SET_ACTIVITIES', activities: data.activities });
            if (data.progressHistory && data.progressHistory.length) dispatch({ type: 'SET_PROGRESS_HISTORY', history: data.progressHistory });
            if (data.ppcHistory && data.ppcHistory.length) dispatch({ type: 'SET_PPC_HISTORY', history: data.ppcHistory });
            if (data.leanRestrictions && data.leanRestrictions.length) dispatch({ type: 'SET_LEAN_RESTRICTIONS', restrictions: data.leanRestrictions });
            if ((data as any).scenarios && (data as any).scenarios.length) dispatch({ type: 'SET_SCENARIOS', scenarios: (data as any).scenarios });
            if ((data as any).riskState) dispatch({ type: 'LOAD_RISK_STATE', riskState: (data as any).riskState });
            if (data.columnViews && data.columnViews.length) dispatch({ type: 'SET_COLUMN_VIEWS', views: data.columnViews });
            console.log('[handleOpenProject] Overlaid Supabase data over localStorage');
          }
        }).catch(err => console.warn('Failed to overlay Supabase data:', err));
      }
`;

if (content.includes(anchor1)) {
    content = content.replace(anchor1, anchor1 + overlayStr);
} else if (content.includes(anchor2)) {
    content = content.replace(anchor2, anchor2 + overlayStr);
}

fs.writeFileSync(file, content);
console.log('Modified App.tsx to restore Supabase overlay successfully.');
