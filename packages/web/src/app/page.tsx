import { Hero } from '@/components/Hero'
import { Features } from '@/components/Features'
import { Installation } from '@/components/Installation'
import { AIModels } from '@/components/AIModels'
import { Examples } from '@/components/Examples'
import { Pricing } from '@/components/Pricing'
import { FAQ } from '@/components/FAQ'
import { Footer } from '@/components/Footer'
import { Navigation } from '@/components/Navigation'

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <Navigation />
      
      {/* Hero Section */}
      <section id="home" className="gradient-bg">
        <Hero />
      </section>

      {/* Features Section */}
      <section id="features" className="section-padding bg-white">
        <Features />
      </section>

      {/* Installation Section */}
      <section id="installation" className="section-padding gradient-bg">
        <Installation />
      </section>

      {/* AI Models Section */}
      <section id="ai-models" className="section-padding bg-white">
        <AIModels />
      </section>

      {/* Examples Section */}
      <section id="examples" className="section-padding gradient-bg">
        <Examples />
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="section-padding bg-white">
        <Pricing />
      </section>

      {/* FAQ Section */}
      <section id="faq" className="section-padding gradient-bg">
        <FAQ />
      </section>

      {/* Footer */}
      <Footer />
    </div>
  )
}