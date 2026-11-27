// The stored invitation code is shared by the invitation page and by the
// homepage link, so the key and its validation live in one place.
export const INVITATION_STORAGE_KEY = 'xochiboda.invitationCode'
export const INVITATION_CODE_PATTERN = /^[0-9A-Za-z]{5}$/

// Returns null and clears the key when the stored value is not a code, so a
// stale or hand-edited entry can never build a broken link.
export function storedInvitationCode() {
  const invitationCode = localStorage.getItem(INVITATION_STORAGE_KEY)
  if (!invitationCode) return null

  if (!INVITATION_CODE_PATTERN.test(invitationCode)) {
    localStorage.removeItem(INVITATION_STORAGE_KEY)
    return null
  }

  return invitationCode
}

export function rememberInvitationCode(invitationCode) {
  localStorage.setItem(INVITATION_STORAGE_KEY, invitationCode)
}

export function invitationPath(invitationCode, path = '/invitation') {
  return `${path}?id=${encodeURIComponent(invitationCode)}`
}
