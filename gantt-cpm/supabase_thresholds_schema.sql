-- ==============================================================================
-- SCHEMA PARA UMBRALES, ISSUES Y LOGS DE CORREO
-- ==============================================================================

-- 1. Tabla de Configuración de Umbrales (Reglas)
CREATE TABLE IF NOT EXISTS public.project_thresholds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES public.gantt_projects(id) ON DELETE CASCADE,
    parameter TEXT NOT NULL CHECK (parameter IN ('devPct', 'varStart', 'varEnd', 'varDur')),
    operator TEXT NOT NULL CHECK (operator IN ('<', '>', '<=', '>=')),
    limit_value NUMERIC NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('Baja', 'Media', 'Alta', 'Crítica')),
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Habilitar RLS para project_thresholds
ALTER TABLE public.project_thresholds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read for project_thresholds based on tenant"
ON public.project_thresholds FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.gantt_projects p
        JOIN public.usuarios_empresas u ON p.empresa_id = u.empresa_id
        WHERE p.id = project_thresholds.project_id AND u.user_id = auth.uid()
    )
);

CREATE POLICY "Enable write for project_thresholds based on tenant"
ON public.project_thresholds FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.gantt_projects p
        JOIN public.usuarios_empresas u ON p.empresa_id = u.empresa_id
        WHERE p.id = project_thresholds.project_id AND u.user_id = auth.uid()
    )
);

-- 2. Tabla de Issues (Problemas Detectados)
CREATE TABLE IF NOT EXISTS public.project_issues (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES public.gantt_projects(id) ON DELETE CASCADE,
    task_id TEXT NOT NULL,
    threshold_id UUID REFERENCES public.project_thresholds(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'Abierto' CHECK (status IN ('Abierto', 'En Mitigación', 'Cerrado')),
    description TEXT NOT NULL,
    comments TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    resolved_at TIMESTAMP WITH TIME ZONE
);

-- Habilitar RLS para project_issues
ALTER TABLE public.project_issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read for project_issues based on tenant"
ON public.project_issues FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.gantt_projects p
        JOIN public.usuarios_empresas u ON p.empresa_id = u.empresa_id
        WHERE p.id = project_issues.project_id AND u.user_id = auth.uid()
    )
);

CREATE POLICY "Enable write for project_issues based on tenant"
ON public.project_issues FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.gantt_projects p
        JOIN public.usuarios_empresas u ON p.empresa_id = u.empresa_id
        WHERE p.id = project_issues.project_id AND u.user_id = auth.uid()
    )
);

-- 3. Tabla de Registro de Correos (Logs)
CREATE TABLE IF NOT EXISTS public.issue_email_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    issue_id UUID NOT NULL REFERENCES public.project_issues(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES public.gantt_projects(id) ON DELETE CASCADE,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    recipients TEXT[] NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('Enviado', 'Fallido')),
    error_message TEXT
);

-- Habilitar RLS para issue_email_logs
ALTER TABLE public.issue_email_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read for issue_email_logs based on tenant"
ON public.issue_email_logs FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.gantt_projects p
        JOIN public.usuarios_empresas u ON p.empresa_id = u.empresa_id
        WHERE p.id = issue_email_logs.project_id AND u.user_id = auth.uid()
    )
);

-- No permitimos mutaciones a log_emails desde clientes, o si es necesario un ALL policy:
CREATE POLICY "Enable write for issue_email_logs based on tenant"
ON public.issue_email_logs FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.gantt_projects p
        JOIN public.usuarios_empresas u ON p.empresa_id = u.empresa_id
        WHERE p.id = issue_email_logs.project_id AND u.user_id = auth.uid()
    )
);

-- Setup Function for Auto-Trigger Email Edge Function
-- (Optional/Placeholder for DB Webhook)
