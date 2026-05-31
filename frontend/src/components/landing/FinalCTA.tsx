interface FinalCTAProps {
  onOpenModal: () => void;
}

export function FinalCTA({ onOpenModal }: FinalCTAProps) {
  return (
    <section className="py-[100px] text-center">
      <div className="max-w-[1200px] mx-auto px-6">
        <h2 className="text-4xl md:text-[42px] font-bold text-primary tracking-tight mb-4">
          ¿Listo para certificar tu empresa?
        </h2>
        <p className="text-lg text-text-muted mb-8 max-w-[560px] mx-auto">
          Únete a decenas de organizaciones que ya automatizaron su Sistema Integrado de Gestión con SGI Pro.
        </p>
        <button
          onClick={onOpenModal}
          className="bg-accent text-white px-8 py-4 rounded-lg text-base font-semibold hover:bg-[#0052A3] hover:-translate-y-0.5 hover:shadow-md transition-all"
        >
          Registrate Gratis →
        </button>
      </div>
    </section>
  );
}