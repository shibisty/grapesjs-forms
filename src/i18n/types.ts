/** Every UI string of the plugin. `%s` is a placeholder filled in order. */
export interface FormsLabels {
  forms: string;
  newForm: string;
  defaultFormName: string;
  noForms: string;
  formName: string;
  fields: string;
  settings: string;
  preview: string;
  submissions: string;
  json: string;
  addField: string;
  noFields: string;
  noFieldSelected: string;

  fieldType: string;
  fieldLabel: string;
  fieldName: string;
  fieldNameHint: string;
  placeholder: string;
  help: string;
  required: string;
  defaultValue: string;
  hiddenValue: string;
  options: string;
  optionsHint: string;
  addOption: string;
  optionLabel: string;
  optionValue: string;
  multiple: string;
  min: string;
  max: string;
  step: string;
  minLength: string;
  maxLength: string;
  pattern: string;
  accept: string;
  autocomplete: string;
  rows: string;
  readonly: string;
  disabled: string;
  width: string;
  attrs: string;
  addAttr: string;
  attrName: string;
  attrValue: string;
  text: string;

  type_text: string;
  type_email: string;
  type_tel: string;
  type_url: string;
  type_number: string;
  type_password: string;
  type_textarea: string;
  type_select: string;
  type_radio: string;
  type_checkbox: string;
  type_checkboxes: string;
  type_date: string;
  type_time: string;
  type_datetime: string;
  type_range: string;
  type_color: string;
  type_file: string;
  type_hidden: string;
  type_heading: string;
  type_paragraph: string;

  moveUp: string;
  moveDown: string;
  duplicate: string;
  remove: string;

  endpoint: string;
  /** %s — the default address */
  endpointHint: string;
  noEndpoint: string;
  successMessage: string;
  errorMessage: string;
  redirect: string;
  reset: string;
  honeypot: string;
  submitLabel: string;
  formAttrs: string;

  /** Default texts the site shows */
  submit: string;
  success: string;
  error: string;
  problem_required: string;
  problem_email: string;
  problem_url: string;
  problem_number: string;
  problem_min: string;
  problem_max: string;
  problem_minLength: string;
  problem_maxLength: string;
  problem_pattern: string;
  problem_option: string;
  problem_date: string;
  problem_time: string;
  problem_color: string;

  placeholders: string;
  placeholdersHint: string;

  noSubmissions: string;
  submissionsUnsupported: string;
  date: string;
  refresh: string;
  downloadCsv: string;
  loadMore: string;
  /** %s — shown, %s — total */
  shownOf: string;
  confirmDeleteSubmission: string;

  importSurveyJs: string;
  exportSurveyJs: string;
  applyJson: string;
  jsonHint: string;
  /** %s — error */
  jsonError: string;
  /** %s — list */
  skipped: string;

  removeForm: string;
  /** %s — form name */
  confirmRemoveForm: string;
  duplicateForm: string;
  /** %s — form name */
  copyOf: string;
  close: string;
  saving: string;
  saved: string;
  /** %s — error */
  saveError: string;
  /** Must mention 412 */
  conflict: string;

  chooseForm: string;
  editForm: string;
  noForm: string;
  blocksCategory: string;
  newFormBlock: string;
  missingForm: string;
  previewHint: string;
  previewSent: string;

  defaultName: string;
  defaultEmail: string;
  defaultMessage: string;
}
