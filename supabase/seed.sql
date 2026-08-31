-- Fixed UUIDs make local invitation links stable across database resets.
insert into public.invitations (
  id,
  name,
  relationship,
  is_gringo,
  is_family,
  is_peer
)
values
  (
    '10000000-0000-4000-8000-000000000001',
    'Jim Farnam & Marcy Stovall',
    'Beloved Parents of the Groom',
    true,
    true,
    false
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    'Elsa Rose',
    'Beloved Sister of the Groom',
    true,
    true,
    true
  ),
  (
    '10000000-0000-4000-8000-000000000003',
    'Alice Fordham',
    'Beloved Friend of the Groom',
    true,
    false,
    true
  );

insert into public.invitees (
  id,
  invitation_id,
  name,
  sort_order
)
values
  (
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'Jim Farnam',
    0
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    'Marcy Stovall',
    1
  ),
  (
    '20000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000002',
    'Elsa Rose',
    0
  ),
  (
    '20000000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000003',
    'Alice Fordham',
    0
  );
