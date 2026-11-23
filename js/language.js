// Spanish is the default, so the static markup ships without a lang and only
// flips to English when the browser asks for it. Everything else keys off the
// exported flag so the DOM and the rendered copy can never disagree.
// A ?lang=en|es query param overrides the browser language.
const requestedLanguage = new URL(window.location.href).searchParams.get('lang')
const hasOverride = requestedLanguage === 'en' || requestedLanguage === 'es'

export const isEnglish = hasOverride
  ? requestedLanguage === 'en'
  : navigator.language.startsWith('en')

// The override only lives in the URL, so carry it onto every same-origin link,
// including ones rendered later by components.
function addLanguageToLink(link) {
  const href = link.getAttribute('href')
  if (!href || href.startsWith('#')) return

  // Relative links resolve against <base>, which can point at a different
  // origin than the page itself.
  const url = new URL(href, document.baseURI)
  if (url.origin !== new URL(document.baseURI).origin) return
  if (url.searchParams.get('lang') === requestedLanguage) return

  url.searchParams.set('lang', requestedLanguage)
  link.setAttribute('href', url.pathname + url.search + url.hash)
}

function addLanguageToLinks(root) {
  if (root.matches?.('a[href]')) addLanguageToLink(root)
  root.querySelectorAll?.('a[href]').forEach(addLanguageToLink)
}

if (hasOverride) {
  const start = () => {
    addLanguageToLinks(document)
    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes') {
          addLanguageToLinks(mutation.target)
        } else {
          mutation.addedNodes.forEach(addLanguageToLinks)
        }
      }
    }).observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['href'],
    })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start)
  } else {
    start()
  }
}

if (isEnglish) {
  document.documentElement.lang = 'en'
}

const COPY = {
  es: {
    attendingYes: 'Sí, ahí estaremos',
    attendingNo: 'Lo sentimos, no podemos ir',
    guest: (number) => `Persona ${number}`,
    name: 'Nombre',
    vegetarian: 'Vegetariano/a',
    isKid: 'Es niño/a',
    age: 'Edad',
    dietNotes: 'Restricciones alimenticias',
    dietNotesLink: '(es más complicado)',
    removeGuest: 'Quitar persona',
    addGuest: 'Agregar persona',
    eventsQuestion: '¿A qué eventos asistirán?',
    familyDinner: 'Cena familiar',
    reception: 'Recepción de bienvenido',
    tornaboda: 'Tornaboda',
    trip: 'Viaje',
    specialRequirements: 'Requerimientos especiales',
    declinedThanks: 'Gracias por considerarlo. Los queremos. Que les vaya bien.',
    message: 'Mensaje',
    saving: 'Guardando…',
    saved: 'Todo guardado',
    needOneGuest: 'Agrega al menos una persona.',
    noInvitationLoaded: 'No hay ninguna invitación cargada.',
    loadFailed: (status) => `No se pudo cargar la invitación (${status}).`,
    loadFailedGeneric: 'No se pudo cargar la invitación.',
    saveFailed: (status) => `No se pudo guardar tu respuesta (${status}).`,
    saveFailedGeneric: 'No se pudo guardar tu respuesta.',
    viewInvitation: 'Ver tu invitación',
  },
  en: {
    attendingYes: 'Yes, I will be attending',
    attendingNo: 'Sorry, I can’t make it',
    guest: (number) => `Guest ${number}`,
    name: 'Name',
    vegetarian: 'Vegetarian',
    isKid: 'Person is a kid',
    age: 'Age',
    dietNotes: 'Dietary notes',
    dietNotesLink: '(it’s more complicated)',
    removeGuest: 'Remove guest',
    addGuest: 'Add guest',
    eventsQuestion: 'Which events will you attend?',
    familyDinner: 'Family dinner',
    reception: 'Welcome Reception',
    tornaboda: 'Tornaboda',
    trip: 'Trip',
    specialRequirements: 'Special requirements',
    declinedThanks: 'Thanks for considering it. We love you. Godspeed.',
    message: 'Message',
    saving: 'Saving…',
    saved: 'All changes saved',
    needOneGuest: 'Please add at least one guest.',
    noInvitationLoaded: 'No invitation is loaded.',
    loadFailed: (status) => `Unable to load invitation (${status}).`,
    loadFailedGeneric: 'Unable to load invitation.',
    saveFailed: (status) => `Unable to save RSVP (${status}).`,
    saveFailedGeneric: 'Unable to save your RSVP.',
    viewInvitation: 'View your invitation',
  },
}

export const copy = COPY[isEnglish ? 'en' : 'es']
