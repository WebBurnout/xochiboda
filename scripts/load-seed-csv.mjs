import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { parse } from 'csv-parse/sync'
import pg from 'pg'

const { Client } = pg
const csvPath = fileURLToPath(new URL('../seed.csv', import.meta.url))
const connectionString = process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const databaseHost = new URL(connectionString).hostname
const isLocalDatabase = ['localhost', '127.0.0.1', '::1'].includes(databaseHost)

if (!isLocalDatabase && process.env.ALLOW_REMOTE_SEED !== 'true') {
  throw new Error(
    'Refusing to replace data in a remote database. Set ALLOW_REMOTE_SEED=true explicitly.',
  )
}

// The vegetarians are tracked by hand rather than in seed.csv. Every name here
// must match an invitee, so a rename in the CSV fails the load instead of
// silently serving someone meat.
const VEGETARIANS = [
  'Marcy Stovall',
  'Jorge Valencia',
  'Elsa Rose Farnam',
  'Helena Puig',
  'Mizael Peregrina Rojas',
  'Matt Kline',
]

function vegetarianKey(name) {
  return String(name ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
}

function booleanValue(value) {
  return ['1', 'true', 'yes', 'y', 'x'].includes(String(value ?? '').trim().toLowerCase())
}

function optionalValue(value) {
  const result = String(value ?? '').trim()
  return result || null
}

function inviteeNames(value) {
  return String(value ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)
}

const csv = await readFile(csvPath, 'utf8')
const records = parse(csv, {
  bom: true,
  columns: true,
  skip_empty_lines: true,
  trim: true,
})

for (const [index, record] of records.entries()) {
  if (!record.name?.trim()) throw new Error(`Row ${index + 2}: name is required.`)
}

const vegetarianKeys = new Set(VEGETARIANS.map(vegetarianKey))
const allSeedNames = records.flatMap((record) => inviteeNames(record.all_names))
const seedNames = new Set(allSeedNames.map(vegetarianKey))
const missingVegetarians = VEGETARIANS.filter((name) => !seedNames.has(vegetarianKey(name)))

// A missing vegetarian is usually a spelling drift rather than a real absence,
// so point at the likely candidates instead of only naming the failure.
function similarSeedNames(name) {
  const parts = vegetarianKey(name).split(' ')
  return allSeedNames.filter((candidate) => {
    const candidateParts = vegetarianKey(candidate).split(' ')
    return parts.some((part) => candidateParts.some((other) =>
      other === part || other.startsWith(part) || part.startsWith(other),
    ))
  })
}

// Checked before connecting so a bad list never truncates the existing data.
if (missingVegetarians.length > 0) {
  const details = missingVegetarians.map((name) => {
    const suggestions = similarSeedNames(name)
    return suggestions.length > 0
      ? `  ${name} — did you mean: ${suggestions.join(', ')}?`
      : `  ${name} — no similar name in seed.csv.`
  })

  throw new Error(
    `These vegetarians are not in seed.csv:\n${details.join('\n')}\n` +
    'Fix the name in seed.csv or in VEGETARIANS so the two agree.',
  )
}

const client = new Client({ connectionString })
await client.connect()

try {
  await client.query('begin')

  // This loader is intentionally a replacement operation so rerunning it does
  // not create duplicate invitations.
  await client.query('truncate table public.invitations cascade')

  let inviteeCount = 0

  for (const record of records) {
    const invitation = await client.query(
      `insert into public.invitations (
        name,
        relationship,
        category,
        invitation_time,
        emails,
        is_gringo,
        is_family,
        is_peer
      ) values ($1, $2, $3, $4::time, $5, $6, $7, $8)
      returning id`,
      [
        record.name.trim(),
        String(record.relationship ?? '').trim(),
        optionalValue(record.category),
        optionalValue(record.time),
        optionalValue(record.emails),
        booleanValue(record.is_gringo),
        booleanValue(record.is_family),
        booleanValue(record.is_peer),
      ],
    )

    const invitationId = invitation.rows[0].id
    const names = inviteeNames(record.all_names)

    for (const [sortOrder, name] of names.entries()) {
      await client.query(
        `insert into public.invitees (
          invitation_id,
          name,
          is_vegetarian,
          sort_order
        ) values ($1, $2, $3, $4)`,
        [invitationId, name, vegetarianKeys.has(vegetarianKey(name)), sortOrder],
      )
      inviteeCount += 1
    }
  }

  await client.query('commit')
  console.log(
    `Loaded ${records.length} invitations and ${inviteeCount} invitees from seed.csv, ` +
    `including ${VEGETARIANS.length} vegetarians.`,
  )
} catch (error) {
  await client.query('rollback')
  throw error
} finally {
  await client.end()
}
