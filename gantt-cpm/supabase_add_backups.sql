-- ==============================================================================
-- 1. Tabla de Respaldos de Proyectos
-- Almacena una instantánea JSON completa del proyecto antes de cada guardado
-- para evitar pérdida de datos accidental.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.project_backups (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id uuid REFERENCES public.gantt_projects(id) ON DELETE CASCADE,
    user_id uuid, -- Opcional: Puede referenciar a auth.users si lo deseas
    created_at timestamp with time zone DEFAULT now(),
    activity_count integer NOT NULL DEFAULT 0,
    snapshot jsonb NOT NULL
);

-- ==============================================================================
-- 2. Seguridad (Row Level Security)
-- ==============================================================================

ALTER TABLE public.project_backups ENABLE ROW LEVEL SECURITY;

-- Políticas Básicas:
-- Cualquier usuario autenticado puede insertar respaldos
CREATE POLICY "Enable insert for authenticated users only"
ON public.project_backups
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Un usuario autenticado puede ver los respaldos del proyecto (idealmente si tiene permisos sobre el proyecto)
-- Por simplicidad, permitiremos a autenticados leer todos los respaldos por ahora
CREATE POLICY "Enable read access for all authenticated users"
ON public.project_backups
FOR SELECT
TO authenticated
USING (true);

-- ==============================================================================
-- 3. Mantenimiento Automático (Opcional pero Recomendado)
-- Mantener solo los últimos 20 respaldos por proyecto para no llenar la base de datos
-- ==============================================================================

-- Función para limpiar respaldos antiguos
CREATE OR REPLACE FUNCTION clean_old_project_backups()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Borrar respaldos donde el rango sea mayor al límite (mantener últimos 20)
  DELETE FROM public.project_backups
  WHERE id IN (
    SELECT id FROM (
      SELECT id, row_number() OVER (PARTITION BY project_id ORDER BY created_at DESC) as rn
      FROM public.project_backups
      WHERE project_id = NEW.project_id
    ) t
    WHERE t.rn > 20
  );
  RETURN NEW;
END;
$$;

-- Trigger que se dispara después de insertar un nuevo respaldo
DROP TRIGGER IF EXISTS cleanup_old_backups_trigger ON public.project_backups;
CREATE TRIGGER cleanup_old_backups_trigger
  AFTER INSERT ON public.project_backups
  FOR EACH ROW
  EXECUTE FUNCTION clean_old_project_backups();
