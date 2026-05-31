export function Footer() {
  return (
    <footer className="bg-primary text-white py-10 text-center">
      <div className="max-w-[1200px] mx-auto px-6">
        <div className="flex items-center justify-center gap-2.5 mb-4">
          <div className="w-8 h-8 bg-white rounded-md flex items-center justify-center text-primary text-xs font-extrabold">
            SGI
          </div>
          <span className="font-bold text-xl tracking-tight">SGI Pro</span>
        </div>
        <p className="opacity-70 text-sm">
          © 2026 SGI Pro — Automatización de Sistemas Integrados de Gestión
        </p>
      </div>
    </footer>
  );
}