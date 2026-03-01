// ═══════════════════════════════════════════════════════════════════
// Portfolio Types – EPS hierarchy and multi-project management
// Modeled after Primavera P6's Enterprise Project Structure
// ═══════════════════════════════════════════════════════════════════

/** Node in the Enterprise Project Structure tree */
export interface EPSNode {
    id: string;
    name: string;
    epsCode: string;           // short EPS ID code e.g. "EPS-001" (P6 "EPS ID")
    parentId: string | null;   // null = root-level
    type: 'eps';               // only folders
    color?: string;            // visual accent for grouping
    order: number;             // explicit sort order within siblings
}

/** Metadata about a project stored in the portfolio */
export interface ProjectMeta {
    id: string;                // unique project ID (also used as localStorage key suffix)
    epsId: string | null;      // parent EPS folder (null = root-level)
    name: string;
    code: string;              // short code e.g. "PRY-001"
    priority: number;          // 1 = highest
    description: string;
    status: 'Planificación' | 'Ejecución' | 'Suspendido' | 'Completado';
    startDate: string | null;  // ISO date (ES of project)
    endDate: string | null;    // ISO date (EF of project)
    statusDate: string | null; // ISO date
    activityCount: number;
    completedCount: number;
    criticalCount: number;
    globalPct: number;         // 0-100 (% avance)
    plannedPct: number;        // 0-100 (% planificado)
    createdAt: string;         // ISO datetime
    updatedAt: string;         // ISO datetime
    supabaseId: string | null; // Supabase project id if synced

    // ── WBS 0 / Project Row fields (from _isProjRow activity) ──
    duration: number;               // project duration in work days
    remainingDur: number;           // remaining duration
    work: number;                   // total work hours (TRABAJO)
    actualWork: number;             // actual/earned work hours (TRABAJO REAL / VALOR GANADO)
    remainingWork: number;          // remaining work hours (TRABAJO RESTANTE)
    pctProg: number;                // % PROG (WBS 0 pct)
    weight: number | null;          // PESO
    resources: string;              // resource names string

    // Project defaults for new activities (P6 "Valores por defecto")
    durationType?: string;
    pctCompleteType?: string;
    activityType?: string;
    defaultCalendar?: string;
    actIdPrefix?: string;
    actIdSuffix?: string;
    actIdIncrement?: number;
    notes?: string;
}

/** The full portfolio state */
export interface PortfolioState {
    epsNodes: EPSNode[];
    projects: ProjectMeta[];
    expandedIds: Set<string>;  // expanded EPS folders
    selectedId: string | null; // selected EPS or project ID
    activeProjectId: string | null; // currently opened project
    clipboard: { mode: 'cut' | 'copy'; projectId: string } | null; // cut/copy clipboard
}

/** Combined tree node for rendering */
export type TreeNode =
    | { kind: 'eps'; data: EPSNode; depth: number; hasChildren: boolean; expanded: boolean }
    | { kind: 'project'; data: ProjectMeta; depth: number };
