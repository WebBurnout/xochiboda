create extension if not exists pgcrypto with schema extensions;

-- Invitation links carry a short random code rather than the UUID. Five base62
-- characters give about 916 million possibilities, which keeps the link short
-- while leaving codes impractical to guess. Defined before the table because it
-- is the column default; plpgsql only resolves the table when it runs.
create or replace function public.generate_invitation_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_alphabet constant text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  v_code text;
  v_byte integer;
begin
  loop
    v_code := '';

    while length(v_code) < 5 loop
      v_byte := get_byte(extensions.gen_random_bytes(1), 0);
      -- 248 is the largest multiple of 62 that fits in a byte, so rejecting the
      -- bytes above it keeps every character equally likely.
      if v_byte < 248 then
        v_code := v_code || substr(v_alphabet, v_byte % 62 + 1, 1);
      end if;
    end loop;

    exit when not exists (
      select 1 from public.invitations as i where i.code = v_code
    );
  end loop;

  return v_code;
end;
$$;

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique
    default public.generate_invitation_code()
    check (code ~ '^[0-9A-Za-z]{5}$'),
  name text not null,
  relationship text not null,
  category text,
  invitation_time time,
  emails text,

  attending boolean,
  attends_reception boolean not null default false,
  attends_family_dinner boolean not null default false,
  attends_tornaboda boolean not null default false,
  attends_trip boolean not null default false,

  special_requirements text,
  message text,
  is_gringo boolean not null default false,
  is_family boolean not null default false,
  is_peer boolean not null default false,

  responded_at timestamptz,
  -- When the admin marked the invitation as sent to the guest; null means unsent.
  sent_at timestamptz,
  -- The responded_at last reported by email; see the notifications section.
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.invitees (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.invitations(id) on delete cascade,
  name text not null,
  is_vegetarian boolean not null default false,
  diet_notes text,
  is_kid boolean not null default false,
  age integer check (age is null or (age >= 0 and age <= 120)),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index invitees_invitation_id_idx
  on public.invitees (invitation_id);

create index invitees_invitation_sort_order_idx
  on public.invitees (invitation_id, sort_order);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger invitations_set_updated_at
before update on public.invitations
for each row
execute function public.set_updated_at();

create trigger invitees_set_updated_at
before update on public.invitees
for each row
execute function public.set_updated_at();

-- Invitee rows are always replaced wholesale, by the guest RSVP form and by the
-- admin editor alike, so the validation and the insert live in exactly one
-- place. Not security definer: it inherits the privileges of the definer
-- function that calls it, and is revoked from clients below.
create or replace function public.replace_invitees(
  p_invitation_id uuid,
  p_invitees jsonb
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_invitees jsonb := coalesce(p_invitees, '[]'::jsonb);
begin
  if jsonb_typeof(v_invitees) <> 'array' then
    raise exception using
      errcode = '22023',
      message = 'invitees must be an array';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_invitees) as submitted(person)
    where jsonb_typeof(submitted.person) <> 'object'
       or nullif(btrim(submitted.person ->> 'name'), '') is null
  ) then
    raise exception using
      errcode = '22023',
      message = 'every invitee must have a name';
  end if;

  delete from public.invitees as person
  where person.invitation_id = p_invitation_id;

  insert into public.invitees (
    invitation_id,
    name,
    is_vegetarian,
    diet_notes,
    is_kid,
    age,
    sort_order
  )
  select
    p_invitation_id,
    btrim(submitted.person ->> 'name'),
    coalesce((submitted.person ->> 'is_vegetarian')::boolean, false),
    nullif(btrim(submitted.person ->> 'diet_notes'), ''),
    coalesce((submitted.person ->> 'is_kid')::boolean, false),
    -- Age is only meaningful for kids, so it is dropped otherwise.
    case
      when coalesce((submitted.person ->> 'is_kid')::boolean, false)
      then nullif(btrim(submitted.person ->> 'age'), '')::integer
    end,
    (submitted.position - 1)::integer
  from jsonb_array_elements(v_invitees) with ordinality
    as submitted(person, position);
end;
$$;

