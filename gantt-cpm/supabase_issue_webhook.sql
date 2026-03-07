-- Supabase Edge Function Webhook para notificaciones de "Issues" Críticos
-- NOTA: El envío de correo ahora se hace directamente desde el frontend (ThresholdsPage)
-- con UN solo correo que incluye TODAS las alertas en formato tabla.
-- Este trigger conserva la lógica de severidad para futuros usos pero ya NO llama la edge function.
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Crea o reemplaza la función que llamará a la Edge Function
CREATE OR REPLACE FUNCTION public.trigger_issue_email_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_severity TEXT;
BEGIN
    -- Obtener severidad desde el umbral asociado
    SELECT severity INTO v_severity
    FROM public.project_thresholds
    WHERE id = NEW.threshold_id;

    -- Fallback: si threshold_id es NULL, leer severidad desde la descripción
    IF v_severity IS NULL AND NEW.description ILIKE '%[Crítica]%' THEN
        v_severity := 'Crítica';
    END IF;

    -- El envío de correo se maneja desde el frontend (ThresholdsPage.saveBreachesToDB)
    -- que llama la edge function UNA vez con todas las alertas en formato tabla.
    -- Este trigger queda como registro de auditoría / para inserciones manuales futuras.

    RETURN NEW;
END;
$$;

-- Crear el Trigger sobre la tabla project_issues
DROP TRIGGER IF EXISTS trigger_new_critical_issue ON public.project_issues;

CREATE TRIGGER trigger_new_critical_issue
AFTER INSERT ON public.project_issues
FOR EACH ROW
EXECUTE FUNCTION public.trigger_issue_email_notification();
