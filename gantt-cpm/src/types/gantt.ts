// ═══════════════════════════════════════════════════════════════════
// Gantt CPM – TypeScript Types
// Maps 1:1 to the JS data structures in Carta Gantt CPM.html
// ═══════════════════════════════════════════════════════════════════

/** Dependency relationship types */
export type LinkType = 'FS' | 'SS' | 'FF' | 'SF';

/** Activity types */
export type ActivityType = 'task' | 'milestone' | 'summary';

/** Constraint types */
export type ConstraintType = '' | 'SNET' | 'SNLT' | 'MSO' | 'MFO' | 'FNET' | 'FNLT';

/** Calendar days per week (legacy) or custom calendar ID string */
export type CalendarType = 5 | 6 | 7 | string;

// ─── Custom Calendar Definition ─────────────────────────────────
export interface CustomCalendar {
    id: string;               // unique ID (e.g. 'cal_1', 'montec')
    name: string;             // display name (e.g. 'Estándar', 'Montec')
    /** Which days of week are work days. Index 0=Sun, 1=Mon … 6=Sat */
    workDays: [boolean, boolean, boolean, boolean, boolean, boolean, boolean];
    /** Hours of work per day for each weekday. Index 0=Sun, 1=Mon … 6=Sat */
    hoursPerDay: [number, number, number, number, number, number, number];
    /** Specific non-work dates (ISO strings 'YYYY-MM-DD') */
    exceptions: string[];
    /** Whether this is the default project calendar */
    isDefault?: boolean;
}

/** Resource pool types */
export type ResourceType = 'Trabajo' | 'Material' | 'Costo';

/** Accrual types */
export type AccrualType = 'Comienzo' | 'Prorrateo' | 'Fin';

/** Zoom levels for Gantt chart */
export type ZoomLevel = 'day' | 'week' | 'month';

// ─── Predecessor Link ───────────────────────────────────────────
export interface PredecessorLink {
    id: string;       // activity local_id of the predecessor
    type: LinkType;   // FS, SS, FF, SF
    lag: number;      // lag in work days (can be negative)
}

// ─── Activity Resource Assignment ───────────────────────────────
export interface ActivityResource {
    rid: number;      // resource pool ID
    name: string;     // resource name (denormalized)
    work: number;     // hours of work assigned
    units: string;    // e.g. "100%"
}

// ─── Baseline Entry (stored per activity, up to 11: BL0-BL10) ──
export interface BaselineEntry {
    dur: number;
    ES: Date | null;
    EF: Date | null;
    cal: CalendarType;
    savedAt: string; // ISO date when this baseline was saved
    name: string;        // user-given name for traceability
    description: string; // observations / description
    pct: number;         // % complete at baseline save time
    work: number;        // work hours at baseline save time
    weight: number | null; // weight at baseline save time
    statusDate: string;  // ISO date of status date when baseline was saved
}

// ─── Activity ───────────────────────────────────────────────────
export interface Activity {
    id: string;           // unique local ID (e.g. "A", "1.1")
    name: string;
    type: ActivityType;
    dur: number;          // duration in work days
    remDur: number | null; // remaining duration
    cal: CalendarType;    // calendar (5, 6, 7)
    pct: number;          // % complete (0-100)
    preds: PredecessorLink[];
    notes: string;
    res: string;          // resource names string
    work: number;         // total work hours
    weight: number | null; // weighted value for pct rollup
    resources: ActivityResource[];
    lv: number;           // WBS / outline level (0-5)
    constraint: ConstraintType;
    constraintDate: string; // ISO date string
    manual: boolean;      // manually scheduled

    // ── CPM Calculated Fields ──
    ES: Date | null;      // Early Start
    EF: Date | null;      // Early Finish
    LS: Date | null;      // Late Start
    LF: Date | null;      // Late Finish
    TF: number | null;    // Total Float
    crit: boolean;        // is critical

    // ── Baseline Fields (active baseline = baselines[activeBaselineIdx]) ──
    blDur: number | null;
    blES: Date | null;    // Baseline Early Start
    blEF: Date | null;    // Baseline Early Finish
    blCal: CalendarType | null; // Baseline Calendar
    baselines: BaselineEntry[]; // 0-10 baselines

    // ── Custom Text Fields ──
    txt1: string;
    txt2: string;
    txt3: string;
    txt4: string;
    txt5: string;

    // ── Internal / Runtime (not persisted) ──
    _isProjRow?: boolean;
    _remStart?: Date | null;
    _remDur?: number | null;
    _doneDur?: number | null;
    _origDur?: number | null;
    _actualEnd?: Date | null;
    _retES?: Date | null;
    _retEF?: Date | null;
    _plannedPct?: number;
    outlineNum?: string;
}

// ─── Resource Pool Entry ────────────────────────────────────────
export interface PoolResource {
    rid: number;          // unique resource ID
    name: string;
    type: ResourceType;
    materialLabel: string;
    initials: string;
    group: string;
    maxCapacity: string;
    stdRate: string;
    overtimeRate: string;
    costPerUse: string;
    accrual: AccrualType;
    calendar: string;     // '5d', '6d', '7d'
    code: string;
}

// ─── Project Configuration ──────────────────────────────────────
export interface ProjectConfig {
    projName: string;
    projStart: Date;
    defCal: CalendarType;
    statusDate: Date;
}

// ─── Visible Row (used for rendering) ───────────────────────────
export interface VisibleRow extends Activity {
    _idx: number;          // index in the activities array
    _isGroupHeader?: boolean;
    _groupLabel?: string;
    _groupCount?: number;
    _isResourceAssignment?: boolean;
    _parentTaskId?: string;
    _isMetricRow?: boolean;   // sub-row showing a usage metric
    _metricMode?: string;     // which metric this sub-row represents
}

// ─── Column Definition ──────────────────────────────────────────
export interface ColumnDef {
    key: string;
    label: string;
    w: number;            // width in pixels
    edit: boolean | 'select';
    cls: string;          // CSS class
    visible: boolean;
}

// ─── Theme Colors for Canvas Rendering ──────────────────────────
export interface ThemeColors {
    rowEven: string;
    rowOdd: string;
    gridMonth: string;
    gridLine: string;
    hdrTopBg: string;
    hdrTopBorder: string;
    hdrTopText: string;
    hdrBotBg: string;
    hdrBotBorder: string;
    hdrBotText: string;
    hdrWeekend: string;
    summaryBar: string;
    barLabel: string;
    barLabelOut: string;
    blBar: string;
    blDiamond: string;
    connLine: string;
    connCrit: string;
    todayLine: string;
    statusLine: string;
    gradTop: string;
    gradBot: string;
}

// ─── Progress History Snapshot (per-activity data) ──────────────
export interface ProgressActivitySnapshot {
    pct: number;
    dur: number;
    remDur: number | null;
    work: number;
    weight: number | null;
    res: string;
    resources: ActivityResource[];
    manual: boolean;
    constraint: ConstraintType;
    constraintDate: string;
}

// ─── Progress History (S-Curve) ─────────────────────────────────
export interface ProgressHistoryEntry {
    date: string;       // ISO date string
    actualPct: number;  // 0-100%
    details?: Record<string, number>; // activity_id -> actualPct (legacy)
    snapshots?: Record<string, ProgressActivitySnapshot>; // activity_id -> full snapshot
}