alter table public.invitations enable row level security;
alter table public.invitees enable row level security;

-- There are intentionally no direct table policies. Anonymous clients use only
-- the narrowly scoped RPC functions below.
revoke all on table public.invitations from anon, authenticated;
revoke all on table public.invitees from anon, authenticated;

create or replace function public.get_invitation(p_invitation_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', i.id,
    'code', i.code,
    'name', i.name,
    'relationship', i.relationship,
    'invitation_time', i.invitation_time,
    'attending', i.attending,
    'attends_reception', i.attends_reception,
    'attends_family_dinner', i.attends_family_dinner,
    'attends_tornaboda', i.attends_tornaboda,
    'attends_trip', i.attends_trip,
    'special_requirements', i.special_requirements,
    'message', i.message,
    'is_gringo', i.is_gringo,
    'is_family', i.is_family,
    'is_peer', i.is_peer,
    'responded_at', i.responded_at,
    'updated_at', i.updated_at,
    'invitees', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', person.id,
            'name', person.name,
            'is_vegetarian', person.is_vegetarian,
            'diet_notes', person.diet_notes,
            'is_kid', person.is_kid,
            'age', person.age,
            'sort_order', person.sort_order
          )
          order by person.sort_order, person.id
        )
        from public.invitees as person
        where person.invitation_id = i.id
      ),
      '[]'::jsonb
    )
  )
  from public.invitations as i
  where i.id = p_invitation_id;
$$;

