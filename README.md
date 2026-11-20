# grapesjs-forms

A GrapesJS plugin for forms made in **an editor of their own**: field types, options, placeholders,
attributes, hidden fields with values (`{{query.utm_source}}`, `{{page.slug}}`…). A form becomes a
**component** you drop on any page; it is built of plain HTML elements with stable classes, so it
**looks like the site** — the page's CSS (made in the Style Manager like anything else) styles it.
What visitors send goes to **your API** (`openapi.yaml`), or to IndexedDB / memory while you try it.

- 18 input types (text, e-mail, phone, URL, number, password, long text, dropdown, radio buttons,
  checkbox, checkboxes, date, time, date and time, slider, colour, file, hidden) + heading and paragraph
- per field: label, key, placeholder, help, required, default value, options, min / max / step,
  min / max length, pattern, accept, autocomplete, rows, read only, disabled, width (1/2, 1/3…), any attributes
- per form: endpoint, button text, success / error message, redirect, reset, spam trap (honeypot), form attributes
- preview with the open page's styles (sends to the store), submissions table with CSV, JSON view
- **SurveyJS** JSON import / export (`fromSurveyJs`, `toSurveyJs`) for the plain-form parts of a survey
- the site side is a few KB with no dependencies; servers get `validateSubmission()` with the same rules

## Install

```bash
npm install grapesjs-forms
```

```js
import grapesjs from 'grapesjs';
import forms from 'grapesjs-forms';

grapesjs.init({
  container: '#gjs',
  plugins: [forms],
  pluginsOpts: {
    [forms.meta.id]: {
      rest: { url: '/api/forms' },          // admin API (openapi.yaml); omit → IndexedDB
      // submitUrl: 'https://api.site.com', // where the published site posts; default rest.url
    },
  },
});
```

Or with `<script>`: `grapesjs-forms.umd.js` registers itself as `grapesjs-forms`
(`plugins: ['grapesjs-forms']`, `pluginsOpts: { 'grapesjs-forms': {…} }`).

## How it works

1. **Forms** (button in the *options* panel, or `editor.runCommand('forms:open')`) — the editor:
   forms on the left; *Fields* (types → list → properties), *Settings*, *Preview*, *Submissions*, *JSON*.
   Edits are saved after a short pause (`autosaveDelay`).
2. **Blocks → Forms**: one block per form, and *New form* (creates one and opens the editor).
   A form component has a *Form* trait (switch the form) and *Edit the form*; double-click opens the editor too.
3. Inside, the parts are made by the plugin: they can be selected and **styled**, not moved or deleted.
   When the form changes, every component of it in the open project is rebuilt (not on the undo stack);
   the classes and attributes you added to the `<form>` stay. A project opened later with an older copy
   is brought up to date. A deleted form leaves its copy, marked.
4. The exported page has the form's HTML and its script (GrapesJS' `getJs()`): it fills placeholders,
   checks, posts, shows the server's per-field errors and the message (or redirects).

### Design

The site's CSS styles the forms. Classes:

