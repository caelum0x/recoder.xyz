'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [userType, setUserType] = useState('');
  const router = useRouter();

  const steps = [
    {
      title: 'Welcome to Recoder',
      content: (
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Choose your path</h2>
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => setUserType('developer')}
              className={`p-4 border rounded-lg ${userType === 'developer' ? 'border-orange-500 bg-orange-50' : 'border-gray-300'}`}
            >
              <div className="text-lg font-semibold">Developer</div>
              <div className="text-sm text-gray-600">Build apps with AI</div>
            </button>
            <button
              onClick={() => setUserType('enterprise')}
              className={`p-4 border rounded-lg ${userType === 'enterprise' ? 'border-orange-500 bg-orange-50' : 'border-gray-300'}`}
            >
              <div className="text-lg font-semibold">Enterprise</div>
              <div className="text-sm text-gray-600">Team collaboration</div>
            </button>
          </div>
        </div>
      )
    },
    {
      title: 'Setup CLI',
      content: (
        <div>
          <h2 className="text-2xl font-bold mb-4">Install Recoder CLI</h2>
          <div className="bg-black text-green-400 p-4 rounded-lg font-mono text-sm mb-4">
            npm install -g recoder-cli
          </div>
          <div className="bg-black text-green-400 p-4 rounded-lg font-mono text-sm">
            recoder auth login
          </div>
        </div>
      )
    },
    {
      title: 'First Project',
      content: (
        <div>
          <h2 className="text-2xl font-bold mb-4">Create your first project</h2>
          <div className="bg-black text-green-400 p-4 rounded-lg font-mono text-sm mb-4">
            recoder "build a todo app with React"
          </div>
          <p className="text-gray-600">Or use the web interface to get started</p>
        </div>
      )
    }
  ];

  const handleNext = () => {
    if (step < steps.length) {
      setStep(step + 1);
    } else {
      router.push('/dashboard');
    }
  };

  const handleSkip = () => {
    router.push('/dashboard');
  };

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">
      <div className="max-w-2xl w-full p-8">
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <div className="text-sm text-gray-400">Step {step} of {steps.length}</div>
            <button onClick={handleSkip} className="text-sm text-gray-400 hover:text-white">
              Skip
            </button>
          </div>
          <div className="w-full bg-gray-800 rounded-full h-2">
            <div 
              className="bg-orange-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${(step / steps.length) * 100}%` }}
            />
          </div>
        </div>

        <div className="mb-8">
          {steps[step - 1].content}
        </div>

        <div className="flex justify-between">
          <button
            onClick={() => setStep(Math.max(1, step - 1))}
            disabled={step === 1}
            className="px-6 py-2 border border-gray-600 rounded-lg disabled:opacity-50"
          >
            Back
          </button>
          <button
            onClick={handleNext}
            disabled={step === 1 && !userType}
            className="px-6 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50"
          >
            {step === steps.length ? 'Get Started' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
