'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { RecoderLoader } from '@/components/ui/recoder-loader';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { StepWrapper } from '../shared/step-wrapper';
import { userContext, updateUserContext } from '../shared/context';
import type { UserContext } from '../shared/types';
import { resolveBrowserBackendApiUrl } from '@/lib/runtime-urls';

export const SmartContextStep = () => {
  const [localContext, setLocalContext] = useState<UserContext>(userContext);
  const [isExtracting, setIsExtracting] = useState(false);

  const updateContext = (updates: Partial<UserContext>) => {
    const newContext = { ...localContext, ...updates };
    setLocalContext(newContext);
    updateUserContext(newContext);
  };

  // Extract website context using real backend API
  const extractWebsiteContext = async (input: string) => {
    if (!input || isExtracting) return;

    // Check if the input looks like a URL
    const trimmed = input.trim();
    const isUrl = /^(https?:\/\/)?[a-zA-Z0-9._\-]+\.[a-zA-Z]{2,}/.test(trimmed);
    if (!isUrl) return;

    setIsExtracting(true);

    try {
      const backendUrl = resolveBrowserBackendApiUrl();
      const response = await fetch(`${backendUrl}/website-analysis/extract-context`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ url: trimmed }),
      });

      if (!response.ok) {
        throw new Error(`Analysis failed: ${response.status}`);
      }

      const extracted = await response.json();

      updateContext({
        extractedContext: extracted,
        industry: extracted.businessType,
        companySize: extracted.size,
        primaryGoals: extracted.services,
      });
    } catch (err) {
      // Silently fail — the user can still proceed without extraction
      console.warn('Website analysis unavailable:', err instanceof Error ? err.message : err);
    } finally {
      setIsExtracting(false);
    }
  };

  // Auto-progress after context is filled
  useEffect(() => {
    const hasBasicInfo = localContext.websiteUrl && localContext.websiteUrl.trim().length > 10;

    if (hasBasicInfo) {
      // Auto-advance after a short delay
      const timer = setTimeout(() => {
        // This would trigger the next step in the parent component
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [localContext]);


  return (
    <StepWrapper>
      <div className="text-center space-y-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="text-4xl font-medium mb-4">
            {localContext.userType === 'company' ? 'Tell us about your company' : 'Tell us about yourself'}
          </h2>
          <p className="text-lg text-muted-foreground mb-8">
            {localContext.userType === 'company'
              ? 'Help us understand your business better'
              : 'Help us understand what you do'}
          </p>
        </motion.div>

        <div className="w-full max-w-2xl mx-auto space-y-6">
          {/* Main description textarea */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="space-y-3"
          >
            <Label htmlFor="description" className="text-base font-semibold text-center block">
              {localContext.userType === 'company' ? 'What does your company do?' : 'What do you do?'}
            </Label>
            <div className="relative">
              <Textarea
                id="description"
                placeholder={localContext.userType === 'company'
                  ? "Share your company website or describe what you do...\n\nExamples:\n• https://yourcompany.com\n• We help B2B SaaS companies scale their growth\n• Digital marketing agency for startups"
                  : "Share your website or describe what you do...\n\nExamples:\n• https://myportfolio.com\n• Freelance graphic designer specializing in branding\n• Help small businesses with digital marketing"
                }
                value={localContext.websiteUrl || ''}
                onChange={(e) => updateContext({ websiteUrl: e.target.value })}
                onBlur={(e) => extractWebsiteContext(e.target.value)}
                className="min-h-[120px] text-base leading-relaxed border-2 focus:border-primary transition-colors resize-none"
                rows={5}
              />
              {isExtracting && (
                <div className="absolute top-3 right-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground bg-background/80 backdrop-blur-sm px-2 py-1 rounded-md">
                    <RecoderLoader size="small" />
                    Analyzing...
                  </div>
                </div>
              )}
            </div>

            {localContext.extractedContext && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
                className="mt-4 p-4 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 rounded-xl border border-green-200 dark:border-green-800"
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
                  <p className="text-sm font-semibold text-green-800 dark:text-green-300">
                    Great! Here's what we learned:
                  </p>
                </div>
                <div className="grid gap-2 text-sm">
                  <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                    <span className="font-medium">Focus:</span>
                    <span>{localContext.extractedContext.businessType}</span>
                  </div>
                  <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                    <span className="font-medium">Scale:</span>
                    <span>{localContext.extractedContext.size}</span>
                  </div>
                  <div className="flex items-start gap-2 text-green-700 dark:text-green-400">
                    <span className="font-medium">Areas:</span>
                    <span>{localContext.extractedContext.services?.join(', ')}</span>
                  </div>
                </div>
              </motion.div>
            )}
          </motion.div>

          {/* Progress indicator */}
          {localContext.websiteUrl && localContext.websiteUrl.trim().length > 10 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="text-center mt-6"
            >
              <div className="inline-flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-primary/10 to-primary/5 rounded-full border border-primary/20">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                </div>
                <span className="text-sm font-medium text-primary">
                  Perfect! Ready to find your AI assistants
                </span>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </StepWrapper>
  );
};