| class | element |
|---|---|
| `.gjsf-form` | `<form>` (add your own class for a look of its own) |
| `.gjsf-field`, `.gjsf-field--<type>`, `.gjsf-w-1-2`… | a field's wrapper (`fieldset` for radio / checkboxes); `.is-required`, `.has-error` |
| `.gjsf-label`, `.gjsf-req` | label / legend, the `*` |
| `.gjsf-input` | input, textarea, select |
| `.gjsf-options`, `.gjsf-option`, `.gjsf-check`, `.gjsf-option-label` | choices |
| `.gjsf-help`, `.gjsf-error` | help line, error line |
| `.gjsf-heading`, `.gjsf-text` | heading, paragraph |
| `.gjsf-actions`, `.gjsf-submit` | the button row and the button (keeps the site's `button` look) |
| `.gjsf-message` | the message after sending; the form gets `.is-sending`, `.is-success`, `.is-error` |

`baseCss: true` (default) writes a small base sheet into the project CSS once — it inherits fonts
and colours; restyle or delete it freely. The honeypot rule (`.gjsf-hp`) is always added.

### Placeholders

In a field's value (above all a hidden one):

| | |
|---|---|
| `{{form.id}}`, `{{form.name}}` | filled when the page is built |
| `{{page.id}}`, `{{page.name}}`, `{{page.slug}}`… | the open page of [grapesjs-site-pages](https://www.npmjs.com/package/grapesjs-site-pages) (any record field); without it the browser gives `path` / `title` |
| `{{url}}`, `{{path}}`, `{{host}}`, `{{referrer}}`, `{{title}}`, `{{lang}}` | the visitor's browser |
| `{{query.utm_source}}`, `{{cookie.name}}`, `{{storage.key}}` | query string, cookie, localStorage |
| `{{date}}`, `{{time}}`, `{{datetime}}`, `{{timestamp}}`, `{{uuid}}` | now; a random id |

Hidden fields are filled again on every submit; visible ones once (the visitor may change them).

## Backend

`openapi.yaml` describes what the plugin calls and what it expects back:

| | |
|---|---|
| `GET /forms`, `GET/PUT/DELETE /forms/{id}` | the editor (admin); `PUT` with `If-Match` → 412 on a newer version |
| `POST /forms/{id}/submissions` | **the site** (public): `{ data, meta }` JSON, or multipart with files (`_meta`) |
| `GET /forms/{id}/submissions?limit&offset`, `DELETE …/{sid}` | the *Submissions* tab |

Answer 422 `{ error, errors: { field: ['required'] } }` to show errors under fields (codes become the
form's texts in the visitor's language; plain messages are shown as they are). A 201 may carry
`message` or `redirect`. Validate with the same rules as the editor:

```js
import { validateSubmission } from 'grapesjs-forms'; // no DOM needed (Node, workers)
const r = validateSubmission(form, body.data);        // { ok, errors, data (cleaned), spam }
```

The server side is yours (e.g. a microservice): this package only posts to the endpoint and reads the answer.

### Stores

```js
import { RestFormStore, IndexedDbFormStore, MemoryFormStore } from 'grapesjs-forms';
forms(editor, { store: new RestFormStore({ url: '/api/forms', headers: () => ({ 'X-CSRF-TOKEN': token }), credentials: 'include' }) });
```

Or your own: `listForms`, `getForm`, `saveForm(form, ifVersion)`, `deleteForm`, `submit(formId, data, meta)`,
and optionally `listSubmissions`, `deleteSubmission`. IndexedDB keeps the editor's own submissions (the
preview); a published site cannot reach it — give it a `submitUrl` / REST backend, or handle
`gjsf:submit` yourself:

```js
form.addEventListener('gjsf:submit', (e) => {
  e.detail.promise = myApi.send(e.detail.data); // resolve → success; reject { status, body: { error, errors } } → errors
});
```

### Forms without GrapesJS on the page

```js
const html = editor.Forms.html(formId); // or formHtml(form, { action }) on a server
```
```html
<script type="module">import { enhanceForms } from 'grapesjs-forms/runtime'; enhanceForms();</script>
<!-- or dist/runtime.iife.js → gjsfRuntime.enhanceForms() -->
```

## SurveyJS

`fromSurveyJs(json)` takes text inputs (every `inputType`), comment, dropdown, tagbox, radiogroup,
checkbox, boolean, rating, file, html; panels and pages are flattened, invisible text questions become
hidden fields. Logic (visibleIf, expressions, matrices…) has no place in a plain HTML form: such
questions are listed in `skipped`. Paste a survey into the *JSON* tab, or:

```js
const { form, skipped } = await editor.Forms.importSurveyJs(surveyJson);
const survey = editor.Forms.exportSurveyJs(form.id);
```

The SurveyJS runner itself is not used: it renders its own markup and themes, while these forms take
the site's design.

## API — `editor.Forms`

```ts
list(), get(id), reload()
create(init?), update(id, patch), remove(id), duplicate(id), flush()
open(id?), close()
actionOf(form | id)                 // where it posts on the site
html(id, opts?)                     // the form as HTML
submit(id, data, meta?)             // through the store
rebuild(id?)                        // components in the open project
importSurveyJs(json, into?), exportSurveyJs(id)
```

Events: `forms:list`, `forms:saved`, `forms:removed`, `forms:submitted`.
Commands: `forms:open` (`{ id }`), `forms:edit` (`{ component }`).
Site (on the `<form>`): `gjsf:submit` (cancelable, `detail.promise`), `gjsf:success`, `gjsf:error`.

## Options

| option | default | |
|---|---|---|
| `store` | — | your backend (wins) |
| `rest` | `null` | `{ url, headers?, credentials?, fetch? }` (openapi.yaml); `null` → IndexedDB |
| `submitUrl` | `rest.url` | base the published site posts to; applies live |
| `dbName` | `gjs-forms` | IndexedDB database |
| `autosaveDelay` | `600` | ms; applies live |
| `blocks` | `true` | blocks of the forms |
| `baseCss` | `true` | the base form sheet in the project CSS |
| `panelId` | `options` | panel of the *Forms* button |
| `labels` | `{}` | texts (any key of `FormsLabels`) |
| `injectCss` | `true` | the plugin's own UI styles |

Languages: English, Russian, Ukrainian (through `editor.I18n`, namespace `gjsForms`); others fall back to English
or take `labels`.

This plugin follows the plugin contract of grapesjs-plugins-manager (`getOptions` / `setOptions`).

## Development

```bash
npm install
npm run dev        # index.html with the sources
npm test           # vitest + jsdom + real grapesjs
npm run typecheck
npm run build      # dist/: ES + UMD, runtime.js / runtime.iife.js, .d.ts
```

MIT
