import { MODULE_LABELS, type PerfilamientoModule } from '../../api/process';

/**
 * Mapping from the selector (base_08) labels to the module group id.
 * Post-rename: "Optimización de Procesos" replaces "Calidad y mejora continua".
 * Derived from the canonical `MODULE_LABELS` (key → label) so the two maps
 * cannot drift.
 */
export const MODULE_BY_LABEL: Record<string, PerfilamientoModule> = Object.fromEntries(
  (Object.entries(MODULE_LABELS) as [PerfilamientoModule, string][]).map(([key, label]) => [label, key]),
);

/** Group ids that are always visible (independent of the selector). */
export const ALWAYS_VISIBLE_GROUPS = ['perfil', 'contexto', 'selector'] as const;

/** All module group ids, in display order. */
export const MODULE_GROUP_IDS = ['optimizacion', 'sst', 'nts', 'sos', 'planificacion'] as const;

/** Resolve the selected module key from the selector label, or null when unset. */
export function moduleFromLabel(label: string): PerfilamientoModule | null {
  return MODULE_BY_LABEL[label] ?? null;
}

/** Whether a group id is one of the always-visible (base) groups. */
export function isAlwaysVisibleGroup(groupId: string): boolean {
  return (ALWAYS_VISIBLE_GROUPS as readonly string[]).includes(groupId);
}
