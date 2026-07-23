/**
 * Test: ai-suggestions — static suggestion map per ISO standard
 *
 * Verifies:
 * - getSuggestedObjectives returns the correct list for each standard
 * - returns an empty array for an unknown standard (defensive default)
 */
import { describe, it, expect } from 'vitest';
import { getSuggestedObjectives, type ISOStandard } from './ai-suggestions';

describe('getSuggestedObjectives', () => {
  it('returns suggestions for iso9001', () => {
    const result = getSuggestedObjectives('iso9001');
    expect(result).toContain('Reducir no conformidades');
    expect(result).toContain('Mejorar satisfacción del cliente');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns suggestions for iso14001', () => {
    const result = getSuggestedObjectives('iso14001');
    expect(result).toContain('Reducir impacto ambiental');
    expect(result).toContain('Aumentar eficiencia energética');
  });

  it('returns suggestions for iso45001', () => {
    const result = getSuggestedObjectives('iso45001');
    expect(result).toContain('Reducir riesgos operacionales');
    expect(result).toContain('Mejorar cultura de seguridad');
  });

  it('returns an empty array for an unknown standard', () => {
    const result = getSuggestedObjectives('unknown' as ISOStandard);
    expect(result).toEqual([]);
  });
});