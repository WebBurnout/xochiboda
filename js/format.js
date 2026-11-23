// The database stores invitation_time as a `time` column, so it arrives as
// "14:00:00". Guests should always see it as "2:00 PM", never a locale variant.
export function formatInvitationTime(value) {
  if (!value) return ''

  const [rawHours, rawMinutes] = String(value).split(':')
  const hours = Number(rawHours)
  const minutes = Number(rawMinutes)

  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return ''

  const period = hours < 12 ? 'AM' : 'PM'
  const displayHours = hours % 12 === 0 ? 12 : hours % 12

  return `${displayHours}:${String(minutes).padStart(2, '0')} ${period}`
}
