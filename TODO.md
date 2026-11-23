





upload JS

change scripts







dress code gallery

test on iphone for #background issue

test everything on phone

seed list:
fix times
finish all the names possible
add all the emails
final upload of the list

show abril:
translations in HP and JS
should we remove the weather question?


confetti slightly bigger


















## send it
commit and deploy with: npx supabase functions deploy notify-rsvps

send to Carlos for the design and checking on devices
send to the writers first: Lisa, Moira, Liz






## email sends
do we still have NOTIFY_FROM and NOTIFY_TO?

supabase/functions/.env.example: the local function settings, defaulting to dry run.

```
npx supabase secrets set NOTIFY_RSVPS_SECRET= RESEND_API_KEY=


```
npx supabase functions deploy notify-rsvps
```

`supabase/seed.sql` creates the Vault secrets, so after `npx supabase db reset`
only the function needs its own:

```bash
cp supabase/functions/.env.example supabase/functions/.env
```

That file is ignored by Git and defaults to a dry run, so the email appears in
the edge runtime logs (`npx supabase functions serve` shows them).





## Supabase

dev login: twfarnam@gmail.com / xochiboda-dev




