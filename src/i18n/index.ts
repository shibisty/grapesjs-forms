import type { Editor } from 'grapesjs';
import type { FormsLabels } from './types';

import en from './locales/en';
import ru from './locales/ru';
import uk from './locales/uk';

export type { FormsLabels };

/** i18n namespace inside `editor.I18n`: keys are `gjsForms.<label>`. */
export const I18N_NS = 'gjsForms';

/** Built-in languages; others fall back to English (or come through `labels` / `editor.I18n`). */
export const locales: Record<string, FormsLabels> = { en, ru, uk };

export const SUPPORTED_LOCALES: readonly string[] = Object.keys(locales);

/**
 * Registers the built-in locales in `editor.I18n` under `gjsForms` (merge —
 * messages of the site and of other plugins survive). Copies are
 * registered, so the exported `locales` are never mutated.
 */
export function registerMessages(editor: Editor): void {
  const i18n = editor.I18n;
  if (!i18n || typeof i18n.addMessages !== 'function') return;
  const messages: Record<string, Record<string, FormsLabels>> = {};
  SUPPORTED_LOCALES.forEach((lang) => {
    messages[lang] = { [I18N_NS]: { ...locales[lang] } };
  });
  i18n.addMessages(messages);
}

export type Translator = (key: keyof FormsLabels) => string;

/**
 * Label lookup order: explicit `labels` option (non-empty strings) →
 * `editor.I18n` (current locale, then its fallback) → built-in English.
 * Resolved on every call, so a locale switch applies on the next render.
 */
export function createTranslator(editor: Editor, overrides: Partial<FormsLabels> = {}): Translator {
  return (key) => {
    const own = overrides[key];
    if (typeof own === 'string' && own) return own;
    let msg: unknown;
    try {
      // GrapesJS fills {param} in messages: keep {{placeholders}} shown to the user as they are.
      msg = editor.I18n?.t(`${I18N_NS}.${key}`, { params: { form: '{form}', page: '{page}' } } as never);
    } catch {
      msg = undefined;
    }
    return typeof msg === 'string' && msg ? msg : en[key];
  };
}
