# Xochiboda

Static wedding invitation and RSVP site backed by Supabase.

## Setup

Install the development dependencies:

```bash
npm install
```

The HTTPS development server expects these locally trusted certificate files in the repository root:

```text
localhost.pem
localhost-key.pem
```

If they need to be regenerated with `mkcert`:

```bash
mkcert -cert-file localhost.pem -key-file localhost-key.pem localhost 127.0.0.1 ::1
```

The certificate files are intentionally ignored by Git.

## Development server

Place the static site files in `js/`, with the entry page at `js/index.html`. Load the invitation module:

```html
<script type="module" src="/invitation.js"></script>
```

The shared local and production Supabase settings live in `js/config.js`. It uses `import.meta.url` to select local settings when loaded from `localhost`, `127.0.0.1`, or `::1`. Both `invitation.js` and `admin.js` import this configuration. Never use a secret or service-role key in browser code.

Display the loaded invitation name and RSVP form with:

```html
<invitation-name></invitation-name>
<invitation-form></invitation-form>
```

Add `is-loading` to the root HTML element in the static markup. The invitation module removes it after a successful load. Missing or invalid invitations remove `is-loading` and add `is-not-found`:

```html
<html class="is-loading">
```

Invitation links use the UUID query parameter:

```text
https://localhost:8443/?invitation=INVITATION_UUID
```

Start the server:

```bash
npm run dev
```

Then open `https://localhost:8443`. The server disables browser caching during development. It only serves the static site; it does not start Supabase or run database migrations.

## Database

Supabase migrations are tracked in `supabase/migrations/`.

Start the local Supabase containers and apply the migrations locally:

```bash
npm run supabase:start
```

This requires Docker and does not modify the linked hosted project.

Rebuild the local database from the migrations and load `supabase/seed.sql`:

```bash
npx supabase db reset
```

The sample invitations use fixed UUIDs, so their local links remain stable across resets. For example:

```text
https://localhost:8443/?invitation=10000000-0000-4000-8000-000000000001
```

### Loading `seed.csv`

`seed.csv` is ignored by Git. With local Supabase running, replace the local invitation and invitee data with the CSV contents:

```bash
npm run seed
```

The loader expects these columns:

```text
name,relationship,all_names,is_gringo,is_family,is_peer,email,phone
```

`email` and `phone` are optional. `all_names` is split on commas into invitee rows. Boolean columns accept `X`, `yes`, `true`, or `1`.

The operation is transactional but destructive: it truncates existing invitations and invitees before loading the CSV, so rerunning it does not create duplicates. It defaults to the local database and refuses remote databases unless `ALLOW_REMOTE_SEED=true` is explicitly set.

To apply pending migrations to the linked hosted project deliberately, run:

```bash
npx supabase db push
```

## Admin

The admin page is available locally at `https://localhost:8443/admin.html` and uses the `<xochiboda-admin>` element from `js/admin.js`.

Before signing in:

1. In **Supabase Dashboard → Authentication → Providers → Email**, enable email/password authentication and disable new-user signup.
2. In **Authentication → Users**, manually create and confirm your admin user.
3. Apply the `add_admin_api` migration locally or to the hosted project as described above.

Every manually created authenticated user can access the admin RPC functions. Anonymous users retain no direct table access.
