// The stored invitation code is shared by the invitation page and by the
// homepage link, so the key and its validation live in one place.
export const INVITATION_STORAGE_KEY = 'xochiboda.invitationCode'
export const INVITATION_CODE_PATTERN = /^[0-9A-Za-z]{5}$/

// Returns null and clears the key when the stored value is not a code, so a
// stale or hand-edited entry can never build a broken link. Storage can be
// missing or throw (private browsing, in-app browsers), which reads as nothing
// stored.
export function storedInvitationCode() {
  try {
    const invitationCode = localStorage.getItem(INVITATION_STORAGE_KEY)
    if (!invitationCode) return null

    if (!INVITATION_CODE_PATTERN.test(invitationCode)) {
      localStorage.removeItem(INVITATION_STORAGE_KEY)
      return null
    }

    return invitationCode
  } catch {
    return null
  }
}

export function rememberInvitationCode(invitationCode) {
  try {
    localStorage.setItem(INVITATION_STORAGE_KEY, invitationCode)
  } catch {
    // Links carry the code in their URL, so losing it here only loses the
    // homepage link.
  }
}

export function invitationPath(invitationCode, path = '/invitation') {
  return `${path}?id=${encodeURIComponent(invitationCode)}`
}
