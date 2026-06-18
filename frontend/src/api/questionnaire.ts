import { apiRequest } from '../lib/api-client';

export type QuestionType = 'text' | 'textarea' | 'select';

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
  iso_standard: 'iso9001' | 'iso14001' | 'iso45001';
  title: string;
  description: string;
  groups: QuestionGroup[];
}

export interface ApiCallOptions {
  token: string | null;
  signal?: AbortSignal;
}

export async function getQuestionnaire(
  isoStandard: 'iso9001' | 'iso14001' | 'iso45001',
  { token, signal }: ApiCallOptions,
): Promise<Questionnaire> {
  return apiRequest<Questionnaire>(`/questionnaires/${isoStandard}`, { token, signal });
}
