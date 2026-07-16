'use client';

import { Card } from '@/components/ui/card';
import { CheckCircle, Sparkles } from 'lucide-react';

interface PremiumFeaturesProps {
  features: string[];
  currentPlan: string;
}

export default function PremiumFeatures({ features, currentPlan }: PremiumFeaturesProps) {
  return (
    <Card className="p-6">
      <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
        <Sparkles className="w-5 h-5 text-purple-600" />
        Your Premium Features
      </h2>

      {features.length === 0 ? (
        <p className="text-gray-600">No premium features available on free plan.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {features.map((feature, index) => (
            <div
              key={index}
              className="flex items-start gap-3 p-4 bg-gradient-to-br from-blue-50 to-purple-50 rounded-lg"
            >
              <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
              <span className="text-sm font-medium text-gray-900">{feature}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
