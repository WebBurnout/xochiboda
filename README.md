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

Display the loaded invitation name, arrival time, and RSVP form with:

```html
<invitation-name></invitation-name>
<invitation-time></invitation-time>
<invitation-form></invitation-form>
```

`<invitation-time>` renders the invitation's staggered arrival time. The column
is a Postgres `time`, so it arrives as `15:30:00`; `js/format.js` formats it as
`3:30 PM` for every guest regardless of browser locale.

The yes and no attendance buttons in `<invitation-form>` carry a `data-state` of
`true` (it is the answer), `false` (the other button is the answer), or
`indeterminate` (no answer yet), so CSS can style unanswered buttons differently
from the one that was not chosen:

```css
.attendance-button[data-state="false"] { opacity: 0.5; }
```

## Language

Spanish is the default and English is opt-in, decided once in `js/language.js`:

```js
export const isEnglish = navigator.language.startsWith('en')

if (isEnglish) {
  document.documentElement.lang = 'en'
}
```

The same flag selects the `copy` object that `invitation.js` renders the RSVP
form from, so the `lang` attribute and the rendered strings can never disagree.

Because `invitation.js` is a module it is deferred, so Spanish markup paints
before the swap to English. Any Spanish text kept in the static HTML will flash
for English speakers. To avoid that, repeat the two lines as a blocking inline
script in `<head>`, before any content:

```html
<script>
  if (navigator.language.startsWith('en')) document.documentElement.lang = 'en'
</script>
```

## Invitation classes

Once an invitation loads, its group flags are mirrored onto the root element so
static markup can show and hide sections with plain CSS:

```text
is_gringo  is_family  is_peer
```

They are removed again when no invitation loads. Conditions that are derived
rather than stored are expressed in CSS, for example gringos who are not family:

```css
.is_gringo:not(.is_family) .some-section { display: block; }
```

Note these use underscores to match the database columns, while the loading
states on the same element use hyphens (`is-loading`, `is-not-found`).

## Linking to a stored invitation

`js/invitation-link.js` renders a link to whichever invitation the visitor last
opened, read from `localStorage`:

```html
<script type="module" src="/invitation-link.js"></script>

<invitation-link></invitation-link>
```

It links to `/invitation` with a translated label. It is deliberately
separate from `invitation.js`, which fetches an invitation on import and would
mark a homepage as not-found. When nothing is stored the element renders
nothing, and `has_invitation` is added to the root element only when there is a
stored invitation, so a surrounding block can be hidden too.

Add `is-loading` to the root HTML element in the static markup. The invitation module removes it after a successful load. Missing or invalid invitations remove `is-loading` and add `is-not-found`:

```html
<html class="is-loading">
```

Invitation links use the UUID query parameter:

```text
https://localhost:8443/?id=INVITATION_UUID
```

Start the server:

```bash
npm run dev
```

Then open `https://localhost:8443`. The server disables browser caching during development. It only serves the static site; it does not start Supabase or run database migrations.

## Database

Supabase migrations are tracked in `supabase/migrations/`. While the seed list is
still being finalized there is a single migration,
`20260827182251_create_schema.sql`, holding the whole data model: both tables and
the four RPC functions. Reading that one file is the fastest way to see the
current schema.

Start the local Supabase containers and apply the migrations locally:

```bash
npm run supabase:start
```

This requires Docker and does not modify the linked hosted project.

Rebuild the local database from the migrations and load `supabase/seed.sql`, which only creates the Vault secrets. The database has no invitations until you load `seed.csv`:

```bash
npx supabase db reset
npm run seed
```

### Loading `seed.csv`

`seed.csv` is ignored by Git. With local Supabase running, replace the local invitation and invitee data with the CSV contents:

```bash
npm run seed
```

The loader expects these columns:

```text
name,relationship,category,all_names,is_gringo,is_family,is_peer,time,emails
```

`category`, `time`, and `emails` are optional. `emails` is stored as-is, so several addresses can share one comma-separated cell. `all_names` is split on commas into invitee rows. Boolean columns accept `X`, `yes`, `true`, or `1`.

`category` is an admin-only grouping (`Family`, `New York`, `Lúcido`, and so on). It is shown in the admin invitations table and rolled up into per-category counts.

`time` is the arrival time printed on that invitation, written as `2:00 PM`. Postgres parses it into the `invitation_time` column.

The operation is transactional but destructive: it truncates existing invitations and invitees before loading the CSV, so rerunning it does not create duplicates. It defaults to the local database and refuses remote databases unless `ALLOW_REMOTE_SEED=true` is explicitly set.

To apply pending migrations to the linked hosted project deliberately, run:

```bash
npx supabase db push --remote
```

