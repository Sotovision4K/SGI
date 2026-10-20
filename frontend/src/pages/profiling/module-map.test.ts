/**
 * Test: module-map — selector label → module group id mapping
 *
 * Verifies:
 * - moduleFromLabel resolves "Optimización de Procesos" to 'optimizacion' (post-rename)
 * - MODULE_BY_LABEL holds the exact label → module id mapping
 * - moduleFromLabel returns null for unknown/empty labels
 * - isAlwaysVisibleGroup returns true only for the base group ids
 */
import { describe, it, expect } from 'vitest';
import { MODULE_LABELS } from '../../api/process';
import { MODULE_BY_LABEL, moduleFromLabel, isAlwaysVisibleGroup } from './module-map';

describe('moduleFromLabel', () => {
  it('resolves "Optimización de Procesos" to "optimizacion" (post-rename)', () => {
    expect(moduleFromLabel('Optimización de Procesos')).toBe('optimizacion');
  });

  it('returns null for an unknown label', () => {
    expect(moduleFromLabel('Desconocido')).toBeNull();
  });

  it('returns null for an empty label', () => {
    expect(moduleFromLabel('')).toBeNull();
  });
});

describe('MODULE_BY_LABEL', () => {
  it('maps every selector label to its module group id', () => {
    expect(MODULE_BY_LABEL).toEqual({
      'Optimización de Procesos': 'optimizacion',
      'Seguridad y salud en el trabajo': 'sst',
      'Normas técnicas sectoriales': 'nts',
      'Sostenibilidad y ambiental': 'sos',
      'Planificación estratégica': 'planificacion',
    });
  });

  it('is the exact inverse of the canonical MODULE_LABELS map', () => {
    expect(MODULE_BY_LABEL).toEqual(
      Object.fromEntries(
        (Object.entries(MODULE_LABELS) as [string, string][]).map(([key, label]) => [label, key]),
      ),
    );
  });
});

describe('isAlwaysVisibleGroup', () => {
  it('returns true for the base group ids', () => {
    expect(isAlwaysVisibleGroup('perfil')).toBe(true);
    expect(isAlwaysVisibleGroup('contexto')).toBe(true);
    expect(isAlwaysVisibleGroup('selector')).toBe(true);
  });

  it('returns false for a module group id', () => {
    expect(isAlwaysVisibleGroup('optimizacion')).toBe(false);
  });
});
