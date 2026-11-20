import { describe, expect, it } from 'vitest';
import { fromSurveyJs, toSurveyJs } from '../src/surveyjs';

const survey = {
  title: 'Feedback',
  description: 'Tell us',
  completeText: 'Send it',
  completedHtml: '<h3>Thanks!</h3>',
  pages: [
    {
      elements: [
        { type: 'text', name: 'name', title: 'Name', isRequired: true, placeholder: 'Ann' },
        { type: 'text', name: 'email', inputType: 'email', title: { default: 'E-mail', ru: 'Почта' } },
        { type: 'panel', title: 'More', elements: [{ type: 'comment', name: 'msg', rows: 4 }] },
        { type: 'dropdown', name: 'plan', choices: ['a', { value: 'b', text: 'Bee' }] },
        { type: 'tagbox', name: 'tags', choices: ['x'] },
        { type: 'radiogroup', name: 'r', choices: ['1', '2'] },
        { type: 'checkbox', name: 'c', choices: ['1'] },
        { type: 'boolean', name: 'agree', title: 'Agree?' },
        { type: 'rating', name: 'score', rateMax: 3 },
        { type: 'file', name: 'cv', allowMultiple: true, acceptedTypes: '.pdf' },
        { type: 'text', name: 'src', visible: false, defaultValue: 'ads' },
        { type: 'matrix', name: 'm' },
        { type: 'expression', name: 'sum' },
      ],
    },
  ],
};

describe('SurveyJS', () => {
  it('imports the plain-form parts, lists the rest', () => {
    const { form, skipped } = fromSurveyJs(survey, 'id1');
    expect(form).toMatchObject({ id: 'id1', name: 'Feedback', settings: { submitLabel: 'Send it', successMessage: 'Thanks!' } });
    expect(form.fields.map((f) => `${f.type}:${f.name}`)).toEqual([
      'paragraph:',
      'text:name',
      'email:email',
      'heading:',
      'textarea:msg',
      'select:plan',
      'select:tags',
      'radio:r',
      'checkboxes:c',
      'checkbox:agree',
      'radio:score',
      'file:cv',
      'hidden:src',
    ]);
    expect(form.fields[1]).toMatchObject({ label: 'Name', required: true, placeholder: 'Ann' });
    expect(form.fields[2].label).toBe('E-mail');
    expect(form.fields[5].options).toEqual([
      { label: 'a', value: 'a' },
      { label: 'Bee', value: 'b' },
    ]);
    expect(form.fields[6].multiple).toBe(true);
    expect(form.fields[10].options!.map((o) => o.value)).toEqual(['1', '2', '3']);
    expect(form.fields[11]).toMatchObject({ multiple: true, accept: '.pdf' });
    expect(form.fields[12]).toMatchObject({ value: 'ads' });
    expect(skipped).toEqual(['m (matrix)', 'sum (expression)']);
  });

  it('exports and imports back the same fields', () => {
    const { form } = fromSurveyJs(survey, 'id1');
    const back = fromSurveyJs(toSurveyJs(form), 'id1').form;
    const shape = (f: any) => ({ type: f.type, name: f.name, label: f.label, required: f.required, options: f.options, text: f.text });
    expect(back.fields.map(shape)).toEqual(form.fields.map(shape));
    expect(back.settings).toMatchObject({ submitLabel: 'Send it', successMessage: 'Thanks!' });
  });
});
