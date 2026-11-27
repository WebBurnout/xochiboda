import { createClient } from 'https://scripts.hot.page/@supabase/supabase-js@2'
import {
  html,
  lightElement,
  state,
} from 'https://scripts.hot.page/@hot-page/fun@0.0.3'
import { supabaseConfig } from './config.js'
import { formatInvitationTime } from './format.js'

const supabase = createClient(supabaseConfig.url, supabaseConfig.anonKey)

const UNCATEGORIZED = 'Uncategorized'

function emptyInvitee() {
  return { name: '', is_vegetarian: false, diet_notes: '', is_kid: false, age: '' }
}

function blankInvitation() {
  return {
    id: null,
    name: '',
    relationship: '',
    category: '',
    invitation_time: '',
    emails: '',
    is_gringo: false,
    is_family: false,
    is_peer: false,
    attending: null,
    attends_reception: false,
    attends_family_dinner: false,
    attends_tornaboda: false,
    attends_trip: false,
    special_requirements: '',
    message: '',
    invitees: [emptyInvitee()],
  }
}

// An invitation's emails are one comma-separated string, as typed in seed.csv.
function emailList(value) {
  return String(value ?? '')
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean)
}

// <input type="time"> wants HH:MM, but Postgres hands back HH:MM:SS.
function timeInputValue(value) {
  return value ? String(value).slice(0, 5) : ''
}

// Nulls become empty strings so every field is a controlled input.
function draftFromInvitation(invitation) {
  return {
    ...blankInvitation(),
    ...invitation,
    category: invitation.category ?? '',
    invitation_time: timeInputValue(invitation.invitation_time),
    emails: invitation.emails ?? '',
    special_requirements: invitation.special_requirements ?? '',
    message: invitation.message ?? '',
    invitees: invitation.invitees.length > 0
      ? invitation.invitees.map((person) => ({
          name: person.name ?? '',
          is_vegetarian: person.is_vegetarian ?? false,
          diet_notes: person.diet_notes ?? '',
          is_kid: person.is_kid ?? false,
          age: person.age ?? '',
        }))
      : [emptyInvitee()],
  }
}

// An admin override can set an event the guest is not normally eligible for, so
// the cell has to show that rather than flattening it to "n/a".
function eventCell(isEligible, value) {
  if (isEligible) return yesNo(value)
  return value ? 'Yes (override)' : 'n/a'
}

function categoryOf(invitation) {
  return invitation.category?.trim() || UNCATEGORIZED
}

// Counts both invitations and the people on them, because a category is a
// grouping of invitations but headcount is what drives planning.
function categoryRollup(invitations) {
  const totals = new Map()

  for (const invitation of invitations) {
    const category = categoryOf(invitation)
    const row = totals.get(category) ?? {
      category,
      invitations: 0,
      people: 0,
      attending: 0,
      attendingPeople: 0,
      declined: 0,
      pending: 0,
    }

    row.invitations += 1
    row.people += invitation.invitees.length

    if (invitation.attending === true) {
      row.attending += 1
      row.attendingPeople += invitation.invitees.length
    } else if (invitation.attending === false) {
      row.declined += 1
    } else {
      row.pending += 1
    }

    totals.set(category, row)
  }

  return [...totals.values()].sort((a, b) => {
    if (a.category === UNCATEGORIZED) return 1
    if (b.category === UNCATEGORIZED) return -1
    return b.people - a.people || a.category.localeCompare(b.category)
  })
}

// attending is the whole status: null means we do not know, true yes, false no.
function attendingLabel(attending) {
  if (attending === true) return 'Attending'
  if (attending === false) return 'Declined'
  return 'No answer'
}

function invitationStatus(invitation) {
  return attendingLabel(invitation.attending)
}

function formatDate(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function yesNo(value) {
  return value ? 'Yes' : 'No'
}

function eventLabel(value) {
  const label = value.replaceAll('_', ' ')
  return `${label[0].toUpperCase()}${label.slice(1)}`
}

function invitationUrl(code, path = '/invitation') {
  return `${path}?id=${encodeURIComponent(code)}`
}

function copyText(text) {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.append(textarea)
  textarea.select()

  try {
    if (!document.execCommand('copy')) throw new Error('Copy command failed.')
  } finally {
    textarea.remove()
  }
}

function reactiveProperty(element, name, initialValue) {
  const value = state(initialValue)
  Object.defineProperty(element, name, {
    get: () => value.get(),
    set: (nextValue) => value.set(nextValue),
  })
  return value
}

// Below this width the wide tables are replaced by one card per row, because
// sixteen columns cannot be squeezed onto a phone or a portrait tablet.
const narrowQuery = window.matchMedia('(max-width: 64rem)')
const isNarrow = state(narrowQuery.matches)
narrowQuery.addEventListener('change', (event) => isNarrow.set(event.matches))

// The popup is a popover so it sits in the top layer and is not clipped by the
// scrolling tab panel. Popovers are centered by default, so place it under the
// text, or over it near the bottom of the window, and keep it on screen.
function showFullText(event) {
  const trigger = event.currentTarget
  const popup = trigger.querySelector('[popover]')
  const rect = trigger.getBoundingClientRect()
  popup.showPopover()
  const fitsBelow = rect.bottom + 4 + popup.offsetHeight <= window.innerHeight
  popup.style.top = `${fitsBelow ? rect.bottom + 4 : Math.max(8, rect.top - 4 - popup.offsetHeight)}px`
  popup.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - popup.offsetWidth - 8))}px`
}

function hideFullText(event) {
  event.currentTarget.querySelector('[popover]').hidePopover()
}

// Long free text would blow out a table column, so it is cut short and the rest
// shown on hover or focus.
function truncated(text) {
  if (!text) return '—'
  const characters = [...text]
  if (characters.length <= 50) return text
  return html`
    <span
      class="truncated"
      tabindex="0"
      @mouseenter=${showFullText}
      @mouseleave=${hideFullText}
      @focus=${showFullText}
      @blur=${hideFullText}
    >${characters.slice(0, 20).join('')}…<span popover="manual">${text}</span></span>
  `
}

function inviteeList(invitees) {
  return html`
    <ul>
      ${invitees.map((person) => html`
        <li>
          ${person.name}${person.is_kid ? ` — kid${person.age === null ? '' : `, ${person.age}`}` : ''}${person.is_vegetarian ? ' — vegetarian' : ''}${person.diet_notes ? ` — ${person.diet_notes}` : ''}
        </li>
      `)}
    </ul>
  `
}

function contactLinks(emails) {
  return emailList(emails).length
    ? emailList(emails).map((email, index) => html`${index ? ', ' : ''}<a href=${`mailto:${email}`}>${email}</a>`)
    : '—'
}

lightElement(function XochibodaInvitations() {
  const items = reactiveProperty(this, 'items', [])
  const element = this

  function editButton(item) {
    return html`
      <button
        type="button"
        @click=${() => element.dispatchEvent(new CustomEvent('edit-invitation', {
          bubbles: true,
          detail: item,
        }))}
      >
        Edit
      </button>
    `
  }

  // Declined invitations only need who they are and what they said.
  function renderTable(invitations, { brief = false } = {}) {
    return html`
      <table>
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Relationship</th>
            <th scope="col">Category</th>
            ${brief
              ? ''
              : html`
                  <th scope="col">Time</th>
                  <th scope="col">RSVP</th>
                  <th scope="col">Invitees</th>
                  <th scope="col">Contact</th>
                  <th scope="col">Reception</th>
                  <th scope="col">Family dinner</th>
                  <th scope="col">Tornaboda</th>
                  <th scope="col">Trip</th>
                  <th scope="col">Requirements</th>
                `}
            <th scope="col">Message</th>
            <th scope="col">Responded</th>
            <th scope="col">Edit</th>
          </tr>
        </thead>
        <tbody>
          ${invitations.map((item) => html`
            <tr>
              <th scope="row"><a href=${invitationUrl(item.code)}>${item.name}</a></th>
              <td>${item.relationship}</td>
              <td>${item.category || '—'}</td>
              ${brief
                ? ''
                : html`
                    <td>${formatInvitationTime(item.invitation_time) || '—'}</td>
                    <td>${invitationStatus(item)}</td>
                    <td>${inviteeList(item.invitees)}</td>
                    <td>${contactLinks(item.emails)}</td>
                    <td>${eventCell(item.is_gringo, item.attends_reception)}</td>
                    <td>${eventCell(item.is_family, item.attends_family_dinner)}</td>
                    <td>${yesNo(item.attends_tornaboda)}</td>
                    <td>${eventCell(item.is_peer, item.attends_trip)}</td>
                    <td>${truncated(item.special_requirements)}</td>
                  `}
              <td>${truncated(item.message)}</td>
              <td>${formatDate(item.responded_at)}</td>
              <td>${editButton(item)}</td>
            </tr>
          `)}
        </tbody>
      </table>
    `
  }

  // The same fields as the table, one card per invitation. Cards have room for
  // the full requirements and message, so those are not truncated.
  function renderCards(invitations, { brief = false } = {}) {
    return html`
      <ul class="cards">
        ${invitations.map((item) => html`
          <li>
            <h4><a href=${invitationUrl(item.code)}>${item.name}</a></h4>
            <dl>
              <dt>Relationship</dt><dd>${item.relationship}</dd>
              <dt>Category</dt><dd>${item.category || '—'}</dd>
              ${brief
                ? ''
                : html`
                    <dt>Time</dt><dd>${formatInvitationTime(item.invitation_time) || '—'}</dd>
                    <dt>RSVP</dt><dd>${invitationStatus(item)}</dd>
                    <dt>Invitees</dt><dd>${inviteeList(item.invitees)}</dd>
                    <dt>Contact</dt><dd>${contactLinks(item.emails)}</dd>
                    <dt>Reception</dt><dd>${eventCell(item.is_gringo, item.attends_reception)}</dd>
                    <dt>Family dinner</dt><dd>${eventCell(item.is_family, item.attends_family_dinner)}</dd>
                    <dt>Tornaboda</dt><dd>${yesNo(item.attends_tornaboda)}</dd>
                    <dt>Trip</dt><dd>${eventCell(item.is_peer, item.attends_trip)}</dd>
                    <dt>Requirements</dt><dd>${item.special_requirements || '—'}</dd>
                  `}
              <dt>Message</dt><dd>${item.message || '—'}</dd>
              <dt>Responded</dt><dd>${formatDate(item.responded_at)}</dd>
            </dl>
            ${editButton(item)}
          </li>
        `)}
      </ul>
    `
  }

  return () => {
    const invitations = items.get()
    const attending = invitations.filter((item) => item.attending === true)
    const declined = invitations.filter((item) => item.attending === false)
    const unknown = invitations.filter((item) => item.attending === null)
    const render = isNarrow.get() ? renderCards : renderTable

    return html`
      <section role="tabpanel" aria-labelledby="invitations-tab">
        <h2>Invitations</h2>

        <h3>Attending — ${attending.length}</h3>
        ${render(attending)}

        <h3>Declined — ${declined.length}</h3>
        ${render(declined, { brief: true })}

        <h3>No answer — ${unknown.length}</h3>
        ${render(unknown)}
      </section>
    `
  }
})

lightElement(function XochibodaInvitees() {
  const items = reactiveProperty(this, 'items', [])

  function renderTable(people) {
    return html`
      <table>
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Invitation</th>
            <th scope="col">Category</th>
            <th scope="col">RSVP</th>
            <th scope="col">Age</th>
            <th scope="col">Vegetarian</th>
            <th scope="col">Dietary notes</th>
          </tr>
        </thead>
        <tbody>
          ${people.map((person) => html`
            <tr>
              <td>${person.name}</td>
              <td>${person.invitation_name}</td>
              <td>${person.invitation_category || '—'}</td>
              <td>${attendingLabel(person.invitation_attending)}</td>
              <td>${person.is_kid ? person.age ?? 'Kid' : '—'}</td>
              <td>${yesNo(person.is_vegetarian)}</td>
              <td>${person.diet_notes || '—'}</td>
            </tr>
          `)}
        </tbody>
      </table>
    `
  }

  function renderCards(people) {
    return html`
      <ul class="cards">
        ${people.map((person) => html`
          <li>
            <h4>${person.name}</h4>
            <dl>
              <dt>Invitation</dt><dd>${person.invitation_name}</dd>
              <dt>Category</dt><dd>${person.invitation_category || '—'}</dd>
              <dt>RSVP</dt><dd>${attendingLabel(person.invitation_attending)}</dd>
              <dt>Age</dt><dd>${person.is_kid ? person.age ?? 'Kid' : '—'}</dd>
              <dt>Vegetarian</dt><dd>${yesNo(person.is_vegetarian)}</dd>
              <dt>Dietary notes</dt><dd>${person.diet_notes || '—'}</dd>
            </dl>
          </li>
        `)}
      </ul>
    `
  }

  return () => html`
    <section role="tabpanel" aria-labelledby="invitees-tab">
      <h2>Invitees</h2>
      ${isNarrow.get() ? renderCards(items.get()) : renderTable(items.get())}
    </section>
  `
})

lightElement(function XochibodaInvitationEditor() {
  const categories = reactiveProperty(this, 'categories', [])
  const draft = state(null)
  const isSaving = state(false)
  const error = state('')
  const element = this

  function dialog() {
    return element.querySelector('dialog')
  }

  // Opened imperatively so the draft stays inside this element: typing in the
  // modal must not re-render the invitations table behind it.
  element.openInvitation = (invitation) => {
    error.set('')
    draft.set(invitation ? draftFromInvitation(invitation) : blankInvitation())
    queueMicrotask(() => {
      const node = dialog()
      if (node && !node.open) node.showModal()
    })
  }

  function close() {
    dialog()?.close()
    draft.set(null)
  }

  function change(patch) {
    draft.set({ ...draft.get(), ...patch })
  }

  function changeInvitee(index, patch) {
    change({
      invitees: draft.get().invitees.map((person, personIndex) =>
        personIndex === index ? { ...person, ...patch } : person,
      ),
    })
  }

  function addInvitee() {
    change({ invitees: [...draft.get().invitees, emptyInvitee()] })
  }

  function removeInvitee(index) {
    change({
      invitees: draft.get().invitees.filter((_, personIndex) => personIndex !== index),
    })
  }

  async function save(event) {
    event.preventDefault()
    error.set('')

    const form = event.currentTarget
    if (!form.reportValidity()) return

    const current = draft.get()
    const invitees = current.invitees.filter((person) => person.name.trim())

    if (invitees.length === 0) {
      error.set('Add at least one guest.')
      return
    }

    isSaving.set(true)

    try {
      const payload = {
        p_name: current.name,
        p_relationship: current.relationship,
        p_category: current.category,
        p_invitation_time: current.invitation_time,
        p_emails: current.emails,
        p_is_gringo: current.is_gringo,
        p_is_family: current.is_family,
        p_is_peer: current.is_peer,
        p_attending: current.attending,
        p_attends_reception: current.attends_reception,
        p_attends_family_dinner: current.attends_family_dinner,
        p_attends_tornaboda: current.attends_tornaboda,
        p_attends_trip: current.attends_trip,
        p_special_requirements: current.special_requirements,
        p_message: current.message,
        p_invitees: invitees.map((person) => ({
          name: person.name,
          is_vegetarian: person.is_vegetarian,
          diet_notes: person.diet_notes,
          is_kid: person.is_kid,
          age: person.is_kid ? person.age : null,
        })),
      }

      const { data, error: saveError } = current.id
        ? await supabase.rpc('admin_update_invitation', {
            p_invitation_id: current.id,
            ...payload,
          })
        : await supabase.rpc('admin_create_invitation', payload)

      if (saveError) throw saveError

      const wasCreated = !current.id
      close()
      element.dispatchEvent(new CustomEvent('invitation-saved', {
        bubbles: true,
        detail: { ...data, created: wasCreated },
      }))
    } catch (saveError) {
      error.set(saveError.message || 'Unable to save the invitation.')
    } finally {
      isSaving.set(false)
    }
  }

  function renderEvents(current) {
    // Same rules save_rsvp applies to guests, read live from the group
    // checkboxes above, so ticking Family reveals the family dinner at once.
    const events = [
      ['attends_reception', 'Reception', current.is_gringo],
      ['attends_family_dinner', 'Family dinner', current.is_family],
      ['attends_tornaboda', 'Tornaboda', true],
      ['attends_trip', 'Trip', current.is_peer],
    ].filter(([, , isEligible]) => isEligible)

    if (events.length === 0) return html`<p>No events for these groups.</p>`

    return html`
      <ul>
        ${events.map(([field, label]) => html`
          <li>
            <label>
              <input
                type="checkbox"
                .checked=${current[field]}
                @change=${(event) => change({ [field]: event.target.checked })}
              >
              ${label}
            </label>
          </li>
        `)}
      </ul>
    `
  }

  return () => {
    const current = draft.get()

    return html`
      <dialog @close=${() => draft.set(null)}>
        ${current
          ? html`
              <form @submit=${save}>
                <h2>${current.id ? 'Edit invitation' : 'New invitation'}</h2>

                <div>
                  <label>
                    Invitation name
                    <input
                      type="text"
                      required
                      .value=${current.name}
                      @input=${(event) => change({ name: event.target.value })}
                    >
                  </label>

                  <label>
                    Relationship
                    <input
                      type="text"
                      .value=${current.relationship}
                      @input=${(event) => change({ relationship: event.target.value })}
                    >
                  </label>

                  <label>
                    Category
                    <input
                      type="text"
                      list="invitation-categories"
                      .value=${current.category}
                      @input=${(event) => change({ category: event.target.value })}
                    >
                  </label>
                  <datalist id="invitation-categories">
                    ${categories.get().map((category) => html`<option value=${category}></option>`)}
                  </datalist>

                  <label>
                    Invitation time
                    <input
                      type="time"
                      .value=${current.invitation_time}
                      @input=${(event) => change({ invitation_time: event.target.value })}
                    >
                  </label>

                  <label>
                    Emails
                    <input
                      type="email"
                      multiple
                      .value=${current.emails}
                      @input=${(event) => change({ emails: event.target.value })}
                    >
                  </label>
                </div>

                <div>
                  <h3>Groups</h3>
                  <label>
                    <input
                      type="checkbox"
                      .checked=${current.is_gringo}
                      @change=${(event) => change({ is_gringo: event.target.checked })}
                    >
                    Gringo
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      .checked=${current.is_family}
                      @change=${(event) => change({ is_family: event.target.checked })}
                    >
                    Family
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      .checked=${current.is_peer}
                      @change=${(event) => change({ is_peer: event.target.checked })}
                    >
                    Peer
                  </label>
                </div>

                <div>
                  <h3>RSVP</h3>

                  <label>
                    <input
                      type="radio"
                      name="attending"
                      .checked=${current.attending === null}
                      @change=${() => change({ attending: null })}
                    >
                    No answer
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="attending"
                      .checked=${current.attending === true}
                      @change=${() => change({ attending: true })}
                    >
                    Attending
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="attending"
                      .checked=${current.attending === false}
                      @change=${() => change({ attending: false })}
                    >
                    Declined
                  </label>
                </div>

                <div>
                  <h3>Events</h3>
                  ${renderEvents(current)}
                </div>

                <div>
                  <h3>Guests</h3>
                  ${current.invitees.map((person, index) => html`
                    <div>
                      <p>Guest ${index + 1}</p>

                      <label>
                        Name
                        <input
                          type="text"
                          required
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

                      <label>
                        <input
                          type="checkbox"
                          .checked=${person.is_kid}
                          @change=${(event) => changeInvitee(index, {
                            is_kid: event.target.checked,
                            age: event.target.checked ? person.age : '',
                          })}
                        >
                        Kid
                      </label>

                      ${person.is_kid
                        ? html`
                            <label>
                              Age
                              <input
                                type="number"
                                min="0"
                                max="120"
                                step="1"
                                .value=${person.age}
                                @input=${(event) => changeInvitee(index, { age: event.target.value })}
                              >
                            </label>
                          `
                        : ''}

                      <label>
                        Dietary notes
                        <textarea
                          .value=${person.diet_notes}
                          @input=${(event) => changeInvitee(index, { diet_notes: event.target.value })}
                        ></textarea>
                      </label>

                      <button
                        type="button"
                        aria-label="Remove guest"
                        title="Remove guest"
                        @click=${() => removeInvitee(index)}
                      >
                        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
                          <path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-3 6h12l-1 12H7L6 9Zm3 2v8h2v-8H9Zm4 0v8h2v-8h-2Z"></path>
                        </svg>
                      </button>
                    </div>
                  `)}

                  <button type="button" @click=${addInvitee}>Add guest</button>
                </div>

                <div>
                  <label>
                    Special requirements
                    <textarea
                      .value=${current.special_requirements}
                      @input=${(event) => change({ special_requirements: event.target.value })}
                    ></textarea>
                  </label>

                  <label>
                    Message
                    <textarea
                      .value=${current.message}
                      @input=${(event) => change({ message: event.target.value })}
                    ></textarea>
                  </label>
                </div>

                ${error.get() ? html`<p role="alert">${error.get()}</p>` : ''}

                <div>
                  <button type="submit" ?disabled=${isSaving.get()}>
                    ${isSaving.get() ? 'Saving…' : 'Save'}
                  </button>
                  <button type="button" @click=${close}>Cancel</button>
                </div>
              </form>
            `
          : ''}
      </dialog>
    `
  }
})

lightElement(`
  :scope {
    --ink: #292421;
    --muted: #746b65;
    --paper: #fffdf8;
    --wash: #f6efe5;
    --line: #ded2c5;
    --accent: #7b3148;
    --accent-dark: #5e2135;
    display: block;
    padding: 1rem;
    color: var(--ink);
    line-height: 1.5;
  }

  :scope * {
    box-sizing: border-box;
  }

  :scope header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
    margin-block-end: 2rem;
  }

  :scope header h1 {
    flex: 1 1 20rem;
    margin: 0;
  }

  :scope h2,
  :scope h3,
  :scope p {
    margin-block-start: 0;
  }

  :scope section {
    margin-block: 1.5rem;
    padding: clamp(1rem, 2vw, 2rem);
    border: 1px solid var(--line);
    border-radius: 0.75rem;
    background: var(--paper);
  }

  :scope dl {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
    gap: 0.75rem;
    margin: 0 0 2rem;
  }

  :scope dl div {
    padding: 1rem;
    border-radius: 0.5rem;
    background: var(--wash);
  }

  :scope dt {
    color: var(--muted);
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  :scope dd {
    margin: 0.25rem 0 0;
    font-size: 1.75rem;
    font-weight: 700;
  }

  :scope button {
    min-height: 2.5rem;
    padding: 0.55rem 0.9rem;
    border: 1px solid var(--accent);
    border-radius: 0.4rem;
    background: var(--accent);
    color: white;
    font: inherit;
    font-weight: 650;
    cursor: pointer;
  }

  :scope button:hover {
    border-color: var(--accent-dark);
    background: var(--accent-dark);
  }

  :scope button:focus-visible,
  :scope input:focus-visible,
  :scope textarea:focus-visible,
  :scope summary:focus-visible,
  :scope a:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--accent) 35%, transparent);
    outline-offset: 2px;
  }

  :scope button:disabled {
    cursor: wait;
    opacity: 0.55;
  }

  :scope nav {
    margin-block-start: 2.5rem;
  }

  :scope [role='tablist'] {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    padding-inline: 0.75rem;
  }

  /* The tabs overlap the panel's top border by 1px so the selected tab, which
     shares the panel's background and has no bottom border, reads as part of
     the panel. */
  :scope [role='tab'] {
    position: relative;
    margin-block-end: -1px;
    border: 1px solid var(--line);
    border-block-end: 0;
    border-radius: 0.5rem 0.5rem 0 0;
  }

  :scope [role='tab'][aria-selected='false'] {
    background: var(--wash);
    color: var(--muted);
  }

  :scope [role='tab'][aria-selected='false']:hover {
    border-color: var(--line);
    background: var(--paper);
    color: var(--ink);
  }

  :scope [role='tab'][aria-selected='true'] {
    background: var(--paper);
    color: var(--accent);
    cursor: default;
  }

  :scope [role='tab'][aria-selected='true']:hover {
    border-color: var(--line);
  }

  :scope [role='tabpanel'] {
    overflow-x: auto;
    margin-block-start: 0;
  }

  :scope table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
  }

  :scope table + h3,
  :scope .scroll + h3 {
    margin-block-start: 2rem;
  }

  /* Only the two wide data tables need a floor to stay readable. The summary,
     diet, and kid tables are narrow and should size to their own content
     rather than being stretched to the same width. */
  :scope xochiboda-invitations table,
  :scope xochiboda-invitees table {
    min-width: 70rem;
  }

  :scope xochiboda-invitations table {
    margin-block-end: 2rem;
  }

  /* Padding is charged once per column, so on the 16-column invitations table
     it alone accounts for several hundred pixels of width. */
  :scope th,
  :scope td {
    padding: 0.55rem;
    border-bottom: 1px solid var(--line);
    text-align: left;
    vertical-align: top;
  }

  :scope thead th {
    position: sticky;
    top: 0;
    background: var(--wash);
    color: var(--muted);
    font-size: 0.75rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  :scope tbody tr:hover {
    background: color-mix(in srgb, var(--wash) 55%, transparent);
  }

  /* A row of buttons in one cell, as in the unsent list. */
  :scope td > div {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
  }

  :scope td > div button {
    min-height: 0;
    padding: 0.3rem 0.6rem;
  }

  :scope td ul {
    min-width: 8rem;
    margin: 0;
    padding-inline-start: 1rem;
  }

  :scope .truncated {
    border-bottom: 1px dotted var(--muted);
    cursor: help;
  }

  /* Popovers default to a centered dialog; showFullText places it instead. */
  :scope .truncated [popover] {
    inset: auto;
    max-width: min(24rem, calc(100vw - 1rem));
    margin: 0;
    padding: 0.6rem 0.75rem;
    border: 1px solid var(--line);
    border-radius: 0.4rem;
    background: var(--paper);
    box-shadow: 0 0.5rem 1.5rem rgb(41 36 33 / 18%);
    color: var(--ink);
    white-space: pre-wrap;
  }

  :scope .scroll {
    overflow-x: auto;
  }

  :scope .cards {
    display: grid;
    gap: 0.75rem;
    margin: 0 0 2rem;
    padding: 0;
    list-style: none;
  }

  :scope .cards + h3 {
    margin-block-start: 2rem;
  }

  :scope .cards > li {
    padding: 1rem;
    border: 1px solid var(--line);
    border-radius: 0.5rem;
  }

  :scope .cards h4 {
    margin: 0 0 0.75rem;
  }

  /* Overrides the summary tiles, which are the other dl on the page. */
  :scope .cards dl {
    grid-template-columns: max-content 1fr;
    gap: 0.35rem 1rem;
    margin: 0 0 1rem;
    font-size: 0.9rem;
  }

  :scope .cards dt {
    padding-block-start: 0.15rem;
  }

  :scope .cards dd {
    margin: 0;
    font-size: inherit;
    font-weight: inherit;
    overflow-wrap: anywhere;
  }

  :scope .cards dd ul {
    margin: 0;
    padding-inline-start: 1rem;
  }

  :scope a {
    color: var(--accent);
    font-weight: 650;
    text-underline-offset: 0.18em;
  }

  :scope form {
    display: grid;
    gap: 1rem;
    max-width: 48rem;
  }

  :scope dialog {
    width: min(48rem, 92vw);
    max-height: 88vh;
    padding: clamp(1rem, 2vw, 2rem);
    border: 1px solid var(--line);
    border-radius: 0.75rem;
    background: var(--paper);
    color: var(--ink);
  }

  :scope dialog::backdrop {
    background: rgb(41 36 33 / 45%);
  }

  :scope dialog form > div {
    padding-block: 0.75rem;
    border-top: 1px solid var(--line);
  }

  :scope dialog h2 {
    margin-block-end: 0;
  }

  :scope dialog ul {
    margin: 0;
    padding-inline-start: 1rem;
    list-style: none;
  }

  :scope > form {
    max-width: 28rem;
    margin: 10vh auto 0;
    padding: 2rem;
    border: 1px solid var(--line);
    border-radius: 0.75rem;
    background: var(--paper);
  }

  :scope form > div {
    display: grid;
    gap: 0.75rem;
  }

  :scope label {
    display: grid;
    gap: 0.35rem;
    color: var(--muted);
    font-weight: 650;
  }

  /* Shrink to the control and its text. A block-level label would stretch the
     full width of the form column and make the whole empty row clickable. */
  :scope label:has(> input[type='checkbox']),
  :scope label:has(> input[type='radio']) {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    width: fit-content;
  }

  :scope input,
  :scope textarea {
    width: 100%;
    padding: 0.65rem 0.75rem;
    border: 1px solid var(--line);
    border-radius: 0.4rem;
    background: white;
    color: var(--ink);
    font: inherit;
  }

  /* Without this radios fall through to the generic input rule above and get
     stretched to 100% with text-field padding. */
  :scope input[type='checkbox'],
  :scope input[type='radio'] {
    flex: none;
    width: 1.1rem;
    height: 1.1rem;
    padding: 0;
    accent-color: var(--accent);
  }

  :scope textarea {
    min-height: 6rem;
    resize: vertical;
  }

  :scope details {
    padding-block: 0.8rem;
    border-top: 1px solid var(--line);
  }

  :scope summary {
    font-weight: 700;
    cursor: pointer;
  }

  /* Only divide details from each other, not from whatever precedes the group. */
  :scope :not(details) + details {
    border-top: 0;
  }

  :scope details[open] > summary {
    margin-block-end: 1rem;
  }

  :scope details > :not(summary) {
    margin-inline-start: 1.5rem;
  }

  :scope [role='alert'] {
    color: #9d1f2f;
    font-weight: 650;
  }

  :scope [role='status'] {
    color: #356747;
    font-weight: 650;
  }

  :scope svg {
    fill: currentColor;
  }

  @media (max-width: 42rem) {
    :scope {
      padding: 0.75rem;
    }

    :scope section {
      padding: 1rem;
    }

    :scope [role='tablist'] {
      padding-inline: 0;
    }

    :scope [role='tabpanel'] {
      border-start-start-radius: 0;
    }

    :scope [role='tablist'] button {
      flex: 1 1 0;
    }
  }
`, function XochibodaAdmin({ effect }) {
  const element = this
  const session = state(null)
  const authReady = state(false)
  const dashboard = state(null)
  const isLoading = state(false)
  const activeTab = state(null)
  const error = state('')
  const notice = state('')
  const markingSent = state(null)
  const copiedLink = state(null)

  effect(() => {
    let connected = true

    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!connected) return
      if (sessionError) error.set(sessionError.message)
      session.set(data.session)
      authReady.set(true)
      if (data.session) loadDashboard()
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!connected) return
      session.set(nextSession)
      authReady.set(true)

      if (nextSession) {
        queueMicrotask(loadDashboard)
      } else {
        dashboard.set(null)
      }
    })

    return () => {
      connected = false
      listener.subscription.unsubscribe()
    }
  })

  async function loadDashboard() {
    isLoading.set(true)
    error.set('')

    try {
      const { data, error: dashboardError } = await supabase.rpc('admin_get_dashboard')
      if (dashboardError) throw dashboardError
      dashboard.set(data)
    } catch (loadError) {
      error.set(loadError.message || 'Unable to load the dashboard.')
    } finally {
      isLoading.set(false)
    }
  }

  async function signIn(event) {
    event.preventDefault()
    error.set('')
    notice.set('')

    const formData = new FormData(event.currentTarget)
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: formData.get('email'),
      password: formData.get('password'),
    })

    if (signInError) error.set(signInError.message)
  }

  async function signOut() {
    error.set('')
    notice.set('')
    const { error: signOutError } = await supabase.auth.signOut()
    if (signOutError) error.set(signOutError.message)
  }

  function openEditor(invitation) {
    element.querySelector('xochiboda-invitation-editor')?.openInvitation(invitation)
  }

  async function invitationSaved(event) {
    // A new invitation is unsent, so the default tab is where it shows up.
    if (event.detail.created) activeTab.set(null)
    await loadDashboard()
    notice.set(event.detail.created
      ? `Invitation created: ${invitationUrl(event.detail.code)}`
      : `Saved ${event.detail.name}.`)
  }

  async function markSent(invitation) {
    error.set('')
    notice.set('')
    markingSent.set(invitation.id)

    try {
      const { error: sentError } = await supabase.rpc('admin_mark_invitation_sent', {
        p_invitation_id: invitation.id,
      })
      if (sentError) throw sentError
      await loadDashboard()
      notice.set(`Marked ${invitation.name} as sent.`)
    } catch (sentError) {
      error.set(sentError.message || 'Unable to mark the invitation as sent.')
    } finally {
      markingSent.set(null)
    }
  }

  function copyEmails(emails) {
    error.set('')
    notice.set('')

    try {
      copyText(emails.join(', '))
      notice.set('Copied emails.')
    } catch (copyError) {
      error.set(copyError.message || 'Unable to copy the emails.')
    }
  }

  // Confirmed on the button itself, because the notice area is at the top of
  // the page and well out of view of the unsent list.
  function copyLink(invitation) {
    error.set('')
    notice.set('')

    try {
      copyText(new URL(invitationUrl(invitation.code), document.baseURI).href)
      copiedLink.set(invitation.id)
      setTimeout(() => {
        if (copiedLink.get() === invitation.id) copiedLink.set(null)
      }, 2000)
    } catch (copyError) {
      error.set(copyError.message || 'Unable to copy the link.')
    }
  }

  function renderUnsent(unsent) {
    return html`
      <section role="tabpanel" aria-labelledby="unsent-tab">
        <h2>Not sent</h2>
        <table>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Category</th>
              <th scope="col"></th>
            </tr>
          </thead>
          <tbody>
            ${unsent.map((item) => html`
              <tr>
                <th scope="row">${item.name}</th>
                <td>${item.category || '—'}</td>
                <td>
                  <div>
                    <button type="button" @click=${() => copyLink(item)}>
                      ${copiedLink.get() === item.id ? 'Copied' : 'Copy link'}
                    </button>
                    <button
                      type="button"
                      ?disabled=${markingSent.get() !== null}
                      @click=${() => markSent(item)}
                    >
                      ${markingSent.get() === item.id ? 'Saving…' : 'Mark as sent'}
                    </button>
                    <button type="button" @click=${() => openEditor(item)}>Edit</button>
                  </div>
                </td>
              </tr>
            `)}
          </tbody>
        </table>
      </section>
    `
  }

  function renderLogin() {
    return html`
      <form @submit=${signIn}>
        <label>
          Email
          <input type="email" name="email" autocomplete="username" required>
        </label>

        <label>
          Password
          <input type="password" name="password" autocomplete="current-password" required>
        </label>

        ${error.get() ? html`<p role="alert">${error.get()}</p>` : ''}

        <button type="submit">Sign in</button>
      </form>
    `
  }

  return () => {
    if (!authReady.get()) return html`<p>Loading…</p>`
    if (!session.get()) return renderLogin()

    const data = dashboard.get()
    const foodPeople = data?.invitees.filter((person) =>
      person.invitation_attending === true &&
      (person.is_vegetarian || person.diet_notes?.trim()),
    ) ?? []
    const kids = data?.invitees.filter((person) => person.is_kid) ?? []
    const unsent = data?.invitations.filter((item) => !item.sent_at) ?? []
    // The unsent tab leads while there is anything left to send, and drops out
    // once everything is sent, even if it was the selected tab.
    const tab = activeTab.get() === 'unsent' && !unsent.length
      ? 'invitations'
      : activeTab.get() ?? (unsent.length ? 'unsent' : 'invitations')
    // Declined guests are done with us, so they are left off the mailing list.
    const emails = (data?.invitations ?? [])
      .filter((item) => item.attending !== false)
      .flatMap((item) => emailList(item.emails))
    const rollup = data ? categoryRollup(data.invitations) : []
    const knownCategories = [...new Set(
      (data?.invitations ?? [])
        .map((item) => item.category?.trim())
        .filter(Boolean),
    )].sort()

    return html`
      <header>
        <p>Signed in as ${session.get().user.email}</p>
        <button type="button" @click=${() => openEditor(null)}>New invitation</button>
        <button type="button" @click=${loadDashboard}>Refresh</button>
        <button type="button" @click=${signOut}>Sign out</button>
      </header>

      ${error.get() ? html`<p role="alert">${error.get()}</p>` : ''}
      ${notice.get() ? html`<p role="status">${notice.get()}</p>` : ''}
      ${isLoading.get() ? html`<p>Loading dashboard…</p>` : ''}

      ${data
        ? html`
            <section aria-labelledby="summary-heading">
              <h2 id="summary-heading">Summary</h2>
              <dl>
                <div><dt>Invitations</dt><dd>${data.summary.total_invitations}</dd></div>
                <div><dt>Attending</dt><dd>${data.summary.attending}</dd></div>
                <div><dt>Declined</dt><dd>${data.summary.declined}</dd></div>
                <div><dt>No answer</dt><dd>${data.summary.unknown}</dd></div>
                <div><dt>No answer, people</dt><dd>${data.invitees.filter((person) => person.invitation_attending === null).length}</dd></div>
                <div><dt>Attending people</dt><dd>${data.summary.attending_guests}</dd></div>
                <div><dt>Vegetarians</dt><dd>${data.summary.vegetarian_guests}</dd></div>
                <div><dt>Kids</dt><dd>${data.summary.kid_guests}</dd></div>
              </dl>

              <h3>Categories</h3>
              <div class="scroll">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Category</th>
                      <th scope="col">Invitations</th>
                      <th scope="col">People</th>
                      <th scope="col">Attending</th>
                      <th scope="col">Attending people</th>
                      <th scope="col">Declined</th>
                      <th scope="col">No answer</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${rollup.map((row) => html`
                      <tr>
                        <th scope="row">${row.category}</th>
                        <td>${row.invitations}</td>
                        <td>${row.people}</td>
                        <td>${row.attending}</td>
                        <td>${row.attendingPeople}</td>
                        <td>${row.declined}</td>
                        <td>${row.pending}</td>
                      </tr>
                    `)}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th scope="row">Total</th>
                      <td>${rollup.reduce((total, row) => total + row.invitations, 0)}</td>
                      <td>${rollup.reduce((total, row) => total + row.people, 0)}</td>
                      <td>${rollup.reduce((total, row) => total + row.attending, 0)}</td>
                      <td>${rollup.reduce((total, row) => total + row.attendingPeople, 0)}</td>
                      <td>${rollup.reduce((total, row) => total + row.declined, 0)}</td>
                      <td>${rollup.reduce((total, row) => total + row.pending, 0)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <h3>People at each event</h3>
              ${['family_dinner', 'reception', 'ceremony', 'tornaboda', 'trip'].map((eventName) => {
                const eventField = {
                  reception: 'attends_reception',
                  family_dinner: 'attends_family_dinner',
                  tornaboda: 'attends_tornaboda',
                  trip: 'attends_trip',
                }[eventName]
                const eligibleForEvent = (item) => {
                  switch (eventName) {
                    case 'reception':
                      return item.is_gringo
                    case 'family_dinner':
                      return item.is_family
                    case 'trip':
                      return item.is_peer
                    default:
                      return true
                  }
                }
                const eventInvitations = data.invitations.filter((item) =>
                  item.attending === true && (eventName === 'ceremony' || item[eventField] === true),
                )
                const pendingInvitations = data.invitations.filter((item) =>
                  item.attending === null && eligibleForEvent(item),
                )
                const people = eventInvitations.flatMap((item) => item.invitees)
                const pendingPeople = pendingInvitations.flatMap((item) => item.invitees)
                const vegetarians = people.filter((person) => person.is_vegetarian)
                const dietaryRequirements = people.filter((person) => person.diet_notes?.trim())
                const otherRequirements = eventInvitations.filter((item) =>
                  item.special_requirements?.trim(),
                )

                return html`
                  <details>
                    <summary>
                      ${eventLabel(eventName)} — ${people.length} confirmed / ${pendingPeople.length} unanswered
                    </summary>

                    <h4>People</h4>
                    ${people.length
                      ? html`<ul>${people.map((person) => html`<li>${person.name}</li>`)}</ul>`
                      : html`<p>No one yet.</p>`}

                    <h4>Vegetarians — ${vegetarians.length}</h4>
                    ${vegetarians.length
                      ? html`<ul>${vegetarians.map((person) => html`<li>${person.name}</li>`)}</ul>`
                      : html`<p>None.</p>`}

                    <h4>Dietary requirements — ${dietaryRequirements.length}</h4>
                    ${dietaryRequirements.length
                      ? html`
                          <ul>
                            ${dietaryRequirements.map((person) => html`
                              <li><strong>${person.name}:</strong> ${person.diet_notes}</li>
                            `)}
                          </ul>
                        `
                      : html`<p>None.</p>`}

                    <h4>Other requirements — ${otherRequirements.length}</h4>
                    ${otherRequirements.length
                      ? html`
                          <ul>
                            ${otherRequirements.map((item) => html`
                              <li><strong>${item.name}:</strong> ${item.special_requirements}</li>
                            `)}
                          </ul>
                        `
                      : html`<p>None.</p>`}
                  </details>
                `
              })}
            </section>

            <details>
              <summary>Diets</summary>
              ${foodPeople.length
                ? html`
                    <table>
                      <thead>
                        <tr>
                          <th scope="col">Name</th>
                          <th scope="col">Invitation</th>
                          <th scope="col">Vegetarian</th>
                          <th scope="col">Dietary requirements</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${foodPeople.map((person) => html`
                          <tr>
                            <th scope="row">${person.name}</th>
                            <td>${person.invitation_name}</td>
                            <td>${yesNo(person.is_vegetarian)}</td>
                            <td>${person.diet_notes || '—'}</td>
                          </tr>
                        `)}
                      </tbody>
                    </table>
                  `
                : html`<p>No vegetarian guests or dietary requirements yet.</p>`}
            </details>

            <details>
              <summary>Kids — ${kids.length}</summary>
              ${kids.length
                ? html`
                    <table>
                      <thead>
                        <tr>
                          <th scope="col">Name</th>
                          <th scope="col">Age</th>
                          <th scope="col">Invitation</th>
                          <th scope="col">RSVP</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${kids.map((person) => html`
                          <tr>
                            <th scope="row">${person.name}</th>
                            <td>${person.age ?? '—'}</td>
                            <td>${person.invitation_name}</td>
                            <td>${attendingLabel(person.invitation_attending)}</td>
                          </tr>
                        `)}
                      </tbody>
                    </table>
                  `
                : html`<p>No kids yet.</p>`}
            </details>

            <details>
              <summary>Emails</summary>
              ${emails.length
                ? html`
                    <label>
                      All emails, except declined invitations
                      <textarea readonly .value=${emails.join(', ')}></textarea>
                    </label>
                    <button type="button" @click=${() => copyEmails(emails)}>Copy emails</button>
                  `
                : html`<p>No emails yet.</p>`}
            </details>

            <nav aria-label="Admin sections">
              <div role="tablist">
                ${unsent.length
                  ? html`
                      <button
                        id="unsent-tab"
                        type="button"
                        role="tab"
                        aria-selected=${tab === 'unsent' ? 'true' : 'false'}
                        @click=${() => activeTab.set('unsent')}
                      >
                        Not sent — ${unsent.length}
                      </button>
                    `
                  : ''}
                <button
                  id="invitations-tab"
                  type="button"
                  role="tab"
                  aria-selected=${tab === 'invitations' ? 'true' : 'false'}
                  @click=${() => activeTab.set('invitations')}
                >
                  Invitations
                </button>
                <button
                  id="invitees-tab"
                  type="button"
                  role="tab"
                  aria-selected=${tab === 'invitees' ? 'true' : 'false'}
                  @click=${() => activeTab.set('invitees')}
                >
                  Invitees
                </button>
              </div>
            </nav>

            ${(() => {
              switch (tab) {
                case 'unsent':
                  return renderUnsent(unsent)
                case 'invitations':
                  return html`
                    <xochiboda-invitations
                      .items=${data.invitations}
                      @edit-invitation=${(event) => openEditor(event.detail)}
                    ></xochiboda-invitations>
                  `
                case 'invitees':
                  return html`<xochiboda-invitees .items=${data.invitees}></xochiboda-invitees>`
                default:
                  return html``
              }
            })()}

            <xochiboda-invitation-editor
              .categories=${knownCategories}
              @invitation-saved=${invitationSaved}
            ></xochiboda-invitation-editor>
          `
        : ''}
    `
  }
})
