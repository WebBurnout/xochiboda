import {
  html,
  lightElement,
  state,
} from 'https://scripts.hot.page/@hot-page/fun@0.0.3'
import { supabaseConfig } from './config.js'

const INVITATION_STORAGE_KEY = 'xochiboda.invitationId'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

  try {
    let invitationId = new URL(window.location.href).searchParams.get('invitation')

    if (invitationId !== null) {
      if (!UUID_PATTERN.test(invitationId)) {
        throw new Error('The invitation link is invalid.')
      }
      localStorage.setItem(INVITATION_STORAGE_KEY, invitationId)
    } else {
      invitationId = localStorage.getItem(INVITATION_STORAGE_KEY)
      if (invitationId && !UUID_PATTERN.test(invitationId)) {
        localStorage.removeItem(INVITATION_STORAGE_KEY)
        invitationId = null
      }
    }

    if (!invitationId) {
      invitation.set(null)
      invitationStatus.set('not-found')
      document.documentElement.classList.remove('is-loading')
      document.documentElement.classList.add('is-not-found')
      return
    }

    const endpoint = new URL(`${supabaseConfig.url}/rest/v1/rpc/get_invitation`)
    endpoint.searchParams.set('p_invitation_id', invitationId)

    const response = await fetch(endpoint, {
      headers: getSupabaseHeaders(),
    })

    if (!response.ok) {
      throw new Error(await getResponseError(
        response,
        `Unable to load invitation (${response.status}).`,
      ))
    }

    const data = await response.json()
    if (!data) {
      invitation.set(null)
      invitationStatus.set('not-found')
      document.documentElement.classList.remove('is-loading')
      document.documentElement.classList.add('is-not-found')
      return
    }

    invitation.set(data)
    invitationStatus.set('loaded')
    document.documentElement.classList.remove('is-loading', 'is-not-found')
  } catch (error) {
    invitation.set(null)
    invitationError.set(error instanceof Error ? error.message : 'Unable to load invitation.')
    invitationStatus.set('error')
    document.documentElement.classList.remove('is-loading')
    document.documentElement.classList.add('is-not-found')
  }
}

lightElement(function InvitationName() {
  return () => html`
    <span>${invitation.get()?.name ?? ''}</span>
    <br />
    <span>${invitation.get()?.relationship ?? ''}</span>
  `
})

