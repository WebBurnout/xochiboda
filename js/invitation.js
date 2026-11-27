import {
  html,
  lightElement,
  state,
} from 'https://scripts.hot.page/@hot-page/fun@0.0.3'
import { supabaseConfig } from './config.js'
import { formatInvitationTime } from './format.js'
import { copy } from './language.js'
import {
  INVITATION_CODE_PATTERN,
  rememberInvitationCode,
  storedInvitationCode,
} from './invitation-storage.js'

// Mirrors the invitation's group flags onto the root element so static markup
// can show and hide sections with plain CSS.
const GROUP_CLASSES = ['is_gringo', 'is_family', 'is_peer']

function applyGroupClasses(data) {
  for (const groupClass of GROUP_CLASSES) {
    document.documentElement.classList.toggle(groupClass, data?.[groupClass] === true)
  }
}


// Root classes let the static markup show an error state with plain CSS:
// `has-error` whenever we could not show an invitation, plus `has-404-error`
// when that is because there is no such invitation.
function setLoadState(errorClass) {
  const root = document.documentElement
  root.classList.toggle('has-error', errorClass !== null)
  root.classList.toggle('has-404-error', errorClass === 'has-404-error')
}

export const invitation = state(null)
export const invitationStatus = state('idle')
export const invitationError = state(null)

function getSupabaseHeaders(includeJson = false) {
  const headers = {
    apikey: supabaseConfig.anonKey,
    Accept: 'application/json',
  }

  if (includeJson) headers['Content-Type'] = 'application/json'

  return headers
}

async function getResponseError(response, fallback) {
  try {
    const body = await response.json()
    return body.message || body.error_description || body.error || fallback
  } catch {
    return fallback
  }
}

export async function loadInvitation() {
  invitationStatus.set('loading')
  invitationError.set(null)
  document.documentElement.classList.remove('has-error', 'has-404-error')

  try {
    let invitationCode = new URL(window.location.href).searchParams.get('id')

    if (invitationCode !== null) {
      // A malformed code can never match an invitation, so treat it as not
      // found rather than falling back to the remembered one.
      if (!INVITATION_CODE_PATTERN.test(invitationCode)) {
        invitationCode = null
      } else {
        rememberInvitationCode(invitationCode)
      }
    } else {
      invitationCode = storedInvitationCode()
    }

    if (!invitationCode) {
      invitation.set(null)
      applyGroupClasses(null)
      invitationStatus.set('not-found')
      setLoadState('has-404-error')
      return
    }

    const endpoint = new URL(`${supabaseConfig.url}/rest/v1/rpc/get_invitation_by_code`)
    endpoint.searchParams.set('p_code', invitationCode)

    const response = await fetch(endpoint, {
      headers: getSupabaseHeaders(),
    })

    if (!response.ok) {
      throw new Error(await getResponseError(
        response,
        copy.loadFailed(response.status),
      ))
    }

    const data = await response.json()
    if (!data) {
      invitation.set(null)
      applyGroupClasses(null)
      invitationStatus.set('not-found')
      setLoadState('has-404-error')
      return
    }

    invitation.set(data)
    applyGroupClasses(data)
    invitationStatus.set('loaded')
    setLoadState(null)
  } catch (error) {
    invitation.set(null)
    applyGroupClasses(null)
    invitationError.set(error instanceof Error ? error.message : copy.loadFailedGeneric)
    invitationStatus.set('error')
    setLoadState('has-error')
  }
}

lightElement(function InvitationName() {
  return () => html`
    <div>${invitation.get()?.name ?? ''}</div>
    <div class="relationship">${invitation.get()?.relationship ?? ''}</div>
  `
})

lightElement(function InvitationTime() {
  return () => html`
    <span>${formatInvitationTime(invitation.get()?.invitation_time)}</span>
  `
})

const confettiColors = [
  '#ff007f', '#00f0ff', '#ffeb3b', '#4caf50', '#ff5722', '#9c27b0',
  '#3f51b5', '#009688', '#e91e63', '#03a9f4', '#ffc107', '#e040fb',
]

