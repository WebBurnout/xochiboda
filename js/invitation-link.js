import {
  html,
  lightElement,
} from 'https://scripts.hot.page/@hot-page/fun@0.0.3'
import { copy } from './language.js'
import { invitationPath, storedInvitationCode } from './invitation-storage.js'

// Deliberately standalone: the homepage can load this without pulling in
// invitation.js, which would fetch an invitation and mark the page not-found.
const invitationCode = storedInvitationCode()

// Lets surrounding markup hide a whole "your invitation" block when the visitor
// has never opened one, since the element itself renders nothing in that case.
if (invitationCode) {
  document.documentElement.classList.add('has_invitation')
}

lightElement(function InvitationLink() {
  return () => {
    if (!invitationCode) return html``

    return html`<a href=${invitationPath(invitationCode)}>${copy.viewInvitation}</a>`
  }
})
