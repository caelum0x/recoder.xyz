CREATE OR REPLACE FUNCTION public.create_secret(plaintext text)
RETURNS text
LANGUAGE sql
SET search_path = ''
AS $$
  SELECT vault.create_secret(plaintext);
$$;

CREATE OR REPLACE FUNCTION public.decrypt_secret(secret_id uuid)
RETURNS text
LANGUAGE sql
SET search_path = ''
AS $$
  SELECT decrypted_secret
  FROM vault.decrypted_secrets
  WHERE id = secret_id;
$$;