function burstConfetti(button) {
  const rect = button.getBoundingClientRect()
  const centerX = rect.left + rect.width / 2
  const centerY = rect.top + rect.height / 2

  for (let i = 0; i < 24; i++) {
    const piece = document.createElement('span')
    piece.className = 'confetti-piece'
    piece.style.left = `${centerX}px`
    piece.style.top = `${centerY}px`
    piece.style.background = confettiColors[i % confettiColors.length]
    document.body.append(piece)

    const angle = Math.random() * Math.PI * 2
    const distance = 60 + Math.random() * 80
    const x = Math.cos(angle) * distance
    const y = Math.sin(angle) * distance
    const spin = (Math.random() - 0.5) * 1440
    const flip = Math.random() * 1080

    piece.animate(
      [
        {
          transform: 'translate(-50%, -50%) rotate(0deg) rotateX(0deg)',
          opacity: 1,
          easing: 'cubic-bezier(.15, .7, .3, 1)',
        },
        { opacity: 1, offset: 0.4 },
        { opacity: 0, offset: 0.8 },
        {
          transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) rotate(${spin}deg) rotateX(${flip}deg)`,
          opacity: 0,
        },
      ],
      { duration: 500 + Math.random() * 500 },
    ).finished.then(() => piece.remove())
  }
}

function floatPoop(button) {
  button.animate(
    [
      { opacity: 1, transform: 'translate(-50%, -50%)', easing: 'ease-out' },
      { opacity: 1, offset: 0.25, easing: 'ease-out' },
      { opacity: 0, transform: 'translate(-50%, calc(-50% - 60px))' },
    ],
    { duration: 1200, pseudoElement: '::before' },
  )
}

lightElement(function InvitationForm({ effect }) {
  const saveError = state('')
  const saveStatus = state('idle')
  const shownDietNotes = state(new Set())
  let saveTimer = null
  let pendingValues = null
  let saveInProgress = false

  effect(() => () => clearTimeout(saveTimer))

  function validationError(current) {
    if (current.attending === null) return null
    if (current.attending && current.invitees.length === 0) {
      return copy.needOneGuest
    }
    return null
  }

  function scheduleSave(next) {
    pendingValues = next
    clearTimeout(saveTimer)
    saveError.set('')

    const error = validationError(next)
    if (error) {
      pendingValues = null
      saveStatus.set('idle')
      saveError.set(error)
      return
    }

    if (next.attending === null) {
      pendingValues = null
      saveStatus.set('idle')
      return
    }

    saveStatus.set('saving')
    saveTimer = setTimeout(savePendingValues, 500)
  }

  async function savePendingValues() {
    if (saveInProgress || !pendingValues) return

    const snapshot = pendingValues
    pendingValues = null
    saveInProgress = true

    try {
      if (!snapshot.id) throw new Error(copy.noInvitationLoaded)

      const response = await fetch(`${supabaseConfig.url}/rest/v1/rpc/save_rsvp`, {
        method: 'POST',
        headers: getSupabaseHeaders(true),
        body: JSON.stringify({
          p_invitation_id: snapshot.id,
          p_attending: snapshot.attending,
          p_attends_reception: snapshot.attends_reception,
          p_attends_family_dinner: snapshot.attends_family_dinner,
          p_attends_tornaboda: snapshot.attends_tornaboda,
          p_attends_trip: snapshot.attends_trip,
          p_special_requirements: snapshot.special_requirements,
          p_message: snapshot.message,
          p_invitees: snapshot.invitees
            .filter((person) => person.name.trim())
            .map(({ name, is_vegetarian, diet_notes, is_kid, age }) => ({
              name,
              is_vegetarian,
              diet_notes,
              is_kid,
              age: is_kid ? age : null,
            })),
        }),
      })

      if (!response.ok) {
        throw new Error(await getResponseError(
          response,
          copy.saveFailed(response.status),
        ))
      }

      saveStatus.set('saved')
    } catch (error) {
      saveStatus.set('idle')
      saveError.set(error instanceof Error ? error.message : copy.saveFailedGeneric)
    } finally {
      saveInProgress = false

      if (pendingValues) {
        saveStatus.set('saving')
        saveTimer = setTimeout(savePendingValues, 0)
      }
    }
  }

  function change(patch) {
    const next = { ...invitation.get(), ...patch }
    invitation.set(next)
    scheduleSave(next)
  }

  function changeInvitee(index, patch) {
    change({
      invitees: invitation.get().invitees.map((person, personIndex) =>
        personIndex === index ? { ...person, ...patch } : person,
      ),
    })
  }

  function addInvitee() {
    change({
      invitees: [
        ...invitation.get().invitees,
        { name: '', is_vegetarian: false, diet_notes: '', is_kid: false, age: '' },
      ],
    })
  }

  function showDietNotes(index) {
    shownDietNotes.set(new Set([...shownDietNotes.get(), index]))
  }

  function removeInvitee(index) {
    shownDietNotes.set(new Set(
      [...shownDietNotes.get()]
        .filter((personIndex) => personIndex !== index)
        .map((personIndex) => personIndex > index ? personIndex - 1 : personIndex),
    ))
    change({
      invitees: invitation.get().invitees.filter((_, personIndex) => personIndex !== index),
    })
  }

  // Each attendance button is `true` when it is the answer, `false` when the
  // other one is, and `indeterminate` before either has been chosen.
  function attendanceState(attending, value) {
    if (attending === null || attending === undefined) return 'indeterminate'
    return attending === value ? 'true' : 'false'
  }

  return () => {
    if (!invitation.get()) return html``

    const form = invitation.get()

    return html`
      <form class="invitation-form" @submit=${(event) => event.preventDefault()}>
        <div class="attendance" role="group" aria-label="Attendance">
          <button
            class="attendance-button confetti yes"
            type="button"
            aria-pressed=${form.attending === true ? 'true' : 'false'}
            data-state=${attendanceState(form.attending, true)}
            @click=${(event) => {
              burstConfetti(event.currentTarget)
              change({ attending: true })
            }}
          >
            ${copy.attendingYes}
          </button>

          <button
            class="attendance-button poopy no"
            type="button"
            aria-pressed=${form.attending === false ? 'true' : 'false'}
            data-state=${attendanceState(form.attending, false)}
            @click=${(event) => {
              floatPoop(event.currentTarget)
              change({ attending: false })
            }}
          >
            ${copy.attendingNo}
          </button>
        </div>

        ${form.attending === true
          ? html`
              <div class="guests">
                ${form.invitees.map((person, index) => html`
                  <div class="guest">
                    <label class="field name">
                      ${copy.name}
                      <input
                        type="text"
                        required
                        autocomplete="name"
                        .value=${person.name}
                        @input=${(event) => changeInvitee(index, { name: event.target.value })}
                      >
                      <button
                        class="remove-guest"
                        type="button"
                        aria-label=${copy.removeGuest}
                        title=${copy.removeGuest}
                        @click=${() => removeInvitee(index)}
                      >
                        <svg
                          class="remove-guest-icon"
                          viewBox="0 0 24 24"
                          width="24"
                          height="24"
                          aria-hidden="true"
                          focusable="false"
                        >
                          <path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-3 6h12l-1 12H7L6 9Zm3 2v8h2v-8H9Zm4 0v8h2v-8h-2Z"></path>
                        </svg>
                      </button>
                    </label>

                    <div class="checkbox-row">
                      <label class="checkbox vegetarian">
                        <input
                          type="checkbox"
                          .checked=${person.is_vegetarian}
                          @change=${(event) => changeInvitee(index, { is_vegetarian: event.target.checked })}
                        >
                        ${copy.vegetarian}
                        ${person.diet_notes?.trim() || shownDietNotes.get().has(index)
                          ? ''
                          : html`
                              <button
                                type="button"
                                class="show-diet-notes"
                                @click=${(event) => {
                                  event.preventDefault()
                                  showDietNotes(index)
                                  changeInvitee(index, { is_vegetarian: true })
                                }}
                              >
                                ${copy.dietNotesLink}
                              </button>
                            `}
                      </label>

                      ${person.diet_notes?.trim() || shownDietNotes.get().has(index)
                        ? html`
                            <label class="field diet-notes">
                              ${copy.dietNotes}
                              <textarea
                                .value=${person.diet_notes}
                                @input=${(event) => {
                                  showDietNotes(index)
                                  changeInvitee(index, { diet_notes: event.target.value })
                                }}
                              ></textarea>
                            </label>
                          `
                        : ''}
                    </div>

                    <div class="checkbox-row">
                      <label class="checkbox kid">
                        <input
                          type="checkbox"
                          .checked=${person.is_kid}
                          @change=${(event) => changeInvitee(index, {
                            is_kid: event.target.checked,
                            age: event.target.checked ? person.age ?? '' : '',
                          })}
                        >
                        ${copy.isKid}
                      </label>

                      ${person.is_kid
                        ? html`
                            <label class="field age">
                              ${copy.age}
                              <input
                                type="number"
                                min="0"
                                max="120"
                                step="1"
                                .value=${person.age ?? ''}
                                @input=${(event) => changeInvitee(index, { age: event.target.value })}
                              >
                            </label>
                          `
                        : ''}
                    </div>

                  </div>
                `)}

                <button class="add-guest" type="button" @click=${addInvitee}>
                  ${copy.addGuest}
                </button>
              </div>

              <div class="events">
                <p class="question">${copy.eventsQuestion}</p>

                <ul class="event-list">
                  ${form.is_family
                    ? html`
                        <li class="event family-dinner">
                          <label class="checkbox">
                            <input
                              type="checkbox"
                              .checked=${form.attends_family_dinner}
                              @change=${(event) => change({ attends_family_dinner: event.target.checked })}
                            >
                            ${copy.familyDinner}
                          </label>
                        </li>
                      `
                    : ''}

                  ${form.is_gringo
                    ? html`
                        <li class="event reception">
                          <label class="checkbox">
                            <input
                              type="checkbox"
                              .checked=${form.attends_reception}
                              @change=${(event) => change({ attends_reception: event.target.checked })}
                            >
                            ${copy.reception}
                          </label>
                        </li>
                      `
                    : ''}

                  <li class="event tornaboda">
                    <label class="checkbox">
                      <input
                        type="checkbox"
                        .checked=${form.attends_tornaboda}
                        @change=${(event) => change({ attends_tornaboda: event.target.checked })}
                      >
                      ${copy.tornaboda}
                    </label>
                  </li>

                  ${form.is_peer
                    ? html`
                        <li class="event trip">
                          <label class="checkbox">
                            <input
                              type="checkbox"
                              .checked=${form.attends_trip}
                              @change=${(event) => change({ attends_trip: event.target.checked })}
                            >
                            ${copy.trip}
                          </label>
                        </li>
                      `
                    : ''}
                </ul>
              </div>

              <div class="special-requirements">
                <label class="field">
                  ${copy.specialRequirements}
                  <textarea
                    .value=${form.special_requirements}
                    @input=${(event) => change({ special_requirements: event.target.value })}
                  ></textarea>
                </label>
              </div>
            `
          : ''}

        ${form.attending === false
          ? html`
              <p class="declined">${copy.declinedThanks}</p>
            `
          : ''}

        ${form.attending !== null
          ? html`
              <div class="message">
                <label class="field">
                  ${copy.message}
                  <textarea
                    .value=${form.message}
                    @input=${(event) => change({ message: event.target.value })}
                  ></textarea>
                </label>
              </div>

              <div class="status">
                ${saveError.get()
                  ? html`<p class="error" role="alert">${saveError.get()}</p>`
                  : ''}

                ${saveStatus.get() !== 'idle'
                  ? html`
                      <p
                        class=${`save-status ${saveStatus.get()}`}
                        role="status"
                      >
                        ${saveStatus.get() === 'saving' ? copy.saving : copy.saved}
                      </p>
                    `
                  : ''}
              </div>
            `
          : ''}
      </form>
    `
  }
})

loadInvitation()
