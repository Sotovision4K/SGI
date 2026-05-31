import { useState } from 'react';
import { Navbar } from './Navbar';
import { Hero } from './Hero';
import { Features } from './Features';
import { ConsultantSection } from './ConsultantSection';
import { Services } from './Services';
import { Stats } from './Stats';
import { FinalCTA } from './FinalCTA';
import { Footer } from './Footer';
import { RoleModal } from './RoleModal';

export function LandingPage() {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <Navbar onOpenModal={() => setModalOpen(true)} />
      <main>
        <Hero onOpenModal={() => setModalOpen(true)} />
        <Features />
        <ConsultantSection onOpenModal={() => setModalOpen(true)} />
        <Services />
        <Stats onOpenModal={() => setModalOpen(true)} />
        <FinalCTA onOpenModal={() => setModalOpen(true)} />
      </main>
      <Footer />
      <RoleModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}