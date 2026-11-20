/** Events the plugin triggers on the editor (`editor.on(EVENTS.change, …)`). */
export const EVENTS = {
  /** The forms were (re)read or one changed. Payload: `FormDef[]`. */
  forms: 'forms:list',
  /** A form was written. Payload: `FormDef`. */
  saved: 'forms:saved',
  /** A form was deleted. Payload: `id`. */
  removed: 'forms:removed',
  /** A submission was sent from the editor's preview. Payload: `{ formId, result }`. */
  submitted: 'forms:submitted',
} as const;

export const COMMANDS = {
  /** Opens the forms editor; `{ id }` — on that form. */
  open: 'forms:open',
  /** Opens the editor on the form of the selected component (or `{ component }`). */
  edit: 'forms:edit',
} as const;

/** Events of the site's `<form>` (runtime). */
export const DOM_EVENTS = {
  submit: 'gjsf:submit',
  success: 'gjsf:success',
  error: 'gjsf:error',
} as const;
