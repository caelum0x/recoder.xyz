import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  Dimensions,
  Platform,
  KeyboardAvoidingView,
  Animated,
  ActivityIndicator,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';

// Type casting to fix JSX compatibility with React 19
const IoniconsCompat = Ionicons as any;
const BlurViewCompat = BlurView as any;
import { LinearGradient } from 'expo-linear-gradient';
import { dualPlatformClient } from '../services/DualPlatformClient';
import { realTimeMessaging } from '../services/RealTimeMessaging';
import { notificationService } from '../services/NotificationService';

const { width, height } = Dimensions.get('window');

interface Language {
  id: string;
  name: string;
  extension: string;
  color: string;
  icon: string;
  keywords: string[];
  snippets: CodeSnippet[];
}

interface CodeSnippet {
  trigger: string;
  content: string;
  description: string;
  type: 'function' | 'class' | 'loop' | 'condition' | 'import';
}

interface GenerationRequest {
  prompt: string;
  language: string;
  framework?: string;
  style?: 'functional' | 'object-oriented' | 'minimal' | 'comprehensive';
  includeTests?: boolean;
  includeComments?: boolean;
  optimization?: 'performance' | 'readability' | 'size';
}

interface GeneratedCode {
  code: string;
  explanation: string;
  language: string;
  framework?: string;
  files?: { name: string; content: string }[];
  tests?: string;
  dependencies?: string[];
  instructions?: string;
  timeGenerated: number;
}

interface AICodeGenerationScreenProps {
  initialCode?: string;
  language?: string;
  onSave?: (code: string, metadata: any) => void;
  onClose?: () => void;
}

const SUPPORTED_LANGUAGES: Language[] = [
  {
    id: 'typescript',
    name: 'TypeScript',
    extension: '.ts',
    color: '#3178C6',
    icon: '🟦',
    keywords: ['interface', 'type', 'enum', 'namespace', 'declare', 'abstract', 'readonly'],
    snippets: [
      {
        trigger: 'interface',
        content: 'interface ${1:InterfaceName} {\n  ${2:property}: ${3:type};\n}',
        description: 'TypeScript interface',
        type: 'class'
      },
      {
        trigger: 'async',
        content: 'async function ${1:functionName}(${2:params}): Promise<${3:ReturnType}> {\n  ${4:// implementation}\n}',
        description: 'Async function with types',
        type: 'function'
      }
    ]
  },
  {
    id: 'javascript',
    name: 'JavaScript',
    extension: '.js',
    color: '#F7DF1E',
    icon: '🟨',
    keywords: ['var', 'let', 'const', 'function', 'class', 'extends', 'import', 'export'],
    snippets: [
      {
        trigger: 'func',
        content: 'function ${1:functionName}(${2:params}) {\n  ${3:// implementation}\n}',
        description: 'Function declaration',
        type: 'function'
      },
      {
        trigger: 'arrow',
        content: 'const ${1:functionName} = (${2:params}) => {\n  ${3:// implementation}\n};',
        description: 'Arrow function',
        type: 'function'
      }
    ]
  },
  {
    id: 'python',
    name: 'Python',
    extension: '.py',
    color: '#3776AB',
    icon: '🐍',
    keywords: ['def', 'class', 'if', 'elif', 'else', 'for', 'while', 'import', 'from'],
    snippets: [
      {
        trigger: 'def',
        content: 'def ${1:function_name}(${2:params}):\n    """${3:Description}"""\n    ${4:pass}',
        description: 'Function definition',
        type: 'function'
      },
      {
        trigger: 'class',
        content: 'class ${1:ClassName}:\n    """${2:Description}"""\n    \n    def __init__(self, ${3:params}):\n        ${4:pass}',
        description: 'Class definition',
        type: 'class'
      }
    ]
  },
  {
    id: 'rust',
    name: 'Rust',
    extension: '.rs',
    color: '#CE422B',
    icon: '🦀',
    keywords: ['fn', 'let', 'mut', 'struct', 'enum', 'impl', 'trait', 'use', 'mod'],
    snippets: [
      {
        trigger: 'fn',
        content: 'fn ${1:function_name}(${2:params}) -> ${3:ReturnType} {\n    ${4:todo!()}\n}',
        description: 'Function definition',
        type: 'function'
      },
      {
        trigger: 'struct',
        content: 'struct ${1:StructName} {\n    ${2:field}: ${3:Type},\n}',
        description: 'Struct definition',
        type: 'class'
      }
    ]
  },
  {
    id: 'solidity',
    name: 'Solidity',
    extension: '.sol',
    color: '#363636',
    icon: '💎',
    keywords: ['contract', 'function', 'mapping', 'struct', 'event', 'modifier', 'require'],
    snippets: [
      {
        trigger: 'contract',
        content: 'contract ${1:ContractName} {\n    ${2:// state variables}\n    \n    constructor() {\n        ${3:// initialization}\n    }\n}',
        description: 'Smart contract',
        type: 'class'
      },
      {
        trigger: 'function',
        content: 'function ${1:functionName}(${2:params}) ${3:public} ${4:returns (${5:returnType})} {\n    ${6:// implementation}\n}',
        description: 'Contract function',
        type: 'function'
      }
    ]
  }
];

