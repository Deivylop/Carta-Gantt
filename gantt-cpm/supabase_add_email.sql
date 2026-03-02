-- Add an email column to avoid explicit joins against the protected auth.users table
ALTER TABLE public.usuarios_empresas ADD COLUMN IF NOT EXISTS email text;

-- Temporarily drop the trigger if it exists to replace it with an updated one
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- We don't need the trigger for creating the user, because we do it in the Edge Function,
-- BUT we can use a trigger to auto-populate the email field if it's null by reading auth.users.
-- Since the edge function handles insertion, we should just make sure the edge function
-- saves the email.

-- For existing records, attempt to backfill the email if we are running under SUPERUSER
DO $$
DECLARE
    rec RECORD;
BEGIN
    FOR rec IN SELECT id, email FROM auth.users
    LOOP
        UPDATE public.usuarios_empresas SET email = rec.email WHERE user_id = rec.id;
    END LOOP;
END;
$$;
