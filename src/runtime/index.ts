import { formScript } from './script';

export { formScript };

/**
 * Turns on every form of the plugin in `root` (the site side, for HTML not
 * exported by GrapesJS — e.g. `formHtml()` rendered by a server). Forms
 * already on are skipped. Returns how many were turned on.
 */
export function enhanceForms(root: ParentNode = document): number {
  let n = 0;
  root.querySelectorAll<HTMLFormElement>('form[data-gjsf-form]').forEach((f) => {
    if ((f as HTMLFormElement & { __gjsf?: boolean }).__gjsf) return;
    formScript.call(f);
    n++;
  });
  return n;
}
