// Emails each RSVP that has gone quiet. The notify-rsvps cron job calls this
// every five minutes; see "RSVP notifications" in the README.
import postgres from 'npm:postgres@3.4.5'

// How long an invitation must go without a guest save before it is reported,
// so a guest still typing into the autosaving form produces a single email.
const QUIET_FOR = '15 minutes'

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false })

const notifySecret = Deno.env.get('NOTIFY_RSVPS_SECRET')
const resendApiKey = Deno.env.get('RESEND_API_KEY')
const from = 'Xochiboda <xochiboda@squids.online>'
const to = ['twfarnam@gmail.com', 'abrilcamacho128@gmail.com']
// Logs the email instead of sending it, for local development.
const dryRun = Deno.env.get('NOTIFY_DRY_RUN') === 'true'

type Invitee = {
  name: string
  is_vegetarian: boolean
  diet_notes: string | null
  is_kid: boolean
  age: number | null
}

type Invitation = {
  id: string
  name: string
  relationship: string
  attending: boolean | null
  attends_reception: boolean
  attends_family_dinner: boolean
  attends_tornaboda: boolean
  attends_trip: boolean
  special_requirements: string | null
  message: string | null
  is_gringo: boolean
  is_family: boolean
  is_peer: boolean
  responded_at: string
  notified_at: string | null
  invitees: Invitee[]
}

function yesNo(value: boolean | null) {
  if (value === null) return 'no answer'
  return value ? 'yes' : 'no'
}

function orNone(value: string | null) {
  return value?.trim() ? value : '(none)'
}

function describeInvitee(person: Invitee, index: number) {
  return [
    `  ${index + 1}. ${person.name}`,
    `     Vegetarian: ${yesNo(person.is_vegetarian)}`,
    `     Diet notes: ${orNone(person.diet_notes)}`,
    `     Kid: ${yesNo(person.is_kid)}`,
    `     Age: ${person.age ?? '(none)'}`,
  ]
}

// Lists every event, flagging the ones the guest was never asked about so a
// "no" there isn't mistaken for a decline.
function describeEvent(label: string, eligible: boolean, attends: boolean) {
  return `  ${label}: ${yesNo(attends)}${eligible ? '' : ' (not invited)'}`
}

// Spells out every field the guest can answer, not only the ones that are set.
function describeInvitation(invitation: Invitation) {
  const groups = [
    invitation.is_gringo && 'gringo',
    invitation.is_family && 'family',
    invitation.is_peer && 'peer',
  ].filter(Boolean)

  return [
    `Invitation: ${invitation.name}`,
    `Relationship: ${invitation.relationship}`,
    `Groups: ${groups.length ? groups.join(', ') : '(none)'}`,
    `Responded at: ${new Date(invitation.responded_at).toUTCString()}`,
    '',
    `Attending: ${yesNo(invitation.attending)}`,
    '',
    'Events:',
    describeEvent('Family dinner', invitation.is_family, invitation.attends_family_dinner),
    describeEvent('Reception', invitation.is_gringo, invitation.attends_reception),
    describeEvent('Tornaboda', true, invitation.attends_tornaboda),
    describeEvent('Trip', invitation.is_peer, invitation.attends_trip),
    '',
    `Guests (${invitation.invitees.length}):`,
    ...(invitation.invitees.length
      ? invitation.invitees.flatMap(describeInvitee)
      : ['  (none)']),
    '',
    `Special requirements: ${orNone(invitation.special_requirements)}`,
    `Message: ${orNone(invitation.message)}`,
  ].join('\n')
}

// An invitation that was reported before is an update, whatever it now says.
function buildSubject(invitation: Invitation) {
  if (invitation.notified_at) return `${invitation.name} updated their RSVP`
  if (invitation.attending) return `${invitation.name} confirmed`
  return `${invitation.name} can't make it`
}

function buildEmail(invitation: Invitation) {
  return {
    subject: buildSubject(invitation),
    text: describeInvitation(invitation),
  }
}

async function sendEmail(email: { subject: string, text: string }) {
  if (!resendApiKey) throw new Error('RESEND_API_KEY must be set')

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, ...email }),
  })

  if (!response.ok) {
    throw new Error(`Resend failed (${response.status}): ${await response.text()}`)
  }
}

Deno.serve(async (request) => {
  if (!notifySecret || request.headers.get('x-notify-secret') !== notifySecret) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const [{ pending }] = await sql<{ pending: Invitation[] }[]>`
      select public.pending_rsvp_notifications(${QUIET_FOR}::interval) as pending
    `

    // Each invitation is marked only after its own email sends, so a failure
    // is retried next run without resending the others.
    let reported = 0
    const failures: string[] = []

    for (const invitation of pending) {
      const email = buildEmail(invitation)

      try {
        if (dryRun) {
          console.log(`${email.subject}\n\n${email.text}`)
        } else {
          await sendEmail(email)
        }
      } catch (error) {
        console.error(error)
        failures.push(invitation.name)
        continue
      }

      const { id, responded_at } = invitation
      await sql`select public.mark_rsvps_notified(${sql.json([{ id, responded_at }])})`
      reported++
    }

    if (failures.length) {
      return Response.json({ reported, failed: failures }, { status: 500 })
    }

    return Response.json({ reported })
  } catch (error) {
    console.error(error)
    return new Response(error instanceof Error ? error.message : 'Failed', { status: 500 })
  }
})
