import type { ModuleKey } from '../../api/profiling';

/**
 * Mapping from the selector (base_08) labels to the module group id.
 * Post-rename: "Optimización de Procesos" replaces "Calidad y mejora continua".
 */
export const MODULE_BY_LABEL: Record<string, ModuleKey> = {
  'Optimización de Procesos': 'optimizacion',
  'Seguridad y salud en el trabajo': 'sst',
  'Normas técnicas sectoriales': 'nts',
  'Sostenibilidad y ambiental': 'sos',
  'Planificación estratégica': 'planificacion',
};

/** Group ids that are always visible (independent of the selector). */
export const ALWAYS_VISIBLE_GROUPS = ['perfil', 'contexto', 'selector'] as const;

/** All module group ids, in display order. */
export const MODULE_GROUP_IDS = ['optimizacion', 'sst', 'nts', 'sos', 'planificacion'] as const;

/** Resolve the selected module key from the selector label, or null when unset. */
export function moduleFromLabel(label: string): ModuleKey | null {
  return MODULE_BY_LABEL[label] ?? null;
}

/** Whether a group id is one of the always-visible (base) groups. */
export function isAlwaysVisibleGroup(groupId: string): boolean {
  return (ALWAYS_VISIBLE_GROUPS as readonly string[]).includes(groupId);
}
