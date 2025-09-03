'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { 
  Smartphone, QrCode, Play, Code, FileText, 
  CheckCircle, AlertCircle, Loader2, Eye, Copy,
  Zap, Phone, Tablet, Monitor
} from 'lucide-react';

// 📱 MOBILE APP BUILDER COMPONENT - EXPO QR CODE INTEGRATION
// Complete mobile app generation with instant device testing

interface MobileApp {
  success: boolean;
  appId: string;
  platform: string;
  files: Array<{
    path: string;
    content: string;
    type: 'main' | 'component' | 'config' | 'style';
  }>;
  buildInstructions: string[];
  expoQR?: {
    qrCodeUrl: string;
    appUrl: string;
    instructions: string[];
  };
  deploymentInfo: {
    buildTime: number;
    fileCount: number;
    totalSize: string;
    testable: boolean;
  };
}

interface MobileAppBuilderProps {
  className?: string;
}

export default function MobileAppBuilder({ className }: MobileAppBuilderProps = {}) {
  // Form state
  const [appName, setAppName] = useState('');
  const [description, setDescription] = useState('');
  const [platform, setPlatform] = useState('expo');
  const [features, setFeatures] = useState<string[]>(['navigation', 'state-management']);
  const [design, setDesign] = useState('modern');
  const [generateQR, setGenerateQR] = useState(true);

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [generatedApp, setGeneratedApp] = useState<MobileApp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeFileIndex, setActiveFileIndex] = useState(0);

  // 🚀 GENERATE MOBILE APP
  const generateApp = async () => {
    if (!appName.trim() || !description.trim()) {
      setError('Please provide app name and description');
      return;
    }

    setGenerating(true);
    setError(null);
    setGeneratedApp(null);

    try {
      console.log('🚀 Generating mobile app...');
      
      const response = await fetch('/api/mobile-app-builder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate-app',
          appName,
          description,
          platform,
          features,
          design,
          generateQR: generateQR && platform === 'expo'
        })
      });

      if (!response.ok) {
        throw new Error(`Generation failed: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to generate mobile app');
      }

      console.log('✅ Mobile app generated:', data);
      setGeneratedApp(data);

    } catch (error) {
      console.error('❌ Mobile app generation failed:', error);
      setError(error instanceof Error ? error.message : 'Unknown error occurred');
    } finally {
      setGenerating(false);
    }
  };

  // 📋 COPY CODE TO CLIPBOARD
  const copyCodeToClipboard = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      // Could add toast notification here
    } catch (error) {
      console.error('Failed to copy code:', error);
    }
  };

  // Helper functions
  const formatFileType = (type: string) => {
    switch (type) {
      case 'main': return 'Main';
      case 'component': return 'Component';
      case 'config': return 'Config';
      case 'style': return 'Style';
      default: return 'File';
    }
  };

  const getFileIcon = (path: string) => {
    if (path.endsWith('.tsx') || path.endsWith('.js')) return <Code className="w-4 h-4" />;
    if (path.endsWith('.json')) return <FileText className="w-4 h-4" />;
    return <FileText className="w-4 h-4" />;
  };

  return (
    <div className={`p-6 max-w-7xl mx-auto space-y-6 ${className || ''}`}>
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-bold flex items-center justify-center gap-2">
          <Smartphone className="w-10 h-10 text-blue-500" />
          📱 Mobile App Builder
        </h1>
        <p className="text-xl text-gray-600">
          Generate ACTUAL React Native/Flutter apps with Expo QR code testing
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Configuration Panel */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5" />
              App Configuration
            </CardTitle>
            <CardDescription>
              Configure your mobile app and generate real code
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* App Name */}
            <div className="space-y-2">
              <Label htmlFor="appName">App Name *</Label>
              <Input
                id="appName"
                placeholder="My Awesome App"
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
                disabled={generating}
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">App Description *</Label>
              <Textarea
                id="description"
                placeholder="A beautiful mobile app that helps users..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={generating}
                rows={3}
              />
            </div>

            {/* Platform Selection */}
            <div className="space-y-2">
              <Label htmlFor="platform">Platform</Label>
              <select 
                value={platform} 
                onChange={(e) => setPlatform(e.target.value)}
                disabled={generating}
                className="w-full p-2 border border-gray-300 rounded-md"
              >
                <option value="expo">Expo (React Native) - QR Testing</option>
                <option value="flutter">Flutter - Native Performance</option>
                <option value="react-native">React Native - Pure</option>
              </select>
            </div>

            {/* Design Style */}
            <div className="space-y-2">
              <Label htmlFor="design">Design Style</Label>
              <select 
                value={design} 
                onChange={(e) => setDesign(e.target.value)}
                disabled={generating}
                className="w-full p-2 border border-gray-300 rounded-md"
              >
                <option value="minimal">Minimal</option>
                <option value="modern">Modern</option>
                <option value="material">Material Design</option>
                <option value="cupertino">iOS Cupertino</option>
              </select>
            </div>

            {/* Features */}
            <div className="space-y-2">
              <Label>Features to Include</Label>
              <div className="grid grid-cols-2 gap-2">
                {['navigation', 'state-management', 'forms', 'animations', 'storage', 'camera'].map((feature) => (
                  <div key={feature} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id={feature}
                      checked={features.includes(feature)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setFeatures([...features, feature]);
                        } else {
                          setFeatures(features.filter(f => f !== feature));
                        }
                      }}
                      disabled={generating}
                      className="rounded"
                    />
                    <Label htmlFor={feature} className="text-sm capitalize">
                      {feature.replace('-', ' ')}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            {/* Expo QR Generation */}
            {platform === 'expo' && (
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="generateQR"
                    checked={generateQR}
                    onChange={(e) => setGenerateQR(e.target.checked)}
                    disabled={generating}
                    className="rounded"
                  />
                  <Label htmlFor="generateQR" className="text-sm">
                    Generate QR code for Expo Go testing
                  </Label>
                </div>
                <p className="text-xs text-gray-500">
                  Test your app instantly on your phone by scanning the QR code
                </p>
              </div>
            )}

            {/* Generate Button */}
            <Button 
              onClick={generateApp} 
              disabled={generating || !appName.trim() || !description.trim()}
              className="w-full"
              size="lg"
            >
              {generating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  Generating App...
                </>
              ) : (
                <>
                  <Play className="w-5 h-5 mr-2" />
                  Generate Mobile App
                </>
              )}
            </Button>

            {/* Error Display */}
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-500" />
                <span className="text-red-700">{error}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Results Panel */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5" />
              Generated App
            </CardTitle>
            <CardDescription>
              {generatedApp ? 
                `${generatedApp.platform} app ready for testing` : 
                'Your generated app will appear here'
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!generatedApp && !generating && (
              <div className="text-center py-12 space-y-4">
                <Smartphone className="w-16 h-16 mx-auto text-gray-300" />
                <p className="text-gray-500">Configure your app and click "Generate" to start</p>
              </div>
            )}

            {generating && (
              <div className="text-center py-12 space-y-4">
                <Loader2 className="w-16 h-16 mx-auto animate-spin text-blue-500" />
                <p className="text-blue-600">Generating your mobile app...</p>
                <p className="text-sm text-gray-500">This may take 30-60 seconds</p>
              </div>
            )}

            {generatedApp && (
              <div className="space-y-6">
                {/* App Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Platform</p>
                    <Badge variant="secondary">{generatedApp.platform}</Badge>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Build Time</p>
                    <p className="text-sm text-gray-600">{(generatedApp.deploymentInfo.buildTime / 1000).toFixed(1)}s</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Files Created</p>
                    <p className="text-sm text-gray-600">{generatedApp.deploymentInfo.fileCount}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Total Size</p>
                    <p className="text-sm text-gray-600">{generatedApp.deploymentInfo.totalSize}</p>
                  </div>
                </div>

                {/* Expo QR Code */}
                {generatedApp.expoQR && (
                  <Card className="bg-gradient-to-br from-blue-50 to-purple-50">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <QrCode className="w-5 h-5" />
                        📱 Test on Your Device
                      </CardTitle>
                      <CardDescription>
                        Scan this QR code with Expo Go to test your app instantly
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* QR Code Image */}
                      <div className="text-center">
                        <div className="inline-block p-4 bg-white rounded-lg shadow-sm">
                          <img 
                            src={generatedApp.expoQR.qrCodeUrl} 
                            alt="Expo QR Code"
                            className="w-48 h-48 mx-auto"
                          />
                        </div>
                        <p className="mt-2 text-sm text-gray-600">
                          App URL: <code className="text-xs bg-gray-100 px-1 rounded">{generatedApp.expoQR.appUrl}</code>
                        </p>
                      </div>

                      {/* Instructions */}
                      <div className="space-y-2">
                        <p className="font-medium text-sm">How to test:</p>
                        <ol className="text-sm text-gray-600 space-y-1">
                          {generatedApp.expoQR.instructions.map((instruction, idx) => (
                            <li key={idx} className="flex items-start gap-2">
                              <span className="bg-blue-100 text-blue-800 text-xs rounded-full w-4 h-4 flex items-center justify-center flex-shrink-0 mt-0.5">
                                {idx + 1}
                              </span>
                              {instruction}
                            </li>
                          ))}
                        </ol>
                      </div>

                      {/* Device Compatibility */}
                      <div className="flex justify-center gap-4 pt-2">
                        <div className="flex items-center gap-1 text-green-600">
                          <Phone className="w-4 h-4" />
                          <span className="text-xs">iOS</span>
                        </div>
                        <div className="flex items-center gap-1 text-green-600">
                          <Tablet className="w-4 h-4" />
                          <span className="text-xs">Android</span>
                        </div>
                        <div className="flex items-center gap-1 text-green-600">
                          <Monitor className="w-4 h-4" />
                          <span className="text-xs">Web</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Build Instructions */}
                <div className="space-y-2">
                  <p className="font-medium">Build Instructions:</p>
                  <div className="bg-gray-900 text-green-400 p-3 rounded-lg text-sm font-mono space-y-1">
                    {generatedApp.buildInstructions.map((instruction, idx) => (
                      <div key={idx}>$ {instruction}</div>
                    ))}
                  </div>
                </div>

                {/* Generated Files */}
                <div className="space-y-4">
                  <div className="flex border-b">
                    <button className="px-4 py-2 border-b-2 border-blue-500">Generated Files</button>
                    <button className="px-4 py-2 text-gray-600">Code Preview</button>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="space-y-1">
                      {generatedApp.files.map((file, idx) => (
                        <div 
                          key={idx}
                          className={`flex items-center justify-between p-2 rounded cursor-pointer transition-colors ${
                            activeFileIndex === idx ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'
                          }`}
                          onClick={() => setActiveFileIndex(idx)}
                        >
                          <div className="flex items-center gap-2">
                            {getFileIcon(file.path)}
                            <span className="text-sm font-mono">{file.path}</span>
                            <Badge variant="outline" className="text-xs">
                              {formatFileType(file.type)}
                            </Badge>
                          </div>
                          <Button 
                            size="sm" 
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              copyCodeToClipboard(file.content);
                            }}
                          >
                            <Copy className="w-3 h-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {generatedApp.files[activeFileIndex] && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="font-mono text-sm">{generatedApp.files[activeFileIndex].path}</h4>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => copyCodeToClipboard(generatedApp.files[activeFileIndex].content)}
                        >
                          <Copy className="w-3 h-3 mr-1" />
                          Copy
                        </Button>
                      </div>
                      <div className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-auto max-h-96">
                        <pre className="text-xs">
                          <code>{generatedApp.files[activeFileIndex].content}</code>
                        </pre>
                      </div>
                    </div>
                  )}
                </div>

                {/* Success Status */}
                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  <span className="text-green-700">
                    Mobile app generated successfully! Ready for testing and deployment.
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}