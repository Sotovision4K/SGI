import { apiRequest } from '../lib/api-client';

export type QuestionnaireKey = 'iso9001' | 'iso14001' | 'iso45001' | 'pre_diagnosis';

export type QuestionType = 'text' | 'textarea' | 'select' | 'cards' | 'chips';

export interface Question {
  id: string;
  type: QuestionType;
  label: string;
  required: boolean;
  placeholder?: string;
  options?: string[];
}

export interface QuestionGroup {
  id: string;
  title: string;
  clauses: string[];
  questions: Question[];
}

export interface Questionnaire {
  iso_standard: QuestionnaireKey;
  title: string;
  description: string;
  groups: QuestionGroup[];
}

export interface ApiCallOptions {
  token: string | null;
  signal?: AbortSignal;
}

export async function getQuestionnaire(
  isoStandard: QuestionnaireKey,
  { token, signal }: ApiCallOptions,
): Promise<Questionnaire> {
  return apiRequest<Questionnaire>(`/questionnaires/${isoStandard}`, { token, signal });
}
