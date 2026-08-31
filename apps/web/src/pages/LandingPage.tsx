import { Navbar } from '../sections/Navbar';
import { Hero } from '../sections/Hero';
import { TrustStrip } from '../sections/TrustStrip';
import { Advantages } from '../sections/Advantages';
import { DemoBuilder } from '../sections/DemoBuilder';
import { Support } from '../sections/Support';
import { Pricing } from '../sections/Pricing';
import { Faq } from '../sections/Faq';
import { FinalCta } from '../sections/FinalCta';
import { Footer } from '../sections/Footer';
import { WhatsAppFloat } from '../components/WhatsAppFloat';

/** Página comercial (/). O sistema em si vive fora dela, em /login, /register e /painel. */
export function LandingPage() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <TrustStrip />
        <Advantages />
        <DemoBuilder />
        <Support />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
      <WhatsAppFloat />
    </>
  );
}
