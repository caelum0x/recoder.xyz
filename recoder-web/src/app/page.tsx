export default function HomePage() {

  const features = [
    {
      title: "Multi-AI Intelligence",
      description: "Claude + Groq + Gemini + OpenAI + Ollama with smart routing",
      icon: "🧠"
    },
    {
      title: "Production-Ready Code", 
      description: "Real functionality first - every generated line works in production",
      icon: "⚡"
    },
    {
      title: "Enterprise Security",
      description: "Built-in security scanning, compliance checking, and vulnerability detection",
      icon: "🔒"
    },
    {
      title: "Developer Productivity",
      description: "10x speed without sacrificing quality or security",
      icon: "🚀"
    }
  ]


  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="flex-1 flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-blue-950 dark:to-indigo-950">
        <div className="container mx-auto px-4 py-20 text-center">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-5xl md:text-7xl font-bold text-gray-900 dark:text-white mb-6">
              AI-Powered
              <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                {" "}Development
              </span>
            </h1>
            <p className="text-xl md:text-2xl text-gray-600 dark:text-gray-300 mb-8 max-w-3xl mx-auto">
              Generate <strong>real, production-ready code</strong> with Claude, Groq, Gemini, and more. 
              No mock implementations. Built for developers who need code that actually works.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
              <a
                href="/collaborate"
                className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-lg text-lg font-semibold transition-all duration-200 transform hover:scale-105 shadow-lg inline-block text-center"
              >
                Get Started Free
              </a>
              <a 
                href="https://github.com/anthropics/recoder.xyz" 
                className="text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 px-8 py-4 text-lg font-medium transition-colors"
              >
                View on GitHub →
              </a>
            </div>

            <div className="text-sm text-gray-500 dark:text-gray-400">
              🎉 <strong>Production Engine</strong> deployed and ready • <strong>24 GitHub Actions issues</strong> resolved
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-white dark:bg-gray-900">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Why Choose Recoder.xyz?
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
              Unlike other AI coding tools, we focus on generating code that works in production, not just demos.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature, index) => (
              <div key={index} className="bg-gray-50 dark:bg-gray-800 p-6 rounded-lg hover:shadow-lg transition-shadow">
                <div className="text-3xl mb-4">{feature.icon}</div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                  {feature.title}
                </h3>
                <p className="text-gray-600 dark:text-gray-300">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-blue-600 dark:bg-blue-800">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Ready to 10x Your Development Speed?
          </h2>
          <p className="text-xl text-blue-100 mb-8 max-w-2xl mx-auto">
            Join developers who are shipping production code faster with AI assistance.
          </p>
          <a
            href="/collaborate"
            className="bg-white hover:bg-gray-100 text-blue-600 px-8 py-4 rounded-lg text-lg font-semibold transition-all duration-200 transform hover:scale-105 shadow-lg inline-block"
          >
            Start Building Now
          </a>
        </div>
      </section>
    </div>
  )
}