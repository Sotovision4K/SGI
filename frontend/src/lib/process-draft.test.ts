import { describe, it, expect, beforeEach } from 'vitest';
import { loadDraft, saveDraft, clearDraft, formatLastSaved } from './process-draft';

describe('process-draft', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('saves and loads a draft round-trip', () => {
    saveDraft('p-1', { step: 1, subStep: 2, preDiagnosis: { q1: 'Ana' } });
    const draft = loadDraft('p-1');
    expect(draft).not.toBeNull();
    expect(draft?.processId).toBe('p-1');
    expect(draft?.step).toBe(1);
    expect(draft?.subStep).toBe(2);
    expect(draft?.preDiagnosis).toEqual({ q1: 'Ana' });
    expect(draft?.updatedAt).toBeDefined();
  });

  it('drops blank/empty answers on save', () => {
    saveDraft('p-1', { step: 1, preDiagnosis: { q1: 'Ana', q2: '   ', q3: '' } });
    const draft = loadDraft('p-1');
    expect(draft?.preDiagnosis).toEqual({ q1: 'Ana' });
  });

  it('returns null when no non-blank answers exist', () => {
    saveDraft('p-1', { step: 1, preDiagnosis: { q1: '  ' } });
    expect(loadDraft('p-1')).toBeNull();
  });

  it('keeps the latest version only and invalidates wrong process id', () => {
    saveDraft('p-1', { step: 2, findings: { f1: 'x' } });
    expect(loadDraft('p-1')?.step).toBe(2);
    expect(loadDraft('p-2')).toBeNull();
  });

  it('sanitizes invalid keys and over-long values when reading', () => {
    // Write directly so we can inject a value that fails validation.
    window.sessionStorage.setItem(
      'sgipro:draft:p-1',
      JSON.stringify({
        version: 1,
        processId: 'p-1',
        step: 1,
        preDiagnosis: { 'bad key': 'no', 'key': 'x'.repeat(3000), ok: 'fine' },
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
    );
    const draft = loadDraft('p-1');
    expect(draft).not.toBeNull();
    expect(draft?.preDiagnosis).not.toHaveProperty('bad key');
    expect(draft?.preDiagnosis?.ok).toBe('fine');
    // Over-long value truncated to 2000 chars.
    expect(draft?.preDiagnosis?.key?.length).toBe(2000);
  });

  it('returns null for a malformed stored value', () => {
    window.sessionStorage.setItem('sgipro:draft:p-1', '{not-json');
    expect(loadDraft('p-1')).toBeNull();
  });

  it('clearDraft removes the entry', () => {
    saveDraft('p-1', { step: 1, preDiagnosis: { q1: 'Ana' } });
    clearDraft('p-1');
    expect(loadDraft('p-1')).toBeNull();
  });

  it('formats a valid ISO timestamp to local time', () => {
    expect(formatLastSaved('1970-01-01T00:00:00.000Z')).toBeDefined();
    expect(formatLastSaved('not-a-date')).toBe('');
  });
});