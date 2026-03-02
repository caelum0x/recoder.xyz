/**
 * Onboarding - Setup Profile
 * Second step: Collect user information
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/session-provider';
import { SiteHeader } from '@/components/SiteHeader';
import Link from 'next/link';
import { 
  Terminal,
  User,
  Briefcase,
  Code2,
  Sparkles,
  Zap,
  ArrowRight,
  ArrowLeft,
  Check
} from 'lucide-react';

export default function SetupProfilePage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    role: '',
    company: '',
    teamSize: '',
    useCase: '',
    experience: ''
  });

  useEffect(() => {
    if (!session && !isPending) {
      router.push('/auth/signin');
    } else if (session && !isPending) {
      setLoading(false);
    }
  }, [session, isPending, router]);

  const roles = [
    { id: 'developer', label: 'Developer', icon: Code2 },
    { id: 'designer', label: 'Designer', icon: Sparkles },
    { id: 'product', label: 'Product Manager', icon: Briefcase },
    { id: 'founder', label: 'Founder/CEO', icon: Zap },
    { id: 'student', label: 'Student', icon: User },
    { id: 'other', label: 'Other', icon: User }
  ];

  const teamSizes = [
    { id: '1', label: 'Just me' },
    { id: '2-10', label: '2-10 people' },
    { id: '11-50', label: '11-50 people' },
    { id: '51-200', label: '51-200 people' },
    { id: '200+', label: '200+ people' }
  ];

  const useCases = [
    { id: 'web', label: 'Web Development' },
    { id: 'mobile', label: 'Mobile Apps' },
    { id: 'api', label: 'API Development' },
    { id: 'automation', label: 'Automation' },
    { id: 'ai', label: 'AI/ML Projects' },
    { id: 'data', label: 'Data Science' },
    { id: 'blockchain', label: 'Blockchain/Web3' },
    { id: 'other', label: 'Other' }
  ];

  const experienceLevels = [
    { id: 'beginner', label: 'Beginner' },
    { id: 'intermediate', label: 'Intermediate' },
    { id: 'advanced', label: 'Advanced' },
    { id: 'expert', label: 'Expert' }
  ];

  const canProceed = () => {
    return formData.role && formData.teamSize && formData.useCase && formData.experience;
  };

  const handleContinue = async () => {
    if (!canProceed()) return;

    setSaving(true);
    try {
      // Save profile data to session/localStorage for now
      sessionStorage.setItem('onboarding_profile', JSON.stringify(formData));
      
      // Navigate to next step
      router.push('/onboarding/choose-plan');
    } catch (error) {
      console.error('Error saving profile:', error);
    } finally {
      setSaving(false);
    }
  };

  if (loading || isPending) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Progress Bar */}
      <div className="fixed top-0 w-full h-1 bg-white/10 z-50">
        <div
          className="h-full bg-gradient-to-r from-orange-500 to-purple-600 transition-all duration-500"
          style={{ width: '40%' }}
        />
      </div>

      <SiteHeader />

      <div className="container mx-auto px-6 py-24 mt-16">
        <div className="max-w-4xl mx-auto">
          {/* Title */}
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold mb-4">Tell us about yourself</h1>
            <p className="text-xl text-gray-400">This helps us personalize your experience</p>
          </div>

          {/* Form */}
          <div className="space-y-8">
            {/* Role Selection */}
            <div>
              <label className="block text-lg font-medium mb-4">
                What's your role? <span className="text-red-500">*</span>
              </label>
              <div className="grid md:grid-cols-3 gap-4">
                {roles.map((role) => {
                  const RoleIcon = role.icon;
                  const isSelected = formData.role === role.id;
                  return (
                    <button
                      key={role.id}
                      onClick={() => setFormData({ ...formData, role: role.id })}
                      className={`p-4 rounded-xl border backdrop-blur-xl text-left transition-all ${
                        isSelected
                          ? 'border-orange-500 bg-gradient-to-br from-orange-500/10 to-purple-600/10'
                          : 'border-white/10 bg-white/5 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          isSelected
                            ? 'bg-gradient-to-br from-orange-500 to-purple-600'
                            : 'bg-white/5'
                        }`}>
                          <RoleIcon className="w-5 h-5 text-white" />
                        </div>
                        <div className="flex-1">
                          <div className="font-medium">{role.label}</div>
                        </div>
                        {isSelected && <Check className="w-5 h-5 text-orange-500" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Company Name */}
            <div>
              <label className="block text-lg font-medium mb-4">
                Company Name (Optional)
              </label>
              <input
                type="text"
                value={formData.company}
                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                placeholder="Acme Inc."
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 text-white placeholder-gray-500"
              />
            </div>

            {/* Team Size */}
            <div>
              <label className="block text-lg font-medium mb-4">
                Team Size <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {teamSizes.map((size) => {
                  const isSelected = formData.teamSize === size.id;
                  return (
                    <button
                      key={size.id}
                      onClick={() => setFormData({ ...formData, teamSize: size.id })}
                      className={`p-4 rounded-xl border transition-all ${
                        isSelected
                          ? 'border-orange-500 bg-gradient-to-br from-orange-500/10 to-purple-600/10'
                          : 'border-white/10 bg-white/5 hover:border-white/20'
                      }`}
                    >
                      <div className="font-medium text-center">{size.label}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Primary Use Case */}
            <div>
              <label className="block text-lg font-medium mb-4">
                Primary Use Case <span className="text-red-500">*</span>
              </label>
              <div className="grid md:grid-cols-2 gap-3">
                {useCases.map((useCase) => {
                  const isSelected = formData.useCase === useCase.id;
                  return (
                    <button
                      key={useCase.id}
                      onClick={() => setFormData({ ...formData, useCase: useCase.id })}
                      className={`p-4 rounded-xl border transition-all ${
                        isSelected
                          ? 'border-orange-500 bg-gradient-to-br from-orange-500/10 to-purple-600/10'
                          : 'border-white/10 bg-white/5 hover:border-white/20'
                      }`}
                    >
                      <div className="font-medium text-center">{useCase.label}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Experience Level */}
            <div>
              <label className="block text-lg font-medium mb-4">
                Experience Level <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {experienceLevels.map((level) => {
                  const isSelected = formData.experience === level.id;
                  return (
                    <button
                      key={level.id}
                      onClick={() => setFormData({ ...formData, experience: level.id })}
                      className={`p-4 rounded-xl border transition-all ${
                        isSelected
                          ? 'border-orange-500 bg-gradient-to-br from-orange-500/10 to-purple-600/10'
                          : 'border-white/10 bg-white/5 hover:border-white/20'
                      }`}
                    >
                      <div className="font-medium text-center">{level.label}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Navigation */}
          <div className="flex justify-between items-center mt-12">
            <Link
              href="/onboarding/welcome"
              className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl font-medium transition-all flex items-center space-x-2"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </Link>

            <button
              onClick={handleContinue}
              disabled={!canProceed() || saving}
              className="px-8 py-3 bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-xl font-medium transition-all flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <span>Continue</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