lightElement(function InvitationForm({ effect }) {
  const saveError = state('')
  const shownDietNotes = state(new Set())
  let saveTimer = null
  let pendingValues = null
  let saveInProgress = false

  effect(() => () => clearTimeout(saveTimer))

  function validationError(current) {
    if (current.attending === null) return null
    if (current.attending && current.invitees.length === 0) {
      return 'Please add at least one guest.'
    }
    if (current.invitees.some((person) => !person.name.trim())) {
      return 'Every guest needs a name before changes can be saved.'
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
      saveError.set(error)
      return
    }

    if (next.attending === null) {
      pendingValues = null
      return
    }

    saveTimer = setTimeout(savePendingValues, 500)
  }

  async function savePendingValues() {
    if (saveInProgress || !pendingValues) return

    const snapshot = pendingValues
    pendingValues = null
    saveInProgress = true

    try {
      if (!snapshot.id) throw new Error('No invitation is loaded.')

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
          p_wants_party_house: snapshot.wants_party_house,
          p_special_requirements: snapshot.special_requirements,
          p_message: snapshot.message,
          p_invitees: snapshot.invitees.map(({ name, is_vegetarian, diet_notes }) => ({
            name,
            is_vegetarian,
            diet_notes,
          })),
        }),
      })

      if (!response.ok) {
        throw new Error(await getResponseError(
          response,
          `Unable to save RSVP (${response.status}).`,
        ))
      }

    } catch (error) {
      saveError.set(error instanceof Error ? error.message : 'Unable to save your RSVP.')
    } finally {
      saveInProgress = false

      if (pendingValues) {
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
        { name: '', is_vegetarian: false, diet_notes: '' },
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

  return () => {
    if (!invitation.get()) return html``

    const form = invitation.get()

    return html`
      <form @submit=${(event) => event.preventDefault()}>
        <div role="group" aria-label="Attendance">
          <button
            type="button"
            aria-pressed=${form.attending === true ? 'true' : 'false'}
            @click=${() => change({ attending: true })}
          >
            We will be attending
          </button>

          <button
            type="button"
            aria-pressed=${form.attending === false ? 'true' : 'false'}
            @click=${() => change({ attending: false })}
          >
            Sorry we can't make it
          </button>
        </div>

        ${form.attending === true
          ? html`
              <div>
                ${form.invitees.map((person, index) => html`
                  <div>
                    <p>Guest ${index + 1}</p>

                    <label>
                      Name
                      <input
                        type="text"
                        required
                        autocomplete="name"
                        .value=${person.name}
                        @input=${(event) => changeInvitee(index, { name: event.target.value })}
                      >
                    </label>

                    <label>
                      <input
                        type="checkbox"
                        .checked=${person.is_vegetarian}
                        @change=${(event) => changeInvitee(index, { is_vegetarian: event.target.checked })}
                      >
                      Vegetarian
                    </label>

                    ${person.diet_notes?.trim() || shownDietNotes.get().has(index)
                      ? html`
                          <label>
                            Dietary notes
                            <textarea
                              .value=${person.diet_notes}
                              @input=${(event) => {
                                showDietNotes(index)
                                changeInvitee(index, { diet_notes: event.target.value })
                              }}
                            ></textarea>
                          </label>
                        `
                      : html`
                          <a
                            href="#"
                            @click=${(event) => {
                              event.preventDefault()
                              showDietNotes(index)
                            }}
                          >
                            It's more complicated
                          </a>
                        `}

                    <button
                      type="button"
                      aria-label="Remove guest"
                      title="Remove guest"
                      @click=${() => removeInvitee(index)}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="24"
                        height="24"
                        aria-hidden="true"
                        focusable="false"
                      >
                        <path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-3 6h12l-1 12H7L6 9Zm3 2v8h2v-8H9Zm4 0v8h2v-8h-2Z"></path>
                      </svg>
                    </button>
                  </div>
                `)}

                <button type="button" @click=${addInvitee}>
                  Add guest
                </button>
              </div>

              <div>
                <p>Which events will you attend?</p>

                <ul>
                  ${form.is_family
                    ? html`
                        <li>
                          <label>
                            <input
                              type="checkbox"
                              .checked=${form.attends_family_dinner}
                              @change=${(event) => change({ attends_family_dinner: event.target.checked })}
                            >
                            Family dinner
                          </label>
                        </li>
                      `
                    : ''}

                  ${form.is_gringo
                    ? html`
                        <li>
                          <label>
                            <input
                              type="checkbox"
                              .checked=${form.attends_reception}
                              @change=${(event) => change({ attends_reception: event.target.checked })}
                            >
                            Reception
                          </label>
                        </li>
                      `
                    : ''}

                  <li>
                    <label>
                      <input
                        type="checkbox"
                        .checked=${form.attends_tornaboda}
                        @change=${(event) => change({ attends_tornaboda: event.target.checked })}
                      >
                      Tornaboda
                    </label>
                  </li>

                  ${form.is_peer
                    ? html`
                        <li>
                          <label>
                            <input
                              type="checkbox"
                              .checked=${form.attends_trip}
                              @change=${(event) => change({ attends_trip: event.target.checked })}
                            >
                            Trip
                          </label>
                        </li>
                      `
                    : ''}
                </ul>
              </div>

              ${form.is_gringo && !form.is_family
                ? html`
                    <div>
                      <p>Are you interested in staying at a party house?</p>

                      <label>
                        <input
                          type="radio"
                          name="wants-party-house"
                          .checked=${form.wants_party_house === true}
                          @change=${() => change({ wants_party_house: true })}
                        >
                        Yes
                      </label>

                      <label>
                        <input
                          type="radio"
                          name="wants-party-house"
                          .checked=${form.wants_party_house === false}
                          @change=${() => change({ wants_party_house: false })}
                        >
                        No
                      </label>
                    </div>
                  `
                : ''}

              <div>
                <label>
                  Special requirements
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
              <p>
                Thanks for considering it. We love you. Godspeed.
              </p>
            `
          : ''}

        ${form.attending !== null
          ? html`
              <div>
                <label>
                  Message
                  <textarea
                    .value=${form.message}
                    @input=${(event) => change({ message: event.target.value })}
                  ></textarea>
                </label>
              </div>

              <div>
                ${saveError.get()
                  ? html`<p role="alert">${saveError.get()}</p>`
                  : ''}
              </div>
            `
          : ''}
      </form>
    `
  }
})

loadInvitation()
