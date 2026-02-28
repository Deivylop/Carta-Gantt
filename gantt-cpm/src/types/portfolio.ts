// ═══════════════════════════════════════════════════════════════════
// Portfolio Types – EPS hierarchy and multi-project management
// Modeled after Primavera P6's Enterprise Project Structure
// ═══════════════════════════════════════════════════════════════════

/** Node in the Enterprise Project Structure tree */
export interface EPSNode {
    id: string;
    name: string;
    parentId: string | null;   // null = root-level
    type: 'eps';               // only folders
    color?: string;            // visual accent for grouping
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
    startDate: string | null;  // ISO date
    endDate: string | null;    // ISO date
    statusDate: string | null; // ISO date
    activityCount: number;
    completedCount: number;
    criticalCount: number;
    globalPct: number;         // 0-100
    plannedPct: number;        // 0-100
    createdAt: string;         // ISO datetime
    updatedAt: string;         // ISO datetime
    supabaseId: string | null; // Supabase project id if synced
}

/** The full portfolio state */
export interface PortfolioState {
    epsNodes: EPSNode[];
    projects: ProjectMeta[];
    expandedIds: Set<string>;  // expanded EPS folders
    selectedId: string | null; // selected EPS or project ID
    activeProjectId: string | null; // currently opened project
}

/** Combined tree node for rendering */
export type TreeNode =
    | { kind: 'eps'; data: EPSNode; depth: number; hasChildren: boolean; expanded: boolean }
    | { kind: 'project'; data: ProjectMeta; depth: number };