export default function AICodeGenerationScreen({
  initialCode = '',
  language = 'typescript',
  onSave,
  onClose,
}: AICodeGenerationScreenProps) {
  const colorScheme = useColorScheme();
  const [code, setCode] = useState(initialCode);
  const [selectedLanguage, setSelectedLanguage] = useState(language);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationHistory, setGenerationHistory] = useState<GeneratedCode[]>([]);
  const [showLanguageSelector, setShowLanguageSelector] = useState(false);
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [generationSettings, setGenerationSettings] = useState({
    framework: '',
    style: 'functional' as const,
    includeTests: false,
    includeComments: true,
    optimization: 'readability' as const,
  });
  const [fontSize, setFontSize] = useState(14);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<CodeSnippet[]>([]);
  const [cursorPosition, setCursorPosition] = useState(0);
  
  const textInputRef = useRef<TextInput>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const generationProgress = useRef(new Animated.Value(0)).current;
  const slideAnimation = useRef(new Animated.Value(height)).current;

  const isDark = colorScheme === 'dark';
  const colors = {
    background: isDark ? '#000000' : '#ffffff',
    surface: isDark ? '#1c1c1e' : '#f8f9fa',
    surfaceSecondary: isDark ? '#2c2c2e' : '#ffffff',
    primary: '#007AFF',
    secondary: '#5856D6',
    text: isDark ? '#ffffff' : '#1f2937',
    textSecondary: isDark ? '#9ca3af' : '#6b7280',
    border: isDark ? '#38383a' : '#e5e7eb',
    success: '#34C759',
    warning: '#FF9500',
    error: '#FF3B30',
    
    // Syntax colors
    keyword: isDark ? '#FF7AB2' : '#AF52DE',
    string: isDark ? '#FC6A5D' : '#C41A16',
    comment: isDark ? '#6C7986' : '#707F8D',
    number: isDark ? '#D9C97C' : '#1C00CF',
    function: isDark ? '#67B7A4' : '#326D74',
    variable: isDark ? '#ACF2E4' : '#0B4F79',
    operator: isDark ? '#F8F8F2' : '#000000',
  };

  const currentLanguage = SUPPORTED_LANGUAGES.find(lang => lang.id === selectedLanguage) || SUPPORTED_LANGUAGES[0];

  useEffect(() => {
    if (showPromptModal) {
      Animated.spring(slideAnimation, {
        toValue: 0,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.spring(slideAnimation, {
        toValue: height,
        useNativeDriver: true,
      }).start();
    }
  }, [showPromptModal]);

  const handleGenerateCode = async () => {
    if (!prompt.trim()) {
      Alert.alert('Error', 'Please enter a description for the code you want to generate.');
      return;
    }

    setIsGenerating(true);
    setShowPromptModal(false);
    
    // Start progress animation
    Animated.timing(generationProgress, {
      toValue: 1,
      duration: 3000,
      useNativeDriver: false,
    }).start();

    try {
      const request: GenerationRequest = {
        prompt: prompt.trim(),
        language: selectedLanguage,
        ...generationSettings,
      };

      const response = await dualPlatformClient.generateCode(request);
      
      if (response.success && response.data) {
        const generated: GeneratedCode = {
          ...response.data,
          timeGenerated: Date.now(),
          language: ''
        };
        
        setCode(generated.code);
        setGenerationHistory(prev => [generated, ...prev.slice(0, 9)]); // Keep last 10
        
        // Send notification
        await notificationService.scheduleLocalNotification({
          title: 'Code Generated Successfully! 🎉',
          body: `Generated ${selectedLanguage} code: ${prompt.slice(0, 50)}...`,
          data: { type: 'code_generation', language: selectedLanguage },
        });

        Alert.alert(
          'Code Generated Successfully!',
          generated.explanation || 'Your code has been generated.',
          [
            { text: 'View Code', style: 'default' },
            {
              text: 'Generate More',
              onPress: () => setShowPromptModal(true),
            },
          ]
        );
      } else {
        throw new Error(response.error || 'Failed to generate code');
      }
    } catch (error) {
      console.error('Code generation error:', error);
      Alert.alert(
        'Generation Failed',
        'Unable to generate code. Please check your connection and try again.',
        [
          { text: 'Cancel' },
          { text: 'Retry', onPress: () => setShowPromptModal(true) },
        ]
      );
    } finally {
      setIsGenerating(false);
      generationProgress.setValue(0);
      setPrompt('');
    }
  };

  const handleCodeChange = (newCode: string) => {
    setCode(newCode);
    
    // Get suggestions based on current input
    const currentWord = newCode.slice(0, cursorPosition).split(/\s|\n/).pop() || '';
    const matchingSnippets = currentLanguage.snippets.filter(snippet =>
      snippet.trigger.toLowerCase().includes(currentWord.toLowerCase())
    );
    
    setSuggestions(matchingSnippets);
    setShowSuggestions(matchingSnippets.length > 0 && currentWord.length > 1);
  };

  const insertSnippet = (snippet: CodeSnippet) => {
    const beforeCursor = code.slice(0, cursorPosition);
    const afterCursor = code.slice(cursorPosition);
    const words = beforeCursor.split(/\s|\n/);
    words.pop(); // Remove the current partial word
    const beforeSnippet = words.join(' ') + (words.length > 0 ? ' ' : '');
    
    // Simple template variable replacement
    let snippetContent = snippet.content;
    let variableIndex = 1;
    snippetContent = snippetContent.replace(/\$\{\d+:([^}]+)\}/g, (match, defaultValue) => {
      return defaultValue;
    });
    
    const newCode = beforeSnippet + snippetContent + afterCursor;
    setCode(newCode);
    setShowSuggestions(false);
  };

  const handleLanguageChange = (langId: string) => {
    setSelectedLanguage(langId);
    setShowLanguageSelector(false);
    
    // Clear suggestions when language changes
    setShowSuggestions(false);
    setSuggestions([]);
  };

  const handleSave = () => {
    if (!code.trim()) {
      Alert.alert('Error', 'Cannot save empty code.');
      return;
    }

    const metadata = {
      language: selectedLanguage,
      timeCreated: Date.now(),
      linesOfCode: code.split('\n').length,
      generationHistory: generationHistory[0] || null,
    };

    onSave?.(code, metadata);
    Alert.alert('Saved', 'Your code has been saved successfully.');
  };

  const renderSyntaxHighlightedCode = () => {
    // This is a simplified version - in production, you'd use a proper syntax highlighter
    const lines = code.split('\n');
    
    return lines.map((line, index) => (
      <Text key={index} style={[styles.codeLine, { fontSize, lineHeight: fontSize + 4 }]}>
        <Text style={[styles.lineNumber, { color: colors.textSecondary }]}>
          {(index + 1).toString().padStart(3, ' ')}
        </Text>
        <Text style={{ color: colors.text }}> {line}</Text>
      </Text>
    ));
  };

  const renderGenerationHistory = () => {
    if (generationHistory.length === 0) return null;

    return (
      <View style={[styles.historyContainer, { backgroundColor: colors.surface }]}>
        <Text style={[styles.historyTitle, { color: colors.text }]}>Recent Generations</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {generationHistory.map((item, index) => (
            <TouchableOpacity
              key={index}
              style={[styles.historyItem, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
              onPress={() => {
                setCode(item.code);
                Alert.alert('Code Loaded', item.explanation || 'Previous generation loaded.');
              }}
            >
              <Text style={[styles.historyLanguage, { color: currentLanguage.color }]}>
                {currentLanguage.icon} {item.language}
              </Text>
              <Text style={[styles.historyTime, { color: colors.textSecondary }]}>
                {new Date(item.timeGenerated).toLocaleTimeString()}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView 
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <IoniconsCompat name="close" size={24} color={colors.text} />
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.languageButton, { backgroundColor: currentLanguage.color + '20' }]}
            onPress={() => setShowLanguageSelector(true)}
          >
            <Text style={styles.languageEmoji}>{currentLanguage.icon}</Text>
            <Text style={[styles.languageName, { color: currentLanguage.color }]}>
              {currentLanguage.name}
            </Text>
            <IoniconsCompat name="chevron-down" size={16} color={currentLanguage.color} />
          </TouchableOpacity>
          
          <View style={styles.headerActions}>
            <TouchableOpacity 
              style={[styles.headerButton, { backgroundColor: colors.primary }]}
              onPress={() => setShowPromptModal(true)}
              disabled={isGenerating}
            >
              <IoniconsCompat name="sparkles" size={18} color="#ffffff" />
              <Text style={styles.headerButtonText}>
                {isGenerating ? 'Generating...' : 'Generate'}
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.headerButton, { backgroundColor: colors.success }]}
              onPress={handleSave}
              disabled={!code.trim()}
            >
              <IoniconsCompat name="save" size={18} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Generation Progress */}
        {isGenerating && (
          <View style={[styles.progressContainer, { backgroundColor: colors.surface }]}>
            <View style={styles.progressContent}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.progressText, { color: colors.text }]}>
                Generating {selectedLanguage} code...
              </Text>
            </View>
            <Animated.View
              style={[
                styles.progressBar,
                {
                  backgroundColor: colors.primary,
                  width: generationProgress.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '100%'],
                  }),
                },
              ]}
            />
          </View>
        )}

        {renderGenerationHistory()}

        {/* Code Editor */}
        <View style={styles.editorContainer}>
          <ScrollView
            style={styles.codeScroll}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.codeContent}
          >
            <TextInput
              ref={textInputRef}
              style={[
                styles.codeInput,
                {
                  color: colors.text,
                  fontSize,
                  fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                }
              ]}
              value={code}
              onChangeText={handleCodeChange}
              onSelectionChange={(event) => setCursorPosition(event.nativeEvent.selection.start)}
              multiline
              textAlignVertical="top"
              placeholder={`Start coding in ${currentLanguage.name}...`}
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
            />
          </ScrollView>
        </View>

        {/* Code Suggestions */}
        {showSuggestions && suggestions.length > 0 && (
          <View style={[styles.suggestionsContainer, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {suggestions.map((suggestion, index) => (
                <TouchableOpacity
                  key={index}
                  style={[styles.suggestion, { backgroundColor: colors.surfaceSecondary }]}
                  onPress={() => insertSnippet(suggestion)}
                >
                  <Text style={[styles.suggestionTrigger, { color: colors.text }]}>
                    {suggestion.trigger}
                  </Text>
                  <Text style={[styles.suggestionDescription, { color: colors.textSecondary }]}>
                    {suggestion.description}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Language Selector Modal */}
        <Modal visible={showLanguageSelector} transparent animationType="fade">
          <BlurViewCompat intensity={20} style={styles.modalOverlay}>
            <View style={[styles.languageModal, { backgroundColor: colors.surface }]}>
              <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Select Language</Text>
                <TouchableOpacity onPress={() => setShowLanguageSelector(false)}>
                  <IoniconsCompat name="close" size={24} color={colors.text} />
                </TouchableOpacity>
              </View>
              
              <ScrollView style={styles.languageList}>
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <TouchableOpacity
                    key={lang.id}
                    style={[
                      styles.languageOption,
                      { backgroundColor: selectedLanguage === lang.id ? lang.color + '20' : 'transparent' }
                    ]}
                    onPress={() => handleLanguageChange(lang.id)}
                  >
                    <Text style={styles.languageOptionEmoji}>{lang.icon}</Text>
                    <View style={styles.languageOptionInfo}>
                      <Text style={[styles.languageOptionName, { color: colors.text }]}>
                        {lang.name}
                      </Text>
                      <Text style={[styles.languageOptionExtension, { color: colors.textSecondary }]}>
                        {lang.extension}
                      </Text>
                    </View>
                    {selectedLanguage === lang.id && (
                      <IoniconsCompat name="checkmark" size={20} color={lang.color} />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </BlurViewCompat>
        </Modal>

        {/* Prompt Modal */}
        <Modal visible={showPromptModal} transparent animationType="none">
          <BlurViewCompat intensity={20} style={styles.modalOverlay}>
            <Animated.View
              style={[
                styles.promptModal,
                { backgroundColor: colors.surface, transform: [{ translateY: slideAnimation }] }
              ]}
            >
              <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Generate Code with AI</Text>
                <TouchableOpacity onPress={() => setShowPromptModal(false)}>
                  <IoniconsCompat name="close" size={24} color={colors.text} />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.promptContent}>
                <TextInput
                  style={[
                    styles.promptInput,
                    { 
                      backgroundColor: colors.background,
                      borderColor: colors.border,
                      color: colors.text 
                    }
                  ]}
                  value={prompt}
                  onChangeText={setPrompt}
                  placeholder="Describe the code you want to generate..."
                  placeholderTextColor={colors.textSecondary}
                  multiline
                  maxLength={1000}
                />

                <View style={styles.settingsSection}>
                  <Text style={[styles.settingsTitle, { color: colors.text }]}>Generation Settings</Text>
                  
                  {/* Style Selection */}
                  <View style={styles.settingRow}>
                    <Text style={[styles.settingLabel, { color: colors.textSecondary }]}>Code Style</Text>
                    <View style={styles.styleOptions}>
                      {['functional', 'object-oriented', 'minimal', 'comprehensive'].map((style) => (
                        <TouchableOpacity
                          key={style}
                          style={[
                            styles.styleOption,
                            {
                              backgroundColor: generationSettings.style === style 
                                ? colors.primary + '20' 
                                : colors.background,
                              borderColor: generationSettings.style === style 
                                ? colors.primary 
                                : colors.border
                            }
                          ]}
                          onPress={() => setGenerationSettings(prev => ({ ...prev, style: style as any }))}
                        >
                          <Text style={[
                            styles.styleOptionText,
                            { 
                              color: generationSettings.style === style 
                                ? colors.primary 
                                : colors.text 
                            }
                          ]}>
                            {style}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  {/* Include Options */}
                  <View style={styles.settingRow}>
                    <TouchableOpacity
                      style={styles.checkboxRow}
                      onPress={() => setGenerationSettings(prev => ({
                        ...prev,
                        includeComments: !prev.includeComments
                      }))}
                    >
                      <IoniconsCompat
                        name={generationSettings.includeComments ? "checkbox" : "square-outline"}
                        size={20}
                        color={colors.primary}
                      />
                      <Text style={[styles.checkboxLabel, { color: colors.text }]}>
                        Include Comments
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.settingRow}>
                    <TouchableOpacity
                      style={styles.checkboxRow}
                      onPress={() => setGenerationSettings(prev => ({
                        ...prev,
                        includeTests: !prev.includeTests
                      }))}
                    >
                      <IoniconsCompat
                        name={generationSettings.includeTests ? "checkbox" : "square-outline"}
                        size={20}
                        color={colors.primary}
                      />
                      <Text style={[styles.checkboxLabel, { color: colors.text }]}>
                        Include Tests
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </ScrollView>

              <View style={[styles.promptActions, { borderTopColor: colors.border }]}>
                <TouchableOpacity
                  style={[styles.promptButton, styles.cancelButton]}
                  onPress={() => setShowPromptModal(false)}
                >
                  <Text style={[styles.promptButtonText, { color: colors.text }]}>Cancel</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[styles.promptButton, styles.generateButton, { backgroundColor: colors.primary }]}
                  onPress={handleGenerateCode}
                  disabled={!prompt.trim()}
                >
                  <IoniconsCompat name="sparkles" size={18} color="#ffffff" />
                  <Text style={[styles.promptButtonText, { color: '#ffffff' }]}>Generate</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </BlurViewCompat>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  closeButton: {
    marginRight: 16,
  },
  languageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    flex: 1,
  },
  languageEmoji: {
    fontSize: 18,
    marginRight: 8,
  },
  languageName: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  headerActions: {
    flexDirection: 'row',
    marginLeft: 16,
  },
  headerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginLeft: 8,
  },
  headerButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 4,
  },
  progressContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    position: 'relative',
  },
  progressContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressText: {
    fontSize: 14,
    marginLeft: 8,
  },
  progressBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    height: 2,
    borderRadius: 1,
  },
  historyContainer: {
    paddingVertical: 12,
  },
  historyTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 16,
    marginBottom: 8,
  },
  historyItem: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginLeft: 16,
    marginRight: 8,
    borderWidth: StyleSheet.hairlineWidth,
    minWidth: 120,
  },
  historyLanguage: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  historyTime: {
    fontSize: 12,
  },
  editorContainer: {
    flex: 1,
  },
  codeScroll: {
    flex: 1,
  },
  codeContent: {
    flexGrow: 1,
  },
  codeInput: {
    flex: 1,
    padding: 16,
    minHeight: 400,
    textAlignVertical: 'top',
  },
  codeLine: {
    flexDirection: 'row',
  },
  lineNumber: {
    width: 40,
    textAlign: 'right',
    fontSize: 12,
  },
  suggestionsContainer: {
    maxHeight: 80,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  suggestion: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginHorizontal: 4,
    minWidth: 140,
  },
  suggestionTrigger: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  suggestionDescription: {
    fontSize: 12,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  languageModal: {
    width: width * 0.9,
    maxHeight: height * 0.7,
    borderRadius: 16,
  },
  promptModal: {
    width: width * 0.95,
    maxHeight: height * 0.9,
    borderRadius: 16,
    marginTop: 'auto',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  languageList: {
    maxHeight: 400,
  },
  languageOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  languageOptionEmoji: {
    fontSize: 20,
    marginRight: 12,
  },
  languageOptionInfo: {
    flex: 1,
  },
  languageOptionName: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 2,
  },
  languageOptionExtension: {
    fontSize: 14,
  },
  promptContent: {
    padding: 16,
    maxHeight: 400,
  },
  promptInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    minHeight: 120,
    textAlignVertical: 'top',
    marginBottom: 20,
  },
  settingsSection: {
    marginTop: 8,
  },
  settingsTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  settingRow: {
    marginBottom: 16,
  },
  settingLabel: {
    fontSize: 14,
    marginBottom: 8,
  },
  styleOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  styleOption: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    marginRight: 8,
    marginBottom: 8,
  },
  styleOptionText: {
    fontSize: 14,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkboxLabel: {
    fontSize: 16,
    marginLeft: 8,
  },
  promptActions: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  promptButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    marginHorizontal: 4,
  },
  cancelButton: {
    backgroundColor: 'transparent',
  },
  generateButton: {
    // backgroundColor set dynamically
  },
  promptButtonText: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 4,
  },
});