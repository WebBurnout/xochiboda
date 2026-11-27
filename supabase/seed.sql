-- Invitation data comes from seed.csv via `npm run seed`, not from this file.

-- Lets the notify-rsvps cron job reach the local edge function from inside the
-- database container. The secret matches supabase/functions/.env.example.
select vault.create_secret(
  'http://supabase_kong_xochiboda:8000/functions/v1/notify-rsvps',
  'notify_rsvps_url'
);
select vault.create_secret('local-notify-rsvps-secret', 'notify_rsvps_secret');

-- Local admin login: twfarnam@gmail.com / xochiboda-dev. The empty-string
-- token columns matter: GoTrue fails to sign in when they are null. pgcrypto
-- lives in the extensions schema, which is not always on the search path.
with admin_user as (
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated',
    'authenticated', 'twfarnam@gmail.com', extensions.crypt('xochiboda-dev', extensions.gen_salt('bf')),
    now(), '{"provider": "email", "providers": ["email"]}', '{}', now(), now(),
    '', '', '', ''
  )
  returning id, email
)
insert into auth.identities (
  id, user_id, provider_id, identity_data, provider, last_sign_in_at,
  created_at, updated_at
)
select
  gen_random_uuid(), id, id::text,
  jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true),
  'email', now(), now(), now()
from admin_user;
