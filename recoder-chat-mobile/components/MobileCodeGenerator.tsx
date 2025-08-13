/**
 * Mobile Code Generator Component
 * Provides AI-powered code generation with offline capabilities
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import mobileAI, { GenerationRequest, GenerationResponse, AIProvider } from '../services/MobileAIService';
import notificationService from '../services/NotificationService';

interface MobileCodeGeneratorProps {
  onCodeGenerated?: (code: string) => void;
  initialPrompt?: string;
  language?: string;
  theme?: 'light' | 'dark';
}

const MobileCodeGenerator: React.FC<MobileCodeGeneratorProps> = ({
  onCodeGenerated,
  initialPrompt = '',
  language = 'typescript',
  theme = 'dark'
}) => {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [generatedCode, setGeneratedCode] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>('auto');
  const [selectedModel, setSelectedModel] = useState<string>('auto');
  const [isOffline, setIsOffline] = useState(false);
  const [history, setHistory] = useState<GenerationResponse[]>([]);
  const scrollViewRef = useRef<ScrollView>(null);

  const { width } = Dimensions.get('window');
  const isTablet = width > 768;

  useEffect(() => {
    initializeComponent();
  }, []);

  const initializeComponent = async () => {
    try {
      const availableProviders = await mobileAI.getAvailableProviders();
      setProviders(availableProviders);
      
      const offlineMode = await mobileAI.isOfflineModeEnabled();
      setIsOffline(offlineMode);
      
      // Set default provider
      const localProvider = availableProviders.find(p => p.type === 'local' && p.available);
      if (localProvider) {
        setSelectedProvider(localProvider.id);
        setSelectedModel(localProvider.models[0] || 'auto');
      }
    } catch (error) {
      console.error('Failed to initialize code generator:', error);
    }
  };

  const generateCode = async () => {
    if (!prompt.trim()) {
      Alert.alert('Error', 'Please enter a code generation prompt');
      return;
    }

    setIsGenerating(true);
    const startTime = Date.now();

    try {
      const request: GenerationRequest = {
        prompt: `Generate ${language} code for the following request: ${prompt}`,
        provider: selectedProvider === 'auto' ? undefined : selectedProvider,
        model: selectedModel === 'auto' ? undefined : selectedModel,
        options: {
          temperature: 0.7,
          maxTokens: 2048
        }
      };

      const response = await mobileAI.generateCode(request);
      const duration = Date.now() - startTime;
      
      setGeneratedCode(response.content);
      setHistory(prev => [response, ...prev.slice(0, 9)]); // Keep last 10
      
      // Notify completion
      await notificationService.notifyCodeGenerationComplete(
        'Mobile App',
        'Code Generation',
        true,
        duration
      );

      if (onCodeGenerated) {
        onCodeGenerated(response.content);
      }

      // Scroll to generated code
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({ y: 300, animated: true });
      }, 100);

    } catch (error) {
      console.error('Code generation failed:', error);
      
      Alert.alert(
        'Generation Failed',
        error instanceof Error ? error.message : 'Unknown error occurred',
        [
          { text: 'Retry', onPress: generateCode },
          { text: 'Cancel', style: 'cancel' }
        ]
      );

      await notificationService.notifyCodeGenerationComplete(
        'Mobile App',
        'Code Generation',
        false
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const useTemplate = async (templateKey: string) => {
    const templates = mobileAI.getCodeTemplates();
    const template = templates[templateKey as keyof typeof templates];
    
    if (template) {
      // Show template variable input dialog
      Alert.prompt(
        'Template Variables',
        'Enter component name:',
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Generate', 
            onPress: async (componentName) => {
              if (componentName) {
                const code = await mobileAI.generateCodeFromTemplate(template, {
                  componentName,
                  props: 'children: React.ReactNode;',
                  propsDestructured: '{ children }',
                  className: componentName.toLowerCase(),
                  children: '{children}'
                });
                setGeneratedCode(code);
                if (onCodeGenerated) {
                  onCodeGenerated(code);
                }
              }
            }
          }
        ],
        'plain-text',
        '',
        'default'
      );
    }
  };

  const clearHistory = async () => {
    Alert.alert(
      'Clear History',
      'Are you sure you want to clear generation history and cache?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            setHistory([]);
            await mobileAI.clearCache();
          }
        }
      ]
    );
  };

  const toggleOfflineMode = async () => {
    const newOfflineMode = !isOffline;
    setIsOffline(newOfflineMode);
    
    if (newOfflineMode) {
      await mobileAI.enableOfflineMode();
    } else {
      await mobileAI.disableOfflineMode();
    }
  };

  const styles = getStyles(theme, isTablet);

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView 
        ref={scrollViewRef}
        style={styles.scrollView} 
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>AI Code Generator</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={[styles.modeButton, isOffline && styles.offlineButton]}
              onPress={toggleOfflineMode}
            >
              <Ionicons 
                name={isOffline ? "wifi-outline" : "cloud-outline"} 
                size={20} 
                color={isOffline ? "#ff6b6b" : "#4ECDC4"} 
              />
            </TouchableOpacity>
            <TouchableOpacity style={styles.settingsButton} onPress={clearHistory}>
              <Ionicons name="settings-outline" size={20} color="#666" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Provider Selection */}
        <View style={styles.providerSection}>
          <Text style={styles.sectionTitle}>AI Provider</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.providerList}>
              {providers.map(provider => (
                <TouchableOpacity
                  key={provider.id}
                  style={[
                    styles.providerCard,
                    selectedProvider === provider.id && styles.selectedProvider,
                    !provider.available && styles.unavailableProvider
                  ]}
                  onPress={() => {
                    if (provider.available) {
                      setSelectedProvider(provider.id);
                      setSelectedModel(provider.models[0] || 'auto');
                    }
                  }}
                >
                  <Text style={styles.providerName}>{provider.name}</Text>
                  <Text style={styles.providerType}>{provider.type}</Text>
                  {!provider.available && (
                    <Text style={styles.unavailableText}>Offline</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* Quick Templates */}
        <View style={styles.templatesSection}>
          <Text style={styles.sectionTitle}>Quick Templates</Text>
          <View style={styles.templateGrid}>
            <TouchableOpacity 
              style={styles.templateCard}
              onPress={() => useTemplate('react-component')}
            >
              <Ionicons name="logo-react" size={24} color="#61DAFB" />
              <Text style={styles.templateText}>React Component</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.templateCard}
              onPress={() => useTemplate('express-route')}
            >
              <Ionicons name="server-outline" size={24} color="#68CC8A" />
              <Text style={styles.templateText}>Express Route</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.templateCard}
              onPress={() => useTemplate('python-function')}
            >
              <Ionicons name="logo-python" size={24} color="#3776AB" />
              <Text style={styles.templateText}>Python Function</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Prompt Input */}
        <View style={styles.inputSection}>
          <Text style={styles.sectionTitle}>Describe what you want to build</Text>
          <TextInput
            style={styles.promptInput}
            placeholder="e.g., A React component that displays user profile information with edit functionality"
            placeholderTextColor="#666"
            value={prompt}
            onChangeText={setPrompt}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
          
          <TouchableOpacity
            style={[styles.generateButton, isGenerating && styles.generatingButton]}
            onPress={generateCode}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <ActivityIndicator color="white" />
            ) : (
              <Ionicons name="code-outline" size={20} color="white" />
            )}
            <Text style={styles.generateButtonText}>
              {isGenerating ? 'Generating...' : 'Generate Code'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Generated Code */}
        {generatedCode && (
          <View style={styles.codeSection}>
            <View style={styles.codeHeader}>
              <Text style={styles.sectionTitle}>Generated Code</Text>
              <TouchableOpacity
                style={styles.copyButton}
                onPress={() => {
                  // Copy to clipboard functionality would go here
                  Alert.alert('Copied', 'Code copied to clipboard');
                }}
              >
                <Ionicons name="copy-outline" size={16} color="#4ECDC4" />
                <Text style={styles.copyButtonText}>Copy</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.codeContainer}>
                <Text style={styles.codeText}>{generatedCode}</Text>
              </View>
            </ScrollView>
          </View>
        )}

        {/* History */}
        {history.length > 0 && (
          <View style={styles.historySection}>
            <Text style={styles.sectionTitle}>Recent Generations</Text>
            {history.slice(0, 3).map((item, index) => (
              <TouchableOpacity
                key={index}
                style={styles.historyItem}
                onPress={() => {
                  setGeneratedCode(item.content);
                  if (onCodeGenerated) {
                    onCodeGenerated(item.content);
                  }
                }}
              >
                <View style={styles.historyHeader}>
                  <Text style={styles.historyProvider}>
                    {item.provider} • {item.model}
                  </Text>
                  <Text style={styles.historyTime}>
                    {new Date(item.timestamp).toLocaleTimeString()}
                  </Text>
                </View>
                <Text style={styles.historyPreview} numberOfLines={2}>
                  {item.content.slice(0, 100)}...
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const getStyles = (theme: 'light' | 'dark', isTablet: boolean) => {
  const isDark = theme === 'dark';
  
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? '#1a1a1a' : '#ffffff',
    },
    scrollView: {
      flex: 1,
      paddingHorizontal: isTablet ? 32 : 16,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 20,
    },
    title: {
      fontSize: isTablet ? 28 : 24,
      fontWeight: 'bold',
      color: isDark ? '#ffffff' : '#000000',
    },
    headerActions: {
      flexDirection: 'row',
      gap: 12,
    },
    modeButton: {
      padding: 8,
      borderRadius: 8,
      backgroundColor: isDark ? '#2a2a2a' : '#f0f0f0',
    },
    offlineButton: {
      backgroundColor: '#ff6b6b20',
    },
    settingsButton: {
      padding: 8,
      borderRadius: 8,
      backgroundColor: isDark ? '#2a2a2a' : '#f0f0f0',
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: isDark ? '#ffffff' : '#000000',
      marginBottom: 12,
    },
    providerSection: {
      marginBottom: 24,
    },
    providerList: {
      flexDirection: 'row',
      gap: 12,
    },
    providerCard: {
      padding: 12,
      borderRadius: 12,
      backgroundColor: isDark ? '#2a2a2a' : '#f8f9fa',
      borderWidth: 2,
      borderColor: 'transparent',
      minWidth: 120,
    },
    selectedProvider: {
      borderColor: '#4ECDC4',
      backgroundColor: '#4ECDC420',
    },
    unavailableProvider: {
      opacity: 0.5,
    },
    providerName: {
      fontSize: 14,
      fontWeight: '600',
      color: isDark ? '#ffffff' : '#000000',
    },
    providerType: {
      fontSize: 12,
      color: '#666',
      marginTop: 2,
    },
    unavailableText: {
      fontSize: 10,
      color: '#ff6b6b',
      marginTop: 4,
    },
    templatesSection: {
      marginBottom: 24,
    },
    templateGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    templateCard: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
      borderRadius: 12,
      backgroundColor: isDark ? '#2a2a2a' : '#f8f9fa',
      gap: 8,
      minWidth: isTablet ? 160 : 140,
    },
    templateText: {
      fontSize: 14,
      color: isDark ? '#ffffff' : '#000000',
    },
    inputSection: {
      marginBottom: 24,
    },
    promptInput: {
      backgroundColor: isDark ? '#2a2a2a' : '#f8f9fa',
      borderRadius: 12,
      padding: 16,
      fontSize: 16,
      color: isDark ? '#ffffff' : '#000000',
      minHeight: 100,
      marginBottom: 16,
      textAlignVertical: 'top',
    },
    generateButton: {
      backgroundColor: '#4ECDC4',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
      borderRadius: 12,
      gap: 8,
    },
    generatingButton: {
      backgroundColor: '#666',
    },
    generateButtonText: {
      color: 'white',
      fontSize: 16,
      fontWeight: '600',
    },
    codeSection: {
      marginBottom: 24,
    },
    codeHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    copyButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      padding: 8,
      borderRadius: 8,
      backgroundColor: '#4ECDC420',
    },
    copyButtonText: {
      color: '#4ECDC4',
      fontSize: 14,
    },
    codeContainer: {
      backgroundColor: isDark ? '#0d1117' : '#f6f8fa',
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      borderColor: isDark ? '#30363d' : '#d0d7de',
    },
    codeText: {
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      fontSize: 12,
      color: isDark ? '#f0f6fc' : '#24292f',
      lineHeight: 18,
    },
    historySection: {
      marginBottom: 32,
    },
    historyItem: {
      padding: 16,
      borderRadius: 12,
      backgroundColor: isDark ? '#2a2a2a' : '#f8f9fa',
      marginBottom: 12,
    },
    historyHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    historyProvider: {
      fontSize: 12,
      fontWeight: '600',
      color: '#4ECDC4',
    },
    historyTime: {
      fontSize: 12,
      color: '#666',
    },
    historyPreview: {
      fontSize: 14,
      color: isDark ? '#cccccc' : '#666666',
      lineHeight: 20,
    },
  });
};

export default MobileCodeGenerator;