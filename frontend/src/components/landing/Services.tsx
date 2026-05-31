const services = [
  {
    badge: 'ISO 9001',
    title: 'Gestión de Calidad',
    description: 'Estandariza procesos, mejora la satisfacción del cliente y optimiza la eficiencia organizacional.',
    features: [
      'Mapeo de procesos',
      'Indicadores de calidad',
      'Control de no conformidades',
    ],
  },
  {
    badge: 'ISO 14001',
    title: 'Gestión Ambiental',
    description: 'Identifica, controla y reduce el impacto ambiental de tu organización cumpliendo la normativa vigente.',
    features: [
      'Matriz de aspectos e impactos',
      'Gestión de requisitos legales',
      'Programas ambientales',
    ],
  },
  {
    badge: 'ISO 45001',
    title: 'Seguridad y Salud en el Trabajo',
    description: 'Protege a tus colaboradores previniendo riesgos laborales y promoviendo entornos de trabajo seguros.',
    features: [
      'Matriz IPER',
      'Plan de emergencias',
      'Investigación de incidentes',
    ],
  },
];

export function Services() {
  return (
    <section id="services" className="py-20 bg-bg-soft">
      <div className="max-w-[1200px] mx-auto px-6">
        <div className="text-center max-w-[680px] mx-auto mb-14">
          <div className="text-accent text-xs font-bold uppercase tracking-[1.2px] mb-3">
            Servicios
          </div>
          <h2 className="text-4xl md:text-[38px] font-bold text-primary leading-tight tracking-tight mb-4">
            Soluciones diseñadas para cada etapa
          </h2>
          <p className="text-[17px] text-text-muted">
            Elige la norma que tu empresa necesita certificar. Cada servicio incluye implementación completa y mantenimiento.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {services.map((service) => (
            <ServiceCard key={service.badge} {...service} />
          ))}
        </div>
      </div>
    </section>
  );
}

interface ServiceCardProps {
  badge: string;
  title: string;
  description: string;
  features: string[];
}

function ServiceCard({ badge, title, description, features }: ServiceCardProps) {
  return (
    <div className="bg-white p-9 rounded-xl border border-border hover:border-accent hover:shadow-md transition-all relative">
      <div className="inline-block bg-accent-light text-accent px-2.5 py-1 rounded text-[11px] font-bold tracking-wide mb-3.5">
        {badge}
      </div>
      <h3 className="text-xl font-semibold text-primary mb-2.5">{title}</h3>
      <p className="text-sm text-text-muted mb-4">{description}</p>
      <ul className="space-y-1.5 pt-4 mt-4 border-t border-border">
        {features.map((feature) => (
          <li key={feature} className="text-[13px] text-text-muted flex items-center gap-2">
            <span className="text-accent font-bold">•</span>
            {feature}
          </li>
        ))}
      </ul>
    </div>
  );
}