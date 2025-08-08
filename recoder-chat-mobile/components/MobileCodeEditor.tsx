/**
 * Mobile Code Editor
 * Full-featured code editor optimized for mobile devices
 */

import React, { useState, useRef, useEffect } from 'react';
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
} from 'react-native';
import { dualPlatformClient } from '../services/DualPlatformClient';

const { width, height } = Dimensions.get('window');

interface MobileCodeEditorProps {
  initialCode?: string;
  language?: string;
  onCodeChange?: (code: string) => void;
  readOnly?: boolean;
  theme?: 'light' | 'dark';
  showLineNumbers?: boolean;
  autoComplete?: boolean;
}

interface SyntaxToken {
  type: 'keyword' | 'string' | 'comment' | 'number' | 'operator' | 'identifier' | 'bracket';
  value: string;
  color: string;
}

interface AutoSuggestion {
  text: string;
  description: string;
  type: 'method' | 'property' | 'keyword' | 'snippet';
}

const MobileCodeEditor: React.FC<MobileCodeEditorProps> = ({
  initialCode = '',
  language = 'javascript',
  onCodeChange,
  readOnly = false,
  theme = 'light',
  showLineNumbers = true,
  autoComplete = true,
}) => {
  const [code, setCode] = useState(initialCode);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [suggestions, setSuggestions] = useState<AutoSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedLine, setSelectedLine] = useState(0);
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);
  const [showToolbar, setShowToolbar] = useState(true);
  const [fontSize, setFontSize] = useState(14);
  
  const textInputRef = useRef<TextInput>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  // Language-specific syntax highlighting
  const getLanguageTokens = (code: string, lang: string): SyntaxToken[] => {
    const tokens: SyntaxToken[] = [];
    const colors = theme === 'dark' ? darkThemeColors : lightThemeColors;
    
    // JavaScript/TypeScript keywords
    const jsKeywords = [
      'function', 'const', 'let', 'var', 'if', 'else', 'for', 'while', 'return',
      'class', 'interface', 'type', 'enum', 'import', 'export', 'from', 'default',
      'async', 'await', 'try', 'catch', 'finally', 'throw', 'new', 'this', 'super'
    ];
    
    // Python keywords
    const pythonKeywords = [
      'def', 'class', 'if', 'elif', 'else', 'for', 'while', 'return', 'import',
      'from', 'as', 'try', 'except', 'finally', 'with', 'lambda', 'yield'
    ];
    
    // Rust keywords
    const rustKeywords = [
      'fn', 'let', 'mut', 'const', 'static', 'struct', 'enum', 'impl', 'trait',
      'if', 'else', 'match', 'for', 'while', 'loop', 'return', 'use', 'mod'
    ];

    const keywords = lang === 'python' ? pythonKeywords : 
                    lang === 'rust' ? rustKeywords : jsKeywords;

    // Simple tokenization (would be more sophisticated in production)
    const lines = code.split('\n');
    lines.forEach((line, lineIndex) => {
      let remaining = line;
      let position = 0;

      while (remaining.length > 0) {
        // Match strings
        const stringMatch = remaining.match(/^(['"`])((?:\\.|(?!\1).)*)\1/);
        if (stringMatch) {
          tokens.push({
            type: 'string',
            value: stringMatch[0],
            color: colors.string
          });
          position += stringMatch[0].length;
          remaining = remaining.slice(stringMatch[0].length);
          continue;
        }

        // Match comments
        const commentMatch = remaining.match(/^\/\/.*$|^\/\*[\s\S]*?\*\/|^#.*$/);
        if (commentMatch) {
          tokens.push({
            type: 'comment',
            value: commentMatch[0],
            color: colors.comment
          });
          position += commentMatch[0].length;
          remaining = remaining.slice(commentMatch[0].length);
          continue;
        }

        // Match numbers
        const numberMatch = remaining.match(/^\d+(\.\d+)?/);
        if (numberMatch) {
          tokens.push({
            type: 'number',
            value: numberMatch[0],
            color: colors.number
          });
          position += numberMatch[0].length;
          remaining = remaining.slice(numberMatch[0].length);
          continue;
        }

        // Match keywords
        const wordMatch = remaining.match(/^[a-zA-Z_][a-zA-Z0-9_]*/);
        if (wordMatch && keywords.includes(wordMatch[0])) {
          tokens.push({
            type: 'keyword',
            value: wordMatch[0],
            color: colors.keyword
          });
          position += wordMatch[0].length;
          remaining = remaining.slice(wordMatch[0].length);
          continue;
        }

        // Match brackets and operators
        const operatorMatch = remaining.match(/^[{}()\[\];.,+\-*\/=<>!&|]/);
        if (operatorMatch) {
          tokens.push({
            type: operatorMatch[0].match(/[{}()\[\]]/) ? 'bracket' : 'operator',
            value: operatorMatch[0],
            color: operatorMatch[0].match(/[{}()\[\]]/) ? colors.bracket : colors.operator
          });
          position += 1;
          remaining = remaining.slice(1);
          continue;
        }

        // Default: identifier or whitespace
        const char = remaining[0];
        tokens.push({
          type: 'identifier',
          value: char,
          color: char.match(/\s/) ? colors.background : colors.identifier
        });
        position += 1;
        remaining = remaining.slice(1);
      }
    });

    return tokens;
  };

  const lightThemeColors = {
    background: '#ffffff',
    text: '#1f2937',
    keyword: '#3b82f6',
    string: '#10b981',
    comment: '#6b7280',
    number: '#f59e0b',
    operator: '#ef4444',
    bracket: '#8b5cf6',
    identifier: '#1f2937',
    lineNumber: '#9ca3af',
    selection: '#dbeafe',
  };

  const darkThemeColors = {
    background: '#1f2937',
    text: '#f9fafb',
    keyword: '#60a5fa',
    string: '#34d399',
    comment: '#9ca3af',
    number: '#fbbf24',
    operator: '#f87171',
    bracket: '#a78bfa',
    identifier: '#f9fafb',
    lineNumber: '#6b7280',
    selection: '#1e40af',
  };

  const colors = theme === 'dark' ? darkThemeColors : lightThemeColors;

  // AI-powered code completion
  const getCodeSuggestions = async (currentCode: string, position: number): Promise<AutoSuggestion[]> => {
    if (!autoComplete) return [];

    try {
      // Get context around cursor
      const beforeCursor = currentCode.slice(0, position);
      const afterCursor = currentCode.slice(position);
      const currentWord = beforeCursor.split(/\s/).pop() || '';

      // Basic suggestions based on language
      const baseSuggestions: AutoSuggestion[] = [];

      if (language === 'javascript' || language === 'typescript') {
        baseSuggestions.push(
          { text: 'console.log()', description: 'Log to console', type: 'method' },
          { text: 'function name() {}', description: 'Function declaration', type: 'snippet' },
          { text: 'const name = ', description: 'Constant declaration', type: 'keyword' },
          { text: 'if (condition) {}', description: 'If statement', type: 'snippet' },
          { text: 'for (let i = 0; i < length; i++) {}', description: 'For loop', type: 'snippet' }
        );
      }

      // Filter suggestions based on current word
      return baseSuggestions.filter(suggestion =>
        suggestion.text.toLowerCase().includes(currentWord.toLowerCase())
      ).slice(0, 5);
    } catch (error) {
      console.error('Error getting suggestions:', error);
      return [];
    }
  };

  const handleCodeChange = (newCode: string) => {
    setCode(newCode);
    onCodeChange?.(newCode);
  };

  const handleSelectionChange = async (event: any) => {
    const { start } = event.nativeEvent.selection;
    setCursorPosition(start);

    if (autoComplete) {
      const suggestions = await getCodeSuggestions(code, start);
      setSuggestions(suggestions);
      setShowSuggestions(suggestions.length > 0);
    }
  };

  const insertSuggestion = (suggestion: AutoSuggestion) => {
    const beforeCursor = code.slice(0, cursorPosition);
    const afterCursor = code.slice(cursorPosition);
    const words = beforeCursor.split(/\s/);
    const currentWord = words.pop() || '';
    const beforeWord = words.join(' ') + (words.length > 0 ? ' ' : '');
    
    const newCode = beforeWord + suggestion.text + afterCursor;
    handleCodeChange(newCode);
    setShowSuggestions(false);
    
    // Set cursor position after insertion
    const newCursorPosition = beforeWord.length + suggestion.text.length;
    setCursorPosition(newCursorPosition);
  };

  const generateCodeWithAI = async () => {
    Alert.prompt(
      'Generate Code',
      'Describe what code you want to generate:',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Generate',
          onPress: async (prompt) => {
            if (!prompt) return;
            
            setIsGeneratingCode(true);
            try {
              const response = await dualPlatformClient.generateCode({
                prompt,
                language,
                framework: 'react-native'
              });

              if (response.success && response.data) {
                const generatedCode = response.data.code;
                const newCode = code + '\n\n' + generatedCode;
                handleCodeChange(newCode);
                
                Alert.alert(
                  'Code Generated',
                  response.data.explanation,
                  [{ text: 'OK' }]
                );
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to generate code');
            } finally {
              setIsGeneratingCode(false);
            }
          }
        }
      ],
      'plain-text'
    );
  };

  const formatCode = () => {
    // Basic code formatting
    let formatted = code;
    
    if (language === 'javascript' || language === 'typescript') {
      // Add basic indentation
      const lines = formatted.split('\n');
      let indentLevel = 0;
      
      const formattedLines = lines.map(line => {
        const trimmed = line.trim();
        if (trimmed.includes('}')) indentLevel--;
        const indentedLine = '  '.repeat(Math.max(0, indentLevel)) + trimmed;
        if (trimmed.includes('{')) indentLevel++;
        return indentedLine;
      });
      
      formatted = formattedLines.join('\n');
    }
    
    handleCodeChange(formatted);
  };

  const insertTab = () => {
    const beforeCursor = code.slice(0, cursorPosition);
    const afterCursor = code.slice(cursorPosition);
    const newCode = beforeCursor + '  ' + afterCursor; // 2 spaces for tab
    handleCodeChange(newCode);
    setCursorPosition(cursorPosition + 2);
  };

  const insertBrackets = (openBracket: string, closeBracket: string) => {
    const beforeCursor = code.slice(0, cursorPosition);
    const afterCursor = code.slice(cursorPosition);
    const newCode = beforeCursor + openBracket + closeBracket + afterCursor;
    handleCodeChange(newCode);
    setCursorPosition(cursorPosition + 1); // Position cursor between brackets
  };

  const getLineNumbers = (): string[] => {
    return code.split('\n').map((_, index) => (index + 1).toString());
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Toolbar */}
      {showToolbar && (
        <View style={[styles.toolbar, { borderBottomColor: colors.selection }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <TouchableOpacity style={styles.toolbarButton} onPress={insertTab}>
              <Text style={[styles.toolbarButtonText, { color: colors.text }]}>Tab</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.toolbarButton} 
              onPress={() => insertBrackets('{', '}')}
            >
              <Text style={[styles.toolbarButtonText, { color: colors.text }]}>{ }</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.toolbarButton} 
              onPress={() => insertBrackets('(', ')')}
            >
              <Text style={[styles.toolbarButtonText, { color: colors.text }]}>( )</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.toolbarButton} 
              onPress={() => insertBrackets('[', ']')}
            >
              <Text style={[styles.toolbarButtonText, { color: colors.text }]}>[ ]</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.toolbarButton} onPress={formatCode}>
              <Text style={[styles.toolbarButtonText, { color: colors.text }]}>Format</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.toolbarButton, { backgroundColor: colors.keyword }]} 
              onPress={generateCodeWithAI}
              disabled={isGeneratingCode}
            >
              <Text style={[styles.toolbarButtonText, { color: '#ffffff' }]}>
                {isGeneratingCode ? '⏳ AI' : '🤖 AI'}
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.toolbarButton} 
              onPress={() => setFontSize(prev => Math.min(prev + 1, 20))}
            >
              <Text style={[styles.toolbarButtonText, { color: colors.text }]}>A+</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.toolbarButton} 
              onPress={() => setFontSize(prev => Math.max(prev - 1, 10))}
            >
              <Text style={[styles.toolbarButtonText, { color: colors.text }]}>A-</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}

      {/* Editor Container */}
      <View style={styles.editorContainer}>
        {/* Line Numbers */}
        {showLineNumbers && (
          <View style={[styles.lineNumbers, { backgroundColor: colors.selection }]}>
            <ScrollView ref={scrollViewRef} showsVerticalScrollIndicator={false}>
              {getLineNumbers().map((lineNum, index) => (
                <Text
                  key={index}
                  style={[
                    styles.lineNumber,
                    { 
                      color: colors.lineNumber,
                      fontSize: fontSize - 2,
                      lineHeight: fontSize + 6
                    }
                  ]}
                >
                  {lineNum}
                </Text>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Code Input */}
        <View style={styles.codeContainer}>
          <TextInput
            ref={textInputRef}
            style={[
              styles.codeInput,
              {
                color: colors.text,
                fontSize: fontSize,
                lineHeight: fontSize + 6,
              }
            ]}
            value={code}
            onChangeText={handleCodeChange}
            onSelectionChange={handleSelectionChange}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            spellCheck={false}
            textAlignVertical="top"
            scrollEnabled={true}
            editable={!readOnly}
            placeholder={`Start typing ${language} code...`}
            placeholderTextColor={colors.comment}
          />
        </View>
      </View>

      {/* Auto-suggestions */}
      {showSuggestions && suggestions.length > 0 && (
        <View style={[styles.suggestionsContainer, { backgroundColor: colors.background }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {suggestions.map((suggestion, index) => (
              <TouchableOpacity
                key={index}
                style={[styles.suggestion, { backgroundColor: colors.selection }]}
                onPress={() => insertSuggestion(suggestion)}
              >
                <Text style={[styles.suggestionText, { color: colors.text }]}>
                  {suggestion.text}
                </Text>
                <Text style={[styles.suggestionDescription, { color: colors.comment }]}>
                  {suggestion.description}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  toolbar: {
    flexDirection: 'row',
    padding: 8,
    borderBottomWidth: 1,
  },
  toolbarButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 4,
    borderRadius: 4,
    backgroundColor: '#f3f4f6',
  },
  toolbarButtonText: {
    fontSize: 12,
    fontWeight: '500',
  },
  editorContainer: {
    flex: 1,
    flexDirection: 'row',
  },
  lineNumbers: {
    width: 40,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  lineNumber: {
    textAlign: 'right',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: 2,
  },
  codeContainer: {
    flex: 1,
  },
  codeInput: {
    flex: 1,
    padding: 8,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    textAlignVertical: 'top',
  },
  suggestionsContainer: {
    maxHeight: 60,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    padding: 8,
  },
  suggestion: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    borderRadius: 6,
    minWidth: 120,
  },
  suggestionText: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 2,
  },
  suggestionDescription: {
    fontSize: 12,
  },
});

export default MobileCodeEditor;