'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

export function FAQ() {
  const [openFAQ, setOpenFAQ] = useState<number | null>(0)

  const faqs = [
    {
      question: "How is Recoder different from GitHub Copilot or other AI coding tools?",
      answer: "Recoder generates REAL, production-ready applications with working databases, payment processing, and deployments - not just code suggestions or mock implementations. While other tools give you snippets or examples, Recoder creates complete, revenue-generating applications that work immediately."
    },
    {
      question: "What AI models does Recoder use?",
      answer: "Recoder uses intelligent model routing across multiple providers: Claude (Anthropic) for complex reasoning and security, Groq for fast React/Next.js development, Gemini for large codebases, and local models via Ollama for privacy-sensitive projects. It automatically selects the best model for each specific task."
    },
    {
      question: "Can I use Recoder for sensitive or proprietary projects?",
      answer: "Yes! Recoder has a privacy-first architecture with local-only processing options. You can configure privacy levels (Public, Internal, Confidential, Restricted) and use local AI models via Ollama to ensure your sensitive code never leaves your machine."
    },
    {
      question: "How quickly can I generate a working application?",
      answer: "Most applications are generated in 3-5 minutes, including working integrations and deployment configurations. Complex applications like DeFi protocols or NFT marketplaces typically take 10-15 minutes to generate completely."
    },
    {
      question: "Does the generated code actually work in production?",
      answer: "Yes! That's our core promise. Every application we generate includes real functionality - actual database operations, working payment processing, functional APIs, and production deployment configurations. No mock implementations or placeholder code."
    },
    {
      question: "What programming languages and frameworks are supported?",
      answer: "Recoder supports all major languages and frameworks: React, Next.js, Vue, Svelte for web; React Native, Flutter for mobile; Node.js, Python, Rust for backend; Solana, Ethereum for blockchain; and many more. New frameworks are added regularly."
    },
    {
      question: "How do the specialized AI agents work?",
      answer: "Our AI agents are domain experts that collaborate on your project. For example, when building a social media app, the Web Agent creates the React frontend, Backend Agent builds the API, Security Agent implements authentication, and DevOps Agent configures deployment - all working together seamlessly."
    },
    {
      question: "Is there a learning curve to use Recoder?",
      answer: "No! Recoder uses natural language - just describe what you want to build. For example: 'build a Solana DEX with real token swapping' or 'create an AI writing assistant with billing'. It's as simple as talking to a developer."
    },
    {
      question: "What integrations are included with generated applications?",
      answer: "Recoder includes real integrations with 50+ services: Stripe/PayPal for payments, AWS/Vercel for hosting, PostgreSQL/MongoDB for databases, OpenAI for AI features, Solana/Ethereum for blockchain, and many more. All connections are working and production-ready."
    },
    {
      question: "Can I customize the generated code?",
      answer: "Absolutely! All generated code is standard, well-documented code that you can modify, extend, and customize however you need. You own the code completely - no vendor lock-in or proprietary dependencies."
    },
    {
      question: "How much does it cost compared to hiring developers?",
      answer: "Recoder can reduce development costs by 70-90%. A typical $100K development project can be generated for under $1K with Recoder, completed in days instead of months, with the same or better quality and real functionality."
    },
    {
      question: "What kind of support is available?",
      answer: "We offer multiple support channels: Community support via Discord and GitHub for Open Source users, priority email support for Pro users, and dedicated support with SLA for Enterprise customers. Our documentation is comprehensive with step-by-step guides."
    },
    {
      question: "Can teams collaborate on Recoder projects?",
      answer: "Yes! Pro and Enterprise plans include team collaboration features, shared project spaces, version control integration, and team-wide configuration management. Perfect for development teams and agencies."
    },
    {
      question: "How do you ensure code quality and security?",
      answer: "Every generated application includes comprehensive tests (90%+ coverage), security best practices, vulnerability scanning, and follows industry standards. Enterprise plans include additional security auditing and compliance certifications."
    },
    {
      question: "What happens if I need help with a generated application?",
      answer: "Our support team can help with any issues. Pro users get priority support, and Enterprise users get dedicated support with guaranteed response times. We also have an active community of developers sharing knowledge and solutions."
    }
  ]

  return (
    <div className="container-width">
      <div className="text-center mb-12">
        <h2 className="text-3xl lg:text-4xl font-bold mb-4">
          <span className="gradient-text">Frequently Asked Questions</span>
        </h2>
        <p className="text-xl text-gray-600 max-w-3xl mx-auto">
          Got questions about Recoder.xyz? We've got answers. Learn more about how our 
          AI-powered platform generates real, production-ready code.
        </p>
      </div>

      <div className="max-w-4xl mx-auto space-y-4">
        {faqs.map((faq, index) => (
          <div key={index} className="feature-card">
            <button
              onClick={() => setOpenFAQ(openFAQ === index ? null : index)}
              className="w-full text-left flex items-center justify-between group"
            >
              <h3 className="font-semibold text-lg pr-8 group-hover:text-blue-600 transition-colors">
                {faq.question}
              </h3>
              <div className="flex-shrink-0">
                {openFAQ === index ? (
                  <ChevronDown className="w-5 h-5 text-blue-600" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-blue-600" />
                )}
              </div>
            </button>
            
            {openFAQ === index && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-gray-600 leading-relaxed">{faq.answer}</p>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Still have questions CTA */}
      <div className="mt-16 text-center">
        <div className="feature-card bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 max-w-2xl mx-auto">
          <h3 className="text-xl font-bold mb-4">Still have questions?</h3>
          <p className="text-gray-600 mb-6">
            Our team is here to help. Join our Discord community or reach out directly 
            for personalized assistance.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a 
              href="https://discord.gg/recoder"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary"
            >
              Join Discord Community
            </a>
            <a 
              href="mailto:support@recoder.xyz"
              className="btn-secondary"
            >
              Contact Support
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}