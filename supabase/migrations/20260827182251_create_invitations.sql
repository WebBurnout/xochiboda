create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  relationship text not null,
  email text,
  phone text,

  attending boolean,
  attends_reception boolean not null default false,
  attends_family_dinner boolean not null default false,
  attends_tornaboda boolean not null default false,
  attends_trip boolean not null default false,
  wants_party_house boolean not null default false,

  special_requirements text,
  message text,
  is_gringo boolean not null default false,
  is_family boolean not null default false,
  is_peer boolean not null default false,

  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.invitees (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.invitations(id) on delete cascade,
  name text not null,
  is_vegetarian boolean not null default false,
  diet_notes text,
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
    'name', i.name,
    'relationship', i.relationship,
    'attending', i.attending,
    'attends_reception', i.attends_reception,
    'attends_family_dinner', i.attends_family_dinner,
    'attends_tornaboda', i.attends_tornaboda,
    'attends_trip', i.attends_trip,
    'wants_party_house', i.wants_party_house,
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

create or replace function public.save_rsvp(
  p_invitation_id uuid,
  p_attending boolean,
  p_attends_reception boolean,
  p_attends_family_dinner boolean,
  p_attends_tornaboda boolean,
  p_attends_trip boolean,
  p_wants_party_house boolean,
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
  v_invitees jsonb := coalesce(p_invitees, '[]'::jsonb);
  v_result jsonb;
begin
  if p_attending is null then
    raise exception using
      errcode = '22023',
      message = 'attending is required';
  end if;

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
    wants_party_house = case
      when i.is_gringo and not i.is_family then coalesce(p_wants_party_house, false)
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

  delete from public.invitees as person
  where person.invitation_id = p_invitation_id;

  insert into public.invitees (
    invitation_id,
    name,
    is_vegetarian,
    diet_notes,
    sort_order
  )
  select
    p_invitation_id,
    btrim(submitted.person ->> 'name'),
    coalesce((submitted.person ->> 'is_vegetarian')::boolean, false),
    nullif(btrim(submitted.person ->> 'diet_notes'), ''),
    submitted.position - 1
  from jsonb_array_elements(v_invitees) with ordinality
    as submitted(person, position);

  select public.get_invitation(p_invitation_id) into v_result;
  return v_result;
end;
$$;

-- Functions are executable by PUBLIC by default, so make access explicit.
revoke all on function public.set_updated_at() from public;
revoke all on function public.get_invitation(uuid) from public;
revoke all on function public.save_rsvp(uuid, boolean, boolean, boolean, boolean, boolean, boolean, text, text, jsonb) from public;

grant execute on function public.get_invitation(uuid) to anon, authenticated;
grant execute on function public.save_rsvp(uuid, boolean, boolean, boolean, boolean, boolean, boolean, text, text, jsonb) to anon, authenticated;
