'use client';

import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { getAllLanguages, getLanguageConfig } from '@/lib/code-generator/language-configs';
import { languages } from 'monaco-editor';

interface LanguageSelectorProps {
  selectedLanguage: string;
  onLanguageChange: (language: string) => void;
  className?: string;
}

export function LanguageSelector({
  selectedLanguage,
  onLanguageChange,
  className = ''
}: LanguageSelectorProps) {
  const languages = getAllLanguages();
  const selectedConfig = getLanguageConfig(selectedLanguage);

  return (
    <Select value={selectedLanguage} onValueChange={onLanguageChange}>
      <SelectTrigger className={`w-[200px] ${className}`}>
        <SelectValue>
          <div className="flex items-center gap-2">
            <span 
              className="w-3 h-3 rounded-full" 
              style={{ backgroundColor: selectedConfig?.color || '#666' }}
            />
            <span>{selectedConfig?.displayName || 'Select Language'}</span>
          </div>
        </SelectValue>
      </SelectTrigger>
      
      <SelectContent className="max-h-[300px]">
        {languages.map((language) => (
          <SelectItem key={language.id} value={language.id} className="cursor-pointer">
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-3">
                <span 
                  className="w-3 h-3 rounded-full" 
                  style={{ backgroundColor: language.color }}
                />
                <div className="flex flex-col">
                  <span className="font-medium">{language.displayName}</span>
                  <span className="text-xs text-muted-foreground">
                    {language.version}
                  </span>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                {language.features.some(f => f.name === 'compilation' && f.supported) && (
                  <Badge variant="outline" className="text-xs">
                    Compiled
                  </Badge>
                )}
                
                {language.packageManager && (
                  <Badge variant="outline" className="text-xs">
                    {language.packageManager.name}
                  </Badge>
                )}
              </div>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
