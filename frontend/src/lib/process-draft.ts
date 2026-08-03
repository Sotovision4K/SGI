const DRAFT_VERSION = 1;
const DRAFT_PREFIX = 'sgipro:draft:';
const KEY_REGEX = /^[a-z][a-z0-9_]{0,99}$/;
const MAX_VALUE_LENGTH = 2000;

export interface ProcessDraft {
  version: 1;
  processId: string;
  step: 1 | 2;
  subStep?: number;
  preDiagnosis?: Record<string, string>;
  findings?: Record<string, string>;
  updatedAt: string;
}

export type DraftStep = 1 | 2;

function draftKey(processId: string): string {
  return `${DRAFT_PREFIX}${processId}`;
}

/** Drop empty/blank values (mirrors backend routes.py:163-164). */
function sanitizeAnswers(answers: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!answers) return undefined;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(answers)) {
    if (!KEY_REGEX.test(key)) continue;
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    out[key] = trimmed.length > MAX_VALUE_LENGTH ? trimmed.slice(0, MAX_VALUE_LENGTH) : trimmed;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function isValidDraft(raw: unknown, processId: string): raw is ProcessDraft {
  if (typeof raw !== 'object' || raw === null) return false;
  const draft = raw as Record<string, unknown>;
  if (draft.version !== DRAFT_VERSION) return false;
  if (draft.processId !== processId) return false;
  if (draft.step !== 1 && draft.step !== 2) return false;
  if (draft.subStep !== undefined && (typeof draft.subStep !== 'number' || !Number.isInteger(draft.subStep) || draft.subStep < 0)) return false;
  if (draft.updatedAt !== undefined && typeof draft.updatedAt !== 'string') return false;
  return true;
}

export function loadDraft(processId: string): ProcessDraft | null {
  let raw: string | null;
  try {
    raw = window.sessionStorage.getItem(draftKey(processId));
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isValidDraft(parsed, processId)) return null;

  const preDiagnosis = sanitizeAnswers((parsed as ProcessDraft).preDiagnosis);
  const findings = sanitizeAnswers((parsed as ProcessDraft).findings);
  if (!preDiagnosis && !findings) return null;

  return {
    version: DRAFT_VERSION,
    processId,
    step: (parsed as ProcessDraft).step,
    subStep: (parsed as ProcessDraft).subStep,
    preDiagnosis,
    findings,
    updatedAt: (parsed as ProcessDraft).updatedAt ?? new Date().toISOString(),
  };
}

export function saveDraft(
  processId: string,
  patch: { step?: DraftStep; subStep?: number; preDiagnosis?: Record<string, string>; findings?: Record<string, string> },
): ProcessDraft | null {
  const existing = loadDraft(processId);
  const preDiagnosis = patch.preDiagnosis !== undefined ? sanitizeAnswers(patch.preDiagnosis) : existing?.preDiagnosis;
  const findings = patch.findings !== undefined ? sanitizeAnswers(patch.findings) : existing?.findings;

  if (!preDiagnosis && !findings) return null;

  const draft: ProcessDraft = {
    version: DRAFT_VERSION,
    processId,
    step: patch.step ?? existing?.step ?? 1,
    subStep: patch.subStep !== undefined ? patch.subStep : existing?.subStep,
    preDiagnosis,
    findings,
    updatedAt: new Date().toISOString(),
  };

  try {
    window.sessionStorage.setItem(draftKey(processId), JSON.stringify(draft));
  } catch {
    return null;
  }
  return draft;
}

export function clearDraft(processId: string): void {
  try {
    window.sessionStorage.removeItem(draftKey(processId));
  } catch {
    // ignore storage access errors
  }
}

export function formatLastSaved(updatedAt: string): string {
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