-- The only way in for guests: the code from their link. get_invitation itself
-- stays internal, so the UUID is never a second lookup path.
create or replace function public.get_invitation_by_code(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.get_invitation(i.id)
  from public.invitations as i
  where i.code = p_code;
$$;

create or replace function public.save_rsvp(
  p_invitation_id uuid,
  p_attending boolean,
  p_attends_reception boolean,
  p_attends_family_dinner boolean,
  p_attends_tornaboda boolean,
  p_attends_trip boolean,
  p_special_requirements text,
  p_message text,
  p_invitees jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if p_attending is null then
    raise exception using
      errcode = '22023',
      message = 'attending is required';
  end if;

  update public.invitations as i
  set
    attending = p_attending,
    attends_reception = case
      when i.is_gringo then coalesce(p_attends_reception, false)
      else false
    end,
    attends_family_dinner = case
      when i.is_family then coalesce(p_attends_family_dinner, false)
      else false
    end,
    attends_tornaboda = coalesce(p_attends_tornaboda, false),
    attends_trip = case
      when i.is_peer then coalesce(p_attends_trip, false)
      else false
    end,
    special_requirements = nullif(btrim(p_special_requirements), ''),
    message = nullif(btrim(p_message), ''),
    responded_at = now()
  where i.id = p_invitation_id;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'invitation not found';
  end if;

  perform public.replace_invitees(p_invitation_id, p_invitees);

  select public.get_invitation(p_invitation_id) into v_result;
  return v_result;
end;
$$;

create or replace function public.admin_get_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception using
      errcode = '42501',
      message = 'authentication required';
  end if;

  select jsonb_build_object(
    'summary', jsonb_build_object(
      -- Everything counts on attending, which is the answer itself: null means
      -- we do not know, true yes, false no. responded_at only records that a
      -- guest submitted the form, so it must not drive these numbers.
      'total_invitations', (select count(*) from public.invitations),
      'attending', (select count(*) from public.invitations where attending is true),
      'declined', (select count(*) from public.invitations where attending is false),
      'unknown', (select count(*) from public.invitations where attending is null),
      'attending_guests', (
        select count(*)
        from public.invitees as person
        join public.invitations as i on i.id = person.invitation_id
        where i.attending is true
      ),
      'vegetarian_guests', (
        select count(*)
        from public.invitees as person
        join public.invitations as i on i.id = person.invitation_id
        where i.attending is true and person.is_vegetarian is true
      ),
      'kid_guests', (
        select count(*)
        from public.invitees as person
        join public.invitations as i on i.id = person.invitation_id
        where i.attending is true and person.is_kid is true
      )
    ),
    'events', jsonb_build_object(
      'reception', (
        select jsonb_build_object(
          'count', count(person.id),
          'names', coalesce(
            jsonb_agg(person.name order by person.name) filter (where person.id is not null),
            '[]'::jsonb
          )
        )
        from public.invitations as i
        left join public.invitees as person on person.invitation_id = i.id
        where i.attending is true and i.attends_reception is true
      ),
      'family_dinner', (
        select jsonb_build_object(
          'count', count(person.id),
          'names', coalesce(
            jsonb_agg(person.name order by person.name) filter (where person.id is not null),
            '[]'::jsonb
          )
        )
        from public.invitations as i
        left join public.invitees as person on person.invitation_id = i.id
        where i.attending is true and i.attends_family_dinner is true
      ),
      'tornaboda', (
        select jsonb_build_object(
          'count', count(person.id),
          'names', coalesce(
            jsonb_agg(person.name order by person.name) filter (where person.id is not null),
            '[]'::jsonb
          )
        )
        from public.invitations as i
        left join public.invitees as person on person.invitation_id = i.id
        where i.attending is true and i.attends_tornaboda is true
      ),
      'trip', (
        select jsonb_build_object(
          'count', count(person.id),
          'names', coalesce(
            jsonb_agg(person.name order by person.name) filter (where person.id is not null),
            '[]'::jsonb
          )
        )
        from public.invitations as i
        left join public.invitees as person on person.invitation_id = i.id
        where i.attending is true and i.attends_trip is true
      )
    ),
    'vegetarians', (
      select jsonb_build_object(
        'count', count(person.id),
        'people', coalesce(
          jsonb_agg(
            jsonb_build_object(
              'id', person.id,
              'name', person.name,
              'invitation_id', i.id,
              'invitation_name', i.name,
              'diet_notes', person.diet_notes
            )
            order by person.name
          ) filter (where person.id is not null),
          '[]'::jsonb
        )
      )
      from public.invitees as person
      join public.invitations as i on i.id = person.invitation_id
      where i.attending is true and person.is_vegetarian is true
    ),
    'dietary_requirements', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', person.id,
            'name', person.name,
            'invitation_id', i.id,
            'invitation_name', i.name,
            'requirement', person.diet_notes
          )
          order by person.name
        ),
        '[]'::jsonb
      )
      from public.invitees as person
      join public.invitations as i on i.id = person.invitation_id
      where i.attending is true
        and nullif(btrim(person.diet_notes), '') is not null
    ),
    'special_requirements', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'invitation_id', i.id,
            'invitation_name', i.name,
            'requirement', i.special_requirements
          )
          order by i.name
        ),
        '[]'::jsonb
      )
      from public.invitations as i
      where i.attending is true
        and nullif(btrim(i.special_requirements), '') is not null
    ),
    'invitations', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', i.id,
            'code', i.code,
            'name', i.name,
            'relationship', i.relationship,
            'category', i.category,
            'invitation_time', i.invitation_time,
            'emails', i.emails,
            'attending', i.attending,
            'attends_reception', i.attends_reception,
            'attends_family_dinner', i.attends_family_dinner,
            'attends_tornaboda', i.attends_tornaboda,
            'attends_trip', i.attends_trip,
            'special_requirements', i.special_requirements,
            'message', i.message,
            'is_gringo', i.is_gringo,
            'is_family', i.is_family,
            'is_peer', i.is_peer,
            'responded_at', i.responded_at,
            'sent_at', i.sent_at,
            'created_at', i.created_at,
            'updated_at', i.updated_at,
            'invitees', coalesce(
              (
                select jsonb_agg(
                  jsonb_build_object(
                    'id', person.id,
                    'name', person.name,
                    'is_vegetarian', person.is_vegetarian,
                    'diet_notes', person.diet_notes,
                    'is_kid', person.is_kid,
                    'age', person.age,
                    'sort_order', person.sort_order
                  )
                  order by person.sort_order, person.id
                )
                from public.invitees as person
                where person.invitation_id = i.id
              ),
              '[]'::jsonb
            )
          )
          order by i.name
        ),
        '[]'::jsonb
      )
      from public.invitations as i
    ),
    'invitees', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', person.id,
            'name', person.name,
            'is_vegetarian', person.is_vegetarian,
            'diet_notes', person.diet_notes,
            'is_kid', person.is_kid,
            'age', person.age,
            'invitation_id', i.id,
            'invitation_name', i.name,
            'invitation_attending', i.attending,
            'invitation_category', i.category
          )
          order by person.name
        ),
        '[]'::jsonb
      )
      from public.invitees as person
      join public.invitations as i on i.id = person.invitation_id
    )
  ) into v_result;

  return v_result;
end;
$$;

-- The admin editor is authoritative: unlike save_rsvp it stores exactly what is
-- submitted, with no event eligibility gating, so an exception can be recorded
-- for a guest who is not normally invited to that event. It also never touches
-- responded_at, because an edit made on a guest's behalf is not that guest
-- responding.
create or replace function public.admin_create_invitation(
  p_name text,
  p_relationship text,
  p_category text,
  p_invitation_time text,
  p_emails text,
  p_is_gringo boolean,
  p_is_family boolean,
  p_is_peer boolean,
  p_attending boolean,
  p_attends_reception boolean,
  p_attends_family_dinner boolean,
  p_attends_tornaboda boolean,
  p_attends_trip boolean,
  p_special_requirements text,
  p_message text,
  p_invitees jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation_id uuid;
  v_code text;
begin
  if auth.uid() is null then
    raise exception using
      errcode = '42501',
      message = 'authentication required';
  end if;

  if nullif(btrim(p_name), '') is null then
    raise exception using
      errcode = '22023',
      message = 'name is required';
  end if;

  insert into public.invitations (
    name,
    relationship,
    category,
    invitation_time,
    emails,
    is_gringo,
    is_family,
    is_peer,
    attending,
    attends_reception,
    attends_family_dinner,
    attends_tornaboda,
    attends_trip,
    special_requirements,
    message
  )
  values (
    btrim(p_name),
    coalesce(btrim(p_relationship), ''),
    nullif(btrim(p_category), ''),
    nullif(btrim(p_invitation_time), '')::time,
    nullif(btrim(p_emails), ''),
    coalesce(p_is_gringo, false),
    coalesce(p_is_family, false),
    coalesce(p_is_peer, false),
    p_attending,
    coalesce(p_attends_reception, false),
    coalesce(p_attends_family_dinner, false),
    coalesce(p_attends_tornaboda, false),
    coalesce(p_attends_trip, false),
    nullif(btrim(p_special_requirements), ''),
    nullif(btrim(p_message), '')
  )
  returning id, code into v_invitation_id, v_code;

  perform public.replace_invitees(v_invitation_id, p_invitees);

  return jsonb_build_object(
    'id', v_invitation_id,
    'code', v_code,
    'name', btrim(p_name)
  );
end;
$$;

create or replace function public.admin_update_invitation(
  p_invitation_id uuid,
  p_name text,
  p_relationship text,
  p_category text,
  p_invitation_time text,
  p_emails text,
  p_is_gringo boolean,
  p_is_family boolean,
  p_is_peer boolean,
  p_attending boolean,
  p_attends_reception boolean,
  p_attends_family_dinner boolean,
  p_attends_tornaboda boolean,
  p_attends_trip boolean,
  p_special_requirements text,
  p_message text,
  p_invitees jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception using
      errcode = '42501',
      message = 'authentication required';
  end if;

  if nullif(btrim(p_name), '') is null then
    raise exception using
      errcode = '22023',
      message = 'name is required';
  end if;

  update public.invitations as i
  set
    name = btrim(p_name),
    relationship = coalesce(btrim(p_relationship), ''),
    category = nullif(btrim(p_category), ''),
    invitation_time = nullif(btrim(p_invitation_time), '')::time,
    emails = nullif(btrim(p_emails), ''),
    is_gringo = coalesce(p_is_gringo, false),
    is_family = coalesce(p_is_family, false),
    is_peer = coalesce(p_is_peer, false),
    attending = p_attending,
    attends_reception = coalesce(p_attends_reception, false),
    attends_family_dinner = coalesce(p_attends_family_dinner, false),
    attends_tornaboda = coalesce(p_attends_tornaboda, false),
    attends_trip = coalesce(p_attends_trip, false),
    special_requirements = nullif(btrim(p_special_requirements), ''),
    message = nullif(btrim(p_message), '')
    -- responded_at is deliberately untouched.
  where i.id = p_invitation_id;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'invitation not found';
  end if;

  perform public.replace_invitees(p_invitation_id, p_invitees);

  return jsonb_build_object(
    'id', p_invitation_id,
    'name', btrim(p_name)
  );
end;
$$;

create or replace function public.admin_mark_invitation_sent(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception using
      errcode = '42501',
      message = 'authentication required';
  end if;

  update public.invitations as i
  set sent_at = now()
  where i.id = p_invitation_id;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'invitation not found';
  end if;
end;
$$;

-- Functions are executable by PUBLIC by default, so make access explicit.
revoke all on function public.set_updated_at() from public;
revoke all on function public.generate_invitation_code() from public;
revoke all on function public.get_invitation_by_code(text) from public;
revoke all on function public.replace_invitees(uuid, jsonb) from public;
revoke all on function public.get_invitation(uuid) from public;
revoke all on function public.save_rsvp(uuid, boolean, boolean, boolean, boolean, boolean, text, text, jsonb) from public;
revoke all on function public.admin_get_dashboard() from public;
revoke all on function public.admin_create_invitation(text, text, text, text, text, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, text, text, jsonb) from public;
revoke all on function public.admin_update_invitation(uuid, text, text, text, text, text, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, text, text, jsonb) from public;
revoke all on function public.admin_mark_invitation_sent(uuid) from public;

grant execute on function public.get_invitation_by_code(text) to anon, authenticated;
grant execute on function public.save_rsvp(uuid, boolean, boolean, boolean, boolean, boolean, text, text, jsonb) to anon, authenticated;
grant execute on function public.admin_get_dashboard() to authenticated;
grant execute on function public.admin_create_invitation(text, text, text, text, text, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, text, text, jsonb) to authenticated;
grant execute on function public.admin_update_invitation(uuid, text, text, text, text, text, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, text, text, jsonb) to authenticated;
grant execute on function public.admin_mark_invitation_sent(uuid) to authenticated;

-- RSVP notification emails. save_rsvp stamps responded_at on every autosave, so
-- rather than emailing per save, a cron job reports each invitation once it has
-- been quiet for a while. notified_at holds the responded_at that was reported,
-- so a later guest edit is picked up by a following run, while admin edits,
-- which leave responded_at alone, never send anything.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create or replace function public.pending_rsvp_notifications(p_quiet_for interval)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      public.get_invitation(i.id) || jsonb_build_object('notified_at', i.notified_at)
      order by i.responded_at
    ),
    '[]'::jsonb
  )
  from public.invitations as i
  where i.responded_at is not null
    and (i.notified_at is null or i.responded_at > i.notified_at)
    and i.responded_at < now() - p_quiet_for;
$$;

-- Takes the ids and responded_at values exactly as they were read, so an edit
-- that lands while the email is sending is still reported by the next run.
create or replace function public.mark_rsvps_notified(p_reported jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.invitations as i
  set notified_at = (reported.item ->> 'responded_at')::timestamptz
  from jsonb_array_elements(p_reported) as reported(item)
  where i.id = (reported.item ->> 'id')::uuid;
$$;

-- The function URL and shared secret differ per environment, so they live in
-- Vault rather than here. Until both exist the job does nothing.
create or replace function public.invoke_notify_rsvps()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url
  from vault.decrypted_secrets
  where name = 'notify_rsvps_url';

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'notify_rsvps_secret';

  if v_url is null or v_secret is null then
    return;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-notify-secret', v_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end;
$$;

revoke all on function public.pending_rsvp_notifications(interval) from public;
revoke all on function public.mark_rsvps_notified(jsonb) from public;
revoke all on function public.invoke_notify_rsvps() from public;

select cron.schedule(
  'notify-rsvps',
  '*/5 * * * *',
  'select public.invoke_notify_rsvps()'
);
