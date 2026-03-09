// Fix: Replace LOAD_STATE merge with explicit dispatches in handleOpenProject BRANCH 1
// Also move SET_ACTIVE_PROJECT + setActiveModule before data loading
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src', 'App.tsx');
let code = fs.readFileSync(file, 'utf8');

// ── FIX 1: Replace LOAD_STATE in BRANCH 1 with explicit dispatches ──
const oldBranch1 = `      dispatch({ type: 'LOAD_STATE', state: saved });
      console.log('[handleOpenProject] BRANCH 1: localStorage loaded, defCal=', saved.defCal);`;

const newBranch1 = `      // ── Use explicit dispatches (not LOAD_STATE merge) to fully replace state ──
      dispatch({ type: 'SET_PROJECT_CONFIG', config: {
        projName: saved.projName,
        projStart: saved.projStart,
        defCal: saved.defCal,
        statusDate: saved.statusDate || undefined,
        durationType: saved.durationType || undefined,
        customFilters: saved.customFilters || [],
        filtersMatchAll: saved.filtersMatchAll !== undefined ? saved.filtersMatchAll : true,
      }});
      dispatch({ type: 'SET_ACTIVITIES', activities: saved.activities || [] });
      dispatch({ type: 'SET_RESOURCES', resources: saved.resourcePool || [] });
      dispatch({ type: 'SET_PROGRESS_HISTORY', history: saved.progressHistory || [] });
      dispatch({ type: 'SET_PPC_HISTORY', history: saved.ppcHistory || [] });
      dispatch({ type: 'SET_LEAN_RESTRICTIONS', restrictions: saved.leanRestrictions || [] });
      dispatch({ type: 'SET_SCENARIOS', scenarios: saved.scenarios || [] });
      if (saved.riskState) dispatch({ type: 'LOAD_RISK_STATE', riskState: saved.riskState });
      console.log('[handleOpenProject] BRANCH 1: localStorage loaded, defCal=', saved.defCal, 'activities=', (saved.activities || []).length);`;

if (code.includes(oldBranch1)) {
  code = code.replace(oldBranch1, newBranch1);
  console.log('FIX 1 applied: Replaced LOAD_STATE with explicit dispatches');
} else {
  console.log('FIX 1: exact match not found, trying flexible match...');
  // Try to find it by just the dispatch line
  const altOld = "      dispatch({ type: 'LOAD_STATE', state: saved });";
  const idx = code.indexOf(altOld);
  if (idx !== -1) {
    // Find the next console.log line after it
    const afterIdx = code.indexOf('\n', idx) + 1;
    const nextLineEnd = code.indexOf('\n', afterIdx);
    const nextLine = code.substring(afterIdx, nextLineEnd);
    console.log('Found LOAD_STATE at index', idx, 'next line:', nextLine.trim().substring(0, 60));
    // Replace just the LOAD_STATE line + next line
    const toReplace = code.substring(idx, nextLineEnd);
    code = code.replace(toReplace, newBranch1);
    console.log('FIX 1 applied (flexible match)');
  } else {
    console.error('FIX 1 FAILED: Could not find LOAD_STATE dispatch in BRANCH 1');
  }
}

// ── FIX 2: Move SET_ACTIVE_PROJECT + setActiveModule before data loading ──
// Find the line "    const proj = pState.projects.find..." and add the SET_ACTIVE_PROJECT block before "// Load the target project"
const loadMarker = "    // Load the target project";
const endMarker = `    pDispatch({ type: 'SET_ACTIVE_PROJECT', id: projectId });
    setActiveModule('gantt');
    localStorage.setItem('gantt_active_module', 'gantt');`;

if (code.includes(loadMarker) && code.includes(endMarker)) {
  // Remove the end marker (SET_ACTIVE_PROJECT block at end)
  code = code.replace(endMarker, "    // (activeProjectId and activeModule already set at the top of handleOpenProject)");
  
  // Insert SET_ACTIVE_PROJECT block before "// Load the target project"
  const insertBlock = `    // ── Set active project + module FIRST so subsequent dispatches target the right project ──
    pDispatch({ type: 'SET_ACTIVE_PROJECT', id: projectId });
    setActiveModule('gantt');
    localStorage.setItem('gantt_active_module', 'gantt');

    // Load the target project`;
  
  code = code.replace(loadMarker, insertBlock);
  console.log('FIX 2 applied: Moved SET_ACTIVE_PROJECT before data loading');
} else {
  if (!code.includes(loadMarker)) console.error('FIX 2: loadMarker not found');
  if (!code.includes(endMarker)) console.error('FIX 2: endMarker not found');
}

fs.writeFileSync(file, code, 'utf8');
console.log('File saved. New size:', code.length, 'chars');
