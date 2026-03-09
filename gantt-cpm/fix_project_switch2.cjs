const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src', 'App.tsx');
let lines = fs.readFileSync(file, 'utf8').split('\n');
console.log('Original line count:', lines.length);

// ═══ FIX 1: Replace LOAD_STATE on line 570 with explicit dispatches ═══
// Line 570 (0-indexed 569):   dispatch({ type: 'LOAD_STATE', state: saved });
const idx1 = lines.findIndex((l, i) => i > 540 && l.includes("dispatch({ type: 'LOAD_STATE', state: saved })"));
if (idx1 === -1) { console.error('FIX 1 FAILED: LOAD_STATE not found after line 540'); process.exit(1); }
console.log('Found LOAD_STATE at line', idx1 + 1, ':', lines[idx1].trim().substring(0, 60));

const replacement1 = [
  "      // ── Use explicit dispatches (not LOAD_STATE merge) to fully replace state ──",
  "      dispatch({ type: 'SET_PROJECT_CONFIG', config: {",
  "        projName: saved.projName, projStart: saved.projStart, defCal: saved.defCal,",
  "        statusDate: saved.statusDate || undefined, durationType: saved.durationType || undefined,",
  "        customFilters: saved.customFilters || [], filtersMatchAll: saved.filtersMatchAll !== undefined ? saved.filtersMatchAll : true,",
  "      }});",
  "      dispatch({ type: 'SET_ACTIVITIES', activities: saved.activities || [] });",
  "      dispatch({ type: 'SET_RESOURCES', resources: saved.resourcePool || [] });",
  "      dispatch({ type: 'SET_PROGRESS_HISTORY', history: saved.progressHistory || [] });",
  "      dispatch({ type: 'SET_PPC_HISTORY', history: saved.ppcHistory || [] });",
  "      dispatch({ type: 'SET_LEAN_RESTRICTIONS', restrictions: saved.leanRestrictions || [] });",
  "      dispatch({ type: 'SET_SCENARIOS', scenarios: saved.scenarios || [] });",
  "      if (saved.riskState) dispatch({ type: 'LOAD_RISK_STATE', riskState: saved.riskState });",
  "      console.log('[handleOpenProject] BRANCH 1: localStorage loaded via explicit dispatches, defCal=', saved.defCal);",
];
lines.splice(idx1, 1, ...replacement1);
console.log('FIX 1: Replaced LOAD_STATE with', replacement1.length, 'lines of explicit dispatches');

// ═══ FIX 2: Move SET_ACTIVE_PROJECT + setActiveModule BEFORE data loading ═══
// After FIX 1, line numbers shifted. Find the SET_ACTIVE_PROJECT line near end of handleOpenProject
const idx2 = lines.findIndex((l, i) => i > 600 && l.includes("pDispatch({ type: 'SET_ACTIVE_PROJECT', id: projectId })"));
if (idx2 === -1) { console.error('FIX 2 FAILED: SET_ACTIVE_PROJECT not found'); process.exit(1); }
console.log('Found SET_ACTIVE_PROJECT at line', idx2 + 1);

// Remove the 3 lines: pDispatch, setActiveModule, localStorage.setItem
// Check the next 2 lines are setActiveModule and localStorage
console.log('  Next lines:', lines[idx2 + 1]?.trim().substring(0, 50), '|', lines[idx2 + 2]?.trim().substring(0, 50));
lines.splice(idx2, 3); // Remove 3 lines

// Now find where to INSERT: right before "// Load the target project" inside handleOpenProject
const insertMarker = lines.findIndex((l, i) => i > 540 && l.includes('const saved = loadProjectState(projectId)'));
if (insertMarker === -1) { console.error('FIX 2b FAILED: loadProjectState marker not found'); process.exit(1); }
console.log('Found loadProjectState at line', insertMarker + 1);

const insertBlock = [
  "",
  "    // ── Set active project + module FIRST, before loading data ──",
  "    pDispatch({ type: 'SET_ACTIVE_PROJECT', id: projectId });",
  "    setActiveModule('gantt');",
  "    localStorage.setItem('gantt_active_module', 'gantt');",
  "",
];
lines.splice(insertMarker, 0, ...insertBlock);
console.log('FIX 2: Moved SET_ACTIVE_PROJECT before data loading');

// Write back
const result = lines.join('\n');
fs.writeFileSync(file, result, 'utf8');
console.log('File saved. New line count:', lines.length);