### Dropping and replacing

While the seed list is still being finalized the schema is edited in place in
`supabase/migrations/` rather than with new migrations, so the database has to be
rebuilt instead of migrated.

Locally that is just a reset followed by the CSV load:

```bash
npx supabase db reset
npm run seed
```

The hosted project records which migration versions it has already applied, so
an edited migration will **not** be re-run by `db push`. To rebuild it, reset the
remote database and then push:

```bash
npx supabase db reset --remote
npx supabase db push --remote
```

This destroys all hosted data, including any RSVPs already submitted, and
regenerates every invitation UUID, which breaks links that have already been
shared. Once the seed list is final, stop editing migrations in place and add
new ones instead.

## Admin

The admin page is available locally at `https://localhost:8443/admin.html` and uses the `<xochiboda-admin>` element from `js/admin.js`.

Before signing in:

1. In **Supabase Dashboard → Authentication → Providers → Email**, enable email/password authentication and disable new-user signup.
2. In **Authentication → Users**, manually create and confirm your admin user.
3. Apply the schema migration locally or to the hosted project as described above.

Every manually created authenticated user can access the admin RPC functions. Anonymous users retain no direct table access.

### Editing invitations

**New invitation** in the header opens a blank editor, and **Edit** on any row of
the invitations table opens the same modal for that invitation. Both cover every
field: the groups, the RSVP, the events, the invitation time and category, and
the full guest list with vegetarian, kid, age, and dietary notes.

One thing behaves differently from the guest-facing form: **event eligibility is
not enforced.** `save_rsvp` clears events a guest is not eligible for, but the
admin editor stores exactly what is submitted so exceptions can be recorded. The
editor labels those checkboxes *not normally eligible*, and the invitations table
shows such a value as *Yes (override)*.

Saving replaces the invitation's invitee rows wholesale, exactly as an RSVP does.

### The three answer states

`invitations.attending` is the single source of the answer, and it is a nullable
boolean holding exactly three states:

| `attending` | meaning |
| --- | --- |
| `null` | we don't know |
| `true` | yes |
| `false` | no |

The summary tiles, the per-category rollup, and the Attending / Declined / No
answer sections of the invitations table all count on `attending`, so an answer
you enter in the admin counts exactly like one a guest submitted.

`responded_at` is not a status flag. It only records that a guest submitted the
form themselves, and nothing counts or groups by it. `save_rsvp` sets it; the two
admin functions deliberately leave it alone. It stays visible in the *Responded*
column as a timestamp, which is empty for invitations you filled in yourself.

## RSVP notifications

The RSVP form autosaves, so emailing on every save would send dozens of emails
per guest. Instead the `notify-rsvps` cron job runs every five minutes and calls
the `notify-rsvps` edge function, which sends one email per invitation a guest
has saved and then left alone for fifteen minutes. The first email says the
guest *confirmed* or *can't make it*; later ones say they *updated their RSVP*.

It keys off `responded_at`, which only `save_rsvp` sets, so edits made in the
admin never send email. `notified_at` stores the `responded_at` that was last
reported, and it is only written after that invitation's email sends, so a
failed send is retried on the next run without resending the others.

The edge function reads these secrets:

| name | value |
| --- | --- |
| `NOTIFY_RSVPS_SECRET` | shared secret the cron job sends in `x-notify-secret` |
| `RESEND_API_KEY` | [Resend](https://resend.com) API key |
| `NOTIFY_DRY_RUN` | `true` logs the email instead of sending it |

The sender and recipients are set at the top of
`supabase/functions/notify-rsvps/index.ts`; `squids.online` must be verified in
Resend.

The cron job reads the function URL and the same shared secret from Vault, and
does nothing until both exist.

### Local

`supabase/seed.sql` creates the Vault secrets, so after `npx supabase db reset`
only the function needs its own:

```bash
cp supabase/functions/.env.example supabase/functions/.env
```

That file is ignored by Git and defaults to a dry run, so the email appears in
the edge runtime logs (`npx supabase functions serve` shows them).

### Hosted

Pick a long random secret, then set the function secrets and deploy:

```bash
npx supabase secrets set NOTIFY_RSVPS_SECRET=... RESEND_API_KEY=...
npx supabase functions deploy notify-rsvps
```

Then create the Vault secrets in the SQL editor, using the same secret:

```sql
select vault.create_secret(
  'https://PROJECT_REF.supabase.co/functions/v1/notify-rsvps',
  'notify_rsvps_url'
);
select vault.create_secret('...', 'notify_rsvps_secret');
```

`npx supabase db reset --remote` wipes these Vault secrets along with
everything else, so create them again after a rebuild.

