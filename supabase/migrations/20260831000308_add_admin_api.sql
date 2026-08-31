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
      'total_invitations', (select count(*) from public.invitations),
      'responded', (select count(*) from public.invitations where responded_at is not null),
      'attending', (select count(*) from public.invitations where attending is true),
      'declined', (select count(*) from public.invitations where attending is false),
      'pending', (select count(*) from public.invitations where responded_at is null),
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
            'name', i.name,
            'relationship', i.relationship,
            'email', i.email,
            'phone', i.phone,
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
            'invitation_id', i.id,
            'invitation_name', i.name,
            'invitation_attending', i.attending
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

create or replace function public.admin_create_invitation(
  p_name text,
  p_relationship text,
  p_email text,
  p_phone text,
  p_is_gringo boolean,
  p_is_family boolean,
  p_is_peer boolean,
  p_invitees jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation_id uuid;
  v_invitees jsonb := coalesce(p_invitees, '[]'::jsonb);
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

  if nullif(btrim(p_relationship), '') is null then
    raise exception using
      errcode = '22023',
      message = 'relationship is required';
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

  insert into public.invitations (
    name,
    relationship,
    email,
    phone,
    is_gringo,
    is_family,
    is_peer
  )
  values (
    btrim(p_name),
    btrim(p_relationship),
    nullif(btrim(p_email), ''),
    nullif(btrim(p_phone), ''),
    coalesce(p_is_gringo, false),
    coalesce(p_is_family, false),
    coalesce(p_is_peer, false)
  )
  returning id into v_invitation_id;

  insert into public.invitees (
    invitation_id,
    name,
    is_vegetarian,
    diet_notes,
    sort_order
  )
  select
    v_invitation_id,
    btrim(submitted.person ->> 'name'),
    coalesce((submitted.person ->> 'is_vegetarian')::boolean, false),
    nullif(btrim(submitted.person ->> 'diet_notes'), ''),
    (submitted.position - 1)::integer
  from jsonb_array_elements(v_invitees) with ordinality
    as submitted(person, position);

  return jsonb_build_object(
    'id', v_invitation_id,
    'name', btrim(p_name)
  );
end;
$$;

revoke all on function public.admin_get_dashboard() from public;
revoke all on function public.admin_create_invitation(text, text, text, text, boolean, boolean, boolean, jsonb) from public;

grant execute on function public.admin_get_dashboard() to authenticated;
grant execute on function public.admin_create_invitation(text, text, text, text, boolean, boolean, boolean, jsonb) to authenticated;
