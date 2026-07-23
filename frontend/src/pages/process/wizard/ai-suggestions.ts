export type ISOStandard = 'iso9001' | 'iso14001' | 'iso45001';

const SUGGESTIONS: Record<ISOStandard, string[]> = {
  iso9001: [
    'Reducir no conformidades',
    'Mejorar satisfacción del cliente',
    'Optimizar procesos internos',
    'Estandarizar procedimientos',
    'Mejorar trazabilidad',
  ],
  iso14001: [
    'Reducir impacto ambiental',
    'Aumentar eficiencia energética',
    'Gestionar residuos',
    'Cumplir legislación ambiental',
    'Reducir huella de carbono',
  ],
  iso45001: [
    'Reducir riesgos operacionales',
    'Mejorar cultura de seguridad',
    'Reducir accidentes laborales',
    'Cumplir normativa SST',
    'Formar al personal en seguridad',
  ],
};

export function getSuggestedObjectives(isoStandard: ISOStandard): string[] {
  return SUGGESTIONS[isoStandard] || [];
}