import { profilingQuestionnaire } from '../data/profiling';
import { apiRequest } from '../lib/api-client';
import type { ApiCallOptions, PerfilamientoModule } from './process';

export type ProfilingQuestionType = 'text' | 'textarea' | 'select' | 'cards' | 'chips';

export type Feed = 'perfil' | 'recomendacion' | 'cotizacion' | 'tiempo';

export interface ProfilingShowIf {
  pregunta: string;
  igual_a?: string;
  en?: string[];
}

export interface ProfilingQuestion {
  id: string;
  type: ProfilingQuestionType;
  label: string;
  required: boolean;
  placeholder?: string;
  options?: string[];
  default?: string;
  hint?: string;
  /** Indicates which engine output this answer feeds (perfil/recomendacion/cotizacion/tiempo). */
  alimenta?: Feed[];
  /** Adaptive display condition (referenced against the selector question). */
  mostrar_si?: ProfilingShowIf;
  redirigir_formulario?: Record<string, string>;
}

export interface ProfilingGroup {
  id: string;
  title: string;
  clauses: string[];
  description?: string;
  questions: ProfilingQuestion[];
}

export interface ProfilingQuestionnaire {
  iso_standard: 'profiling';
  title: string;
  description: string;
  _comment?: string;
  groups: ProfilingGroup[];
  reglas_motor_sst?: unknown;
}

export interface ProfilingSubmission {
  answers: Record<string, string>;
  /** Auditor's free-text pain points. */
  painPoints: string;
  module: PerfilamientoModule | null;
}

export interface CostEstimation {
  range_cop: string;
  breakdown: string[];
  confidence: 'low' | 'medium' | 'high';
}

export interface TimeEstimation {
  months: number;
  phases: string[];
  confidence: 'low' | 'medium' | 'high';
}

export interface ActionPlanPhase {
  name: string;
  duration_weeks: number;
  activities: string[];
}

export interface ActionPlan {
  phases: ActionPlanPhase[];
  milestones: string[];
}

export interface ProfilingResult {
  /** LLM-reasoned analysis of the most important pain points (markdown). */
  pain_points_analysis: string;
  cost_estimation: CostEstimation;
  time_estimation: TimeEstimation;
  action_plan: ActionPlan;
}

/** Load the profiling questionnaire (static local data). */
export function getProfilingQuestionnaire(): ProfilingQuestionnaire {
  return profilingQuestionnaire;
}

/**
 * Generate the profiling analysis for a persisted process.
 * POST /profiling/analyze returns the result (it does NOT persist; the
 * caller confirms via saveAnalysis).
 */
export async function analyzeProcessProfiling(
  processId: string,
  { token, signal }: ApiCallOptions,
): Promise<ProfilingResult> {
  return apiRequest<ProfilingResult>('/profiling/analyze', {
    method: 'POST',
    body: { process_id: processId },
    token,
    signal,
  });
}
