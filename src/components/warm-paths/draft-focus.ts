// Hand-off between "Draft ask" and the draft panel (client only). The panel sits below the contact list, so on a
// phone it opens off-screen; when the user picks a contact, the panel heading takes focus (which scrolls it into
// view and tells screen-reader users where the draft is). A plain page load or a kind/role switch inside the
// panel does not move focus, because nothing requested it.

let pending: string | null = null;

/** Called when the user picks a contact: the next panel rendered for it takes focus. */
export function requestDraftFocus(contactId: string): void {
  pending = contactId;
}

/** True once, for the contact whose panel should take focus now. */
export function takeDraftFocus(contactId: string): boolean {
  if (pending !== contactId) return false;
  pending = null;
  return true;
}

export function clearDraftFocus(): void {
  pending = null;
}
