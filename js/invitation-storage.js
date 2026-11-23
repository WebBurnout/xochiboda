// The stored invitation id is shared by the invitation page and by the homepage
// link, so the key and its validation live in one place.
export const INVITATION_STORAGE_KEY = 'xochiboda.invitationId'
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Returns null and clears the key when the stored value is not a UUID, so a
// stale or hand-edited entry can never build a broken link.
export function storedInvitationId() {
  const invitationId = localStorage.getItem(INVITATION_STORAGE_KEY)
  if (!invitationId) return null

  if (!UUID_PATTERN.test(invitationId)) {
    localStorage.removeItem(INVITATION_STORAGE_KEY)
    return null
  }

  return invitationId
}

export function rememberInvitationId(invitationId) {
  localStorage.setItem(INVITATION_STORAGE_KEY, invitationId)
}

export function invitationPath(invitationId, path = '/invitation') {
  return `${path}?id=${encodeURIComponent(invitationId)}`
}
