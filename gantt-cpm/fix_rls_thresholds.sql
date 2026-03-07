-- ============================================================
-- FIX RLS: Separar policies para INSERT con WITH CHECK
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- 1. DROP existing write policies
DROP POLICY IF EXISTS "Enable write for project_thresholds based on tenant" ON public.project_thresholds;
DROP POLICY IF EXISTS "Enable write for project_issues based on tenant" ON public.project_issues;
DROP POLICY IF EXISTS "Enable write for issue_email_logs based on tenant" ON public.issue_email_logs;

-- 2. CREATE separate INSERT policies (WITH CHECK)
CREATE POLICY "Enable insert for project_thresholds"
ON public.project_thresholds FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.gantt_projects p
        JOIN public.usuarios_empresas u ON p.empresa_id = u.empresa_id
        WHERE p.id = project_thresholds.project_id AND u.user_id = auth.uid()
    )
);

CREATE POLICY "Enable insert for project_issues"
ON public.project_issues FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.gantt_projects p
        JOIN public.usuarios_empresas u ON p.empresa_id = u.empresa_id
        WHERE p.id = project_issues.project_id AND u.user_id = auth.uid()
    )
);

CREATE POLICY "Enable insert for issue_email_logs"
ON public.issue_email_logs FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.gantt_projects p
        JOIN public.usuarios_empresas u ON p.empresa_id = u.empresa_id
        WHERE p.id = issue_email_logs.project_id AND u.user_id = auth.uid()
    )
);

-- 3. CREATE UPDATE/DELETE policies (USING)
CREATE POLICY "Enable update for project_thresholds"
ON public.project_thresholds FOR UPDATE USING (
    EXISTS (
        SELECT 1 FROM public.gantt_projects p
        JOIN public.usuarios_empresas u ON p.empresa_id = u.empresa_id
        WHERE p.id = project_thresholds.project_id AND u.user_id = auth.uid()
    )
);

CREATE POLICY "Enable delete for project_thresholds"
ON public.project_thresholds FOR DELETE USING (
    EXISTS (
        SELECT 1 FROM public.gantt_projects p
        JOIN public.usuarios_empresas u ON p.empresa_id = u.empresa_id
        WHERE p.id = project_thresholds.project_id AND u.user_id = auth.uid()
    )
);

CREATE POLICY "Enable update for project_issues"
ON public.project_issues FOR UPDATE USING (
    EXISTS (
        SELECT 1 FROM public.gantt_projects p
        JOIN public.usuarios_empresas u ON p.empresa_id = u.empresa_id
        WHERE p.id = project_issues.project_id AND u.user_id = auth.uid()
    )
);

CREATE POLICY "Enable delete for project_issues"
ON public.project_issues FOR DELETE USING (
    EXISTS (
        SELECT 1 FROM public.gantt_projects p
        JOIN public.usuarios_empresas u ON p.empresa_id = u.empresa_id
        WHERE p.id = project_issues.project_id AND u.user_id = auth.uid()
    )
);
