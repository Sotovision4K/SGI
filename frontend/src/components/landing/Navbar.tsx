import { useState } from 'react';
import { Menu, X } from 'lucide-react';

interface NavbarProps {
  onOpenModal: () => void;
}

export function Navbar({ onOpenModal }: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-border">
      <div className="max-w-[1200px] mx-auto px-6">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-primary rounded-md flex items-center justify-center text-white text-xs font-extrabold">
              SGI
            </div>
            <span className="font-bold text-xl text-primary tracking-tight">SGI Pro</span>
          </div>

          {/* Desktop Nav */}
          <ul className="hidden md:flex items-center gap-8">
            <li>
              <a href="#features" className="text-text-muted text-sm font-medium hover:text-accent transition-colors">
                Características
              </a>
            </li>
            <li>
              <a href="#consultant" className="text-text-muted text-sm font-medium hover:text-accent transition-colors">
                Consultor
              </a>
            </li>
            <li>
              <a href="#services" className="text-text-muted text-sm font-medium hover:text-accent transition-colors">
                Servicios
              </a>
            </li>
            <li>
              <button
                onClick={onOpenModal}
                className="bg-accent text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-[#0052A3] hover:-translate-y-0.5 hover:shadow-md transition-all"
              >
                Get Started
              </button>
            </li>
          </ul>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden text-text-muted"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-border">
            <ul className="space-y-4">
              <li>
                <a href="#features" className="block text-text-muted text-sm font-medium" onClick={() => setMobileMenuOpen(false)}>
                  Características
                </a>
              </li>
              <li>
                <a href="#consultant" className="block text-text-muted text-sm font-medium" onClick={() => setMobileMenuOpen(false)}>
                  Consultor
                </a>
              </li>
              <li>
                <a href="#services" className="block text-text-muted text-sm font-medium" onClick={() => setMobileMenuOpen(false)}>
                  Servicios
                </a>
              </li>
              <li>
                <button
                  onClick={() => { onOpenModal(); setMobileMenuOpen(false); }}
                  className="w-full bg-accent text-white px-6 py-2.5 rounded-lg text-sm font-semibold"
                >
                  Get Started
                </button>
              </li>
            </ul>
          </div>
        )}
      </div>
    </nav>
  );
}