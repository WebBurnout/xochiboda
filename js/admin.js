import { createClient } from 'https://scripts.hot.page/@supabase/supabase-js@2'
import {
  html,
  lightElement,
  state,
} from 'https://scripts.hot.page/@hot-page/fun@0.0.3'
import { supabaseConfig } from './config.js'

const supabase = createClient(supabaseConfig.url, supabaseConfig.anonKey)

function emptyInvitee() {
  return { name: '', isVegetarian: false, dietNotes: '' }
}

function invitationStatus(invitation) {
  if (invitation.attending === true) return 'Attending'
  if (invitation.attending === false) return 'Declined'
  return 'Pending'
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

function invitationUrl(id, path = '/invitation') {
  const url = new URL(path, window.location.origin)
  url.searchParams.set('invitation', id)
  return url.href
}

function reactiveProperty(element, name, initialValue) {
  const value = state(initialValue)
  Object.defineProperty(element, name, {
    get: () => value.get(),
    set: (nextValue) => value.set(nextValue),
  })
  return value
}

lightElement(function XochibodaInvitations() {
  const items = reactiveProperty(this, 'items', [])

  function renderTable(invitations) {
    return html`
      <table>
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Relationship</th>
            <th scope="col">RSVP</th>
            <th scope="col">Invitees</th>
            <th scope="col">Contact</th>
            <th scope="col">Reception</th>
            <th scope="col">Family dinner</th>
            <th scope="col">Tornaboda</th>
            <th scope="col">Trip</th>
            <th scope="col">Party house</th>
            <th scope="col">Requirements</th>
            <th scope="col">Message</th>
            <th scope="col">Responded</th>
            <th scope="col">Link</th>
          </tr>
        </thead>
        <tbody>
          ${invitations.map((item) => html`
            <tr>
              <th scope="row">${item.name}</th>
              <td>${item.relationship}</td>
              <td>${invitationStatus(item)}</td>
              <td>
                <ul>
                  ${item.invitees.map((person) => html`
                    <li>
                      ${person.name}${person.is_vegetarian ? ' — vegetarian' : ''}${person.diet_notes ? ` — ${person.diet_notes}` : ''}
                    </li>
                  `)}
                </ul>
              </td>
              <td>
                ${item.email ? html`<a href=${`mailto:${item.email}`}>${item.email}</a>` : '—'}
                ${item.phone ? html`<br><a href=${`tel:${item.phone}`}>${item.phone}</a>` : ''}
              </td>
              <td>${item.is_gringo ? yesNo(item.attends_reception) : 'n/a'}</td>
              <td>${item.is_family ? yesNo(item.attends_family_dinner) : 'n/a'}</td>
              <td>${yesNo(item.attends_tornaboda)}</td>
              <td>${item.is_peer ? yesNo(item.attends_trip) : 'n/a'}</td>
              <td>${item.is_gringo && !item.is_family ? yesNo(item.wants_party_house) : 'n/a'}</td>
              <td>${item.special_requirements || '—'}</td>
              <td>${item.message || '—'}</td>
              <td>${formatDate(item.responded_at)}</td>
              <td>
                <a href=${invitationUrl(item.id, '/rsvp-2')}>rsvp</a>
                <a href=${invitationUrl(item.id, '/invitation')}>invite</a>
              </td>
            </tr>
          `)}
        </tbody>
      </table>
    `
  }

  return () => {
    const invitations = items.get()
    const responded = invitations.filter((item) => item.responded_at !== null)
    const notResponded = invitations.filter((item) => item.responded_at === null)

    return html`
      <section role="tabpanel" aria-labelledby="invitations-tab">
        <h2>Invitations</h2>

        <h3>Responded — ${responded.length}</h3>
        ${renderTable(responded)}

        <h3>Not responded — ${notResponded.length}</h3>
        ${renderTable(notResponded)}
      </section>
    `
  }
})

lightElement(function XochibodaInvitees() {
  const items = reactiveProperty(this, 'items', [])

  return () => html`
    <section role="tabpanel" aria-labelledby="invitees-tab">
      <h2>Invitees</h2>
      <table>
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Invitation</th>
            <th scope="col">RSVP</th>
            <th scope="col">Vegetarian</th>
            <th scope="col">Dietary notes</th>
          </tr>
        </thead>
        <tbody>
          ${items.get().map((person) => html`
            <tr>
              <td>${person.name}</td>
              <td>${person.invitation_name}</td>
              <td>${person.invitation_attending === true ? 'Attending' : person.invitation_attending === false ? 'Declined' : 'Pending'}</td>
              <td>${yesNo(person.is_vegetarian)}</td>
              <td>${person.diet_notes || '—'}</td>
            </tr>
          `)}
        </tbody>
      </table>
    </section>
  `
})

lightElement(function XochibodaNewInvitation() {
  const invitees = state([emptyInvitee()])
  const isCreating = state(false)
  const error = state('')

  function changeInvitee(index, patch) {
    invitees.set(invitees.get().map((person, personIndex) =>
      personIndex === index ? { ...person, ...patch } : person,
    ))
  }

  function addInvitee() {
    invitees.set([...invitees.get(), emptyInvitee()])
  }

  function removeInvitee(index) {
    invitees.set(invitees.get().filter((_, personIndex) => personIndex !== index))
  }

  async function createInvitation(event) {
    event.preventDefault()
    error.set('')

    const form = event.currentTarget
    if (!form.reportValidity()) return

    const submittedInvitees = invitees.get()
    if (submittedInvitees.some((person) => !person.name.trim())) {
      error.set('Every invitee must have a name.')
      return
    }

    const formData = new FormData(form)
    isCreating.set(true)

    try {
      const { data, error: createError } = await supabase.rpc('admin_create_invitation', {
        p_name: formData.get('name'),
        p_relationship: formData.get('relationship'),
        p_email: formData.get('email'),
        p_phone: formData.get('phone'),
        p_is_gringo: formData.get('is_gringo') === 'on',
        p_is_family: formData.get('is_family') === 'on',
        p_is_peer: formData.get('is_peer') === 'on',
        p_invitees: submittedInvitees.map((person) => ({
          name: person.name,
          is_vegetarian: person.isVegetarian,
          diet_notes: person.dietNotes,
        })),
      })

      if (createError) throw createError

      form.reset()
      invitees.set([emptyInvitee()])
      this.dispatchEvent(new CustomEvent('invitation-created', {
        bubbles: true,
        detail: data,
      }))
    } catch (createError) {
      error.set(createError.message || 'Unable to create the invitation.')
    } finally {
      isCreating.set(false)
    }
  }

  return () => html`
    <section role="tabpanel" aria-labelledby="new-invitation-tab">
      <h2>New invitation</h2>

      <form @submit=${createInvitation}>
        <div>
          <label>
            Invitation name
            <input type="text" name="name" required>
          </label>
        </div>

        <div>
          <label>
            Relationship
            <input type="text" name="relationship" required>
          </label>
        </div>

        <div>
          <label>
            Email
            <input type="email" name="email">
          </label>
        </div>

        <div>
          <label>
            Phone
            <input type="tel" name="phone">
          </label>
        </div>

        <div>
          <label><input type="checkbox" name="is_gringo"> Gringo</label>
          <label><input type="checkbox" name="is_family"> Family</label>
          <label><input type="checkbox" name="is_peer"> Peer</label>
        </div>

        <div>
          <h3>Invitees</h3>
          ${invitees.get().map((person, index) => html`
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
                  .checked=${person.isVegetarian}
                  @change=${(event) => changeInvitee(index, { isVegetarian: event.target.checked })}
                >
                Vegetarian
              </label>

              <label>
                Dietary notes
                <textarea
                  .value=${person.dietNotes}
                  @input=${(event) => changeInvitee(index, { dietNotes: event.target.value })}
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

        ${error.get() ? html`<p role="alert">${error.get()}</p>` : ''}

        <button type="submit" ?disabled=${isCreating.get()}>
          ${isCreating.get() ? 'Creating…' : 'Create invitation'}
        </button>
      </form>
    </section>
  `
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
    max-width: 96rem;
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

  :scope [role='tablist'] {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  :scope [role='tab'][aria-selected='false'] {
    border-color: var(--line);
    background: transparent;
    color: var(--ink);
  }

  :scope [role='tab'][aria-selected='true'] {
    box-shadow: inset 0 -3px 0 white;
  }

  :scope [role='tabpanel'] {
    overflow-x: auto;
  }

  :scope table {
    width: 100%;
    min-width: 70rem;
    border-collapse: collapse;
    font-size: 0.9rem;
  }

  :scope xochiboda-invitations table {
    margin-block-end: 2rem;
  }

  :scope th,
  :scope td {
    padding: 0.8rem;
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

  :scope td ul {
    min-width: 10rem;
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

  :scope label:has(> input[type='checkbox']) {
    display: flex;
    align-items: center;
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

  :scope input[type='checkbox'] {
    width: 1.1rem;
    height: 1.1rem;
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

    :scope [role='tablist'] button {
      flex: 1 1 100%;
    }
  }
`, function XochibodaAdmin({ effect }) {
  const session = state(null)
  const authReady = state(false)
  const dashboard = state(null)
  const isLoading = state(false)
  const activeTab = state('invitations')
  const error = state('')
  const notice = state('')

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

  async function invitationCreated(event) {
    activeTab.set('invitations')
    await loadDashboard()
    notice.set(`Invitation created: ${invitationUrl(event.detail.id)}`)
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

    return html`
      <header>
        <p>Signed in as ${session.get().user.email}</p>
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
                <div><dt>Responded</dt><dd>${data.summary.responded}</dd></div>
                <div><dt>Declined</dt><dd>${data.summary.declined}</dd></div>
                <div><dt>Pending invitations</dt><dd>${data.summary.pending}</dd></div>
                <div><dt>Pending people</dt><dd>${data.invitees.filter((person) => person.invitation_attending === null).length}</dd></div>
                <div><dt>Attending people</dt><dd>${data.summary.attending_guests}</dd></div>
                <div><dt>Vegetarians</dt><dd>${data.summary.vegetarian_guests}</dd></div>
              </dl>

              <h3>People at each event</h3>
              ${['ceremony', ...Object.keys(data.events)].map((eventName) => {
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
                      ${eventLabel(eventName)} — ${people.length} confirmed / ${pendingPeople.length} pending
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

            <nav aria-label="Admin sections">
              <div role="tablist">
                <button
                  id="invitations-tab"
                  type="button"
                  role="tab"
                  aria-selected=${activeTab.get() === 'invitations' ? 'true' : 'false'}
                  @click=${() => activeTab.set('invitations')}
                >
                  Invitations
                </button>
                <button
                  id="invitees-tab"
                  type="button"
                  role="tab"
                  aria-selected=${activeTab.get() === 'invitees' ? 'true' : 'false'}
                  @click=${() => activeTab.set('invitees')}
                >
                  Invitees
                </button>
                <button
                  id="new-invitation-tab"
                  type="button"
                  role="tab"
                  aria-selected=${activeTab.get() === 'new' ? 'true' : 'false'}
                  @click=${() => activeTab.set('new')}
                >
                  New invitation
                </button>
              </div>
            </nav>

            ${(() => {
              switch (activeTab.get()) {
                case 'invitations':
                  return html`<xochiboda-invitations .items=${data.invitations}></xochiboda-invitations>`
                case 'invitees':
                  return html`<xochiboda-invitees .items=${data.invitees}></xochiboda-invitees>`
                case 'new':
                  return html`<xochiboda-new-invitation @invitation-created=${invitationCreated}></xochiboda-new-invitation>`
                default:
                  return html``
              }
            })()}
          `
        : ''}
    `
  }
})
