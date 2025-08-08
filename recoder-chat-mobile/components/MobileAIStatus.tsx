import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Linking, Alert, StyleSheet } from 'react-native';
import { 
  getProviderStatus, 
  getSetupInstructions
} from '../lib/ai/providers';
import { localAI } from '../lib/services/LocalAIIntegration';

interface MobileAIStatusProps {
  onLocalAIDetected?: () => void;
  taskType?: string;
}

export default function MobileAIStatus({ onLocalAIDetected, taskType = 'mobile' }: MobileAIStatusProps) {
  const [status, setStatus] = useState<any>(null);
  const [instructions, setInstructions] = useState<string>('');
  const [recommendation, setRecommendation] = useState<any>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    updateStatus();
    // Check status every 30 seconds
    const interval = setInterval(updateStatus, 30000);
    return () => clearInterval(interval);
  }, [taskType]);

  const updateStatus = async () => {
    try {
      const [currentStatus, setupInstructions] = await Promise.all([
        getProviderStatus(),
        Promise.resolve(getSetupInstructions())
      ]);

      setStatus(currentStatus);
      setInstructions(setupInstructions);
      setRecommendation('Use Ollama for best mobile performance');

      // Notify if local AI is detected
      if ((currentStatus.ollama || currentStatus.lmStudio) && onLocalAIDetected) {
        onLocalAIDetected();
      }
    } catch (error) {
      console.error('Failed to update mobile AI status:', error);
    }
  };

  const handleTestConnection = async () => {
    setIsChecking(true);
    try {
      const result = await localAI.testConnection();
      
      if (result.ollama || result.lmStudio) {
        Alert.alert(
          '✅ Connection Successful!',
          `Found: ${result.ollama ? 'Ollama' : ''} ${result.lmStudio ? 'LM Studio' : ''}`,
          [{ text: 'Great!' }]
        );
        await updateStatus();
      } else {
        Alert.alert(
          '❌ No Local AI Found',
          'Make sure Ollama or LM Studio is running on your computer.',
          [
            { text: 'Setup Guide', onPress: () => setShowDetails(true) },
            { text: 'OK' }
          ]
        );
      }
    } catch (error) {
      Alert.alert(
        '❌ Connection Failed',
        'Unable to test local AI connection. Check your setup.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsChecking(false);
    }
  };

  const openURL = async (url: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Error', `Cannot open URL: ${url}`);
      }
    } catch (error) {
      console.error('Error opening URL:', error);
    }
  };

  if (!status) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Checking AI providers...</Text>
      </View>
    );
  }

  const hasLocalAI = status.ollama || status.lmStudio;

  const StatusIcon = ({ type, available }: { type: 'success' | 'warning' | 'error'; available?: boolean }) => {
    const color = type === 'success' ? '#10b981' : type === 'warning' ? '#f59e0b' : '#ef4444';
    return (
      <View style={[styles.statusIcon, { backgroundColor: color }]}>
        <Text style={styles.statusIconText}>
          {type === 'success' ? '✓' : type === 'warning' ? '!' : '✗'}
        </Text>
      </View>
    );
  };

  if (hasLocalAI) {
    return (
      <View style={styles.container}>
        <View style={styles.successHeader}>
          <StatusIcon type="success" />
          <View style={styles.headerText}>
            <Text style={styles.successTitle}>🎉 Local AI Active - Free & Private!</Text>
            <Text style={styles.successSubtitle}>
              Using {status.priority[0]} for unlimited AI inference
            </Text>
          </View>
        </View>

        <View style={styles.benefitsContainer}>
          <View style={styles.benefitItem}>
            <Text style={styles.benefitIcon}>⚡</Text>
            <Text style={styles.benefitText}>Unlimited Usage</Text>
          </View>
          <View style={styles.benefitItem}>
            <Text style={styles.benefitIcon}>🔒</Text>
            <Text style={styles.benefitText}>Private & Secure</Text>
          </View>
          <View style={styles.benefitItem}>
            <Text style={styles.benefitIcon}>📱</Text>
            <Text style={styles.benefitText}>Mobile Optimized</Text>
          </View>
        </View>

        <TouchableOpacity 
          style={styles.detailsButton}
          onPress={() => setShowDetails(!showDetails)}
        >
          <Text style={styles.detailsButtonText}>
            {showDetails ? 'Hide' : 'Show'} Provider Details
          </Text>
        </TouchableOpacity>

        {showDetails && (
          <View style={styles.detailsContainer}>
            <Text style={styles.detailsTitle}>Active Providers:</Text>
            {status.priority.map((provider: string, index: number) => (
              <View key={provider} style={styles.providerItem}>
                <Text style={styles.providerRank}>{index + 1}.</Text>
                <Text style={[
                  styles.providerName,
                  index === 0 && styles.activeProvider
                ]}>
                  {provider}
                </Text>
                {index === 0 && (
                  <View style={styles.activeBadge}>
                    <Text style={styles.activeBadgeText}>ACTIVE</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.warningHeader}>
        <StatusIcon type="warning" />
        <View style={styles.headerText}>
          <Text style={styles.warningTitle}>🆓 Get Started with Free Local AI</Text>
          <Text style={styles.warningSubtitle}>
            Install local AI models for unlimited, private mobile development
          </Text>
        </View>
      </View>

      <View style={styles.recommendationContainer}>
        <Text style={styles.recommendationTitle}>Recommended for {taskType}:</Text>
        <View style={styles.recommendationCard}>
          <Text style={styles.recommendationProvider}>{recommendation?.provider}</Text>
          <Text style={styles.recommendationReason}>{recommendation?.reason}</Text>
          <View style={styles.costBadge}>
            <Text style={styles.costBadgeText}>{recommendation?.cost?.toUpperCase()}</Text>
          </View>
        </View>
      </View>

      <View style={styles.setupContainer}>
        <Text style={styles.setupTitle}>📱 Mobile Setup (No Proxy Needed!)</Text>
        <Text style={styles.setupDescription}>
          Mobile apps can connect directly to localhost - no complex setup required!
        </Text>

        <View style={styles.optionsContainer}>
          {/* Ollama Option */}
          <View style={styles.optionCard}>
            <Text style={styles.optionTitle}>Option 1: Ollama (Recommended)</Text>
            <Text style={styles.optionDescription}>Easy installation, great model selection</Text>
            
            <View style={styles.commandContainer}>
              <Text style={styles.commandTitle}>Install & Setup:</Text>
              <Text style={styles.commandText}>curl -fsSL https://ollama.ai/install.sh | sh</Text>
              <Text style={styles.commandText}>ollama pull qwen2.5-coder:7b</Text>
              <Text style={styles.commandText}>ollama serve</Text>
            </View>

            <TouchableOpacity 
              style={styles.linkButton}
              onPress={() => openURL('https://ollama.ai')}
            >
              <Text style={styles.linkButtonText}>Visit Ollama.ai →</Text>
            </TouchableOpacity>
          </View>

          {/* LM Studio Option */}
          <View style={styles.optionCard}>
            <Text style={styles.optionTitle}>Option 2: LM Studio</Text>
            <Text style={styles.optionDescription}>GUI application with easy model management</Text>
            
            <View style={styles.stepsContainer}>
              <Text style={styles.stepText}>1. Download and install LM Studio</Text>
              <Text style={styles.stepText}>2. Search for "qwen2.5-coder" model</Text>
              <Text style={styles.stepText}>3. Download and start local server</Text>
              <Text style={styles.stepText}>4. Default port: 1234</Text>
            </View>

            <TouchableOpacity 
              style={styles.linkButton}
              onPress={() => openURL('https://lmstudio.ai')}
            >
              <Text style={styles.linkButtonText}>Visit LMStudio.ai →</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.actionContainer}>
          <TouchableOpacity
            style={[styles.testButton, isChecking && styles.testButtonDisabled]}
            onPress={handleTestConnection}
            disabled={isChecking}
          >
            {isChecking ? (
              <>
                <View style={styles.spinner} />
                <Text style={styles.testButtonText}>Testing...</Text>
              </>
            ) : (
              <>
                <Text style={styles.testButtonIcon}>🔍</Text>
                <Text style={styles.testButtonText}>Test Local AI Connection</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.refreshButton}
            onPress={updateStatus}
          >
            <Text style={styles.refreshButtonText}>🔄 Refresh Status</Text>
          </TouchableOpacity>
        </View>

        {showDetails && (
          <View style={styles.instructionsContainer}>
            <Text style={styles.instructionsTitle}>Detailed Instructions:</Text>
            <Text style={styles.instructionsText}>{instructions}</Text>
          </View>
        )}

        <View style={styles.advantageContainer}>
          <Text style={styles.advantageTitle}>📱 Mobile Advantage:</Text>
          <Text style={styles.advantageText}>
            Unlike web browsers, mobile apps can connect directly to localhost without HTTPS proxy setup. 
            This makes local AI much easier to use on mobile!
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f8fafc',
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 12,
    padding: 16,
  },
  loadingContainer: {
    padding: 20,
    alignItems: 'center',
  },
  loadingText: {
    color: '#6b7280',
    fontSize: 14,
  },
  successHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  warningHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  statusIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  statusIconText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
  headerText: {
    flex: 1,
  },
  successTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#059669',
    marginBottom: 4,
  },
  successSubtitle: {
    fontSize: 14,
    color: '#047857',
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#d97706',
    marginBottom: 4,
  },
  warningSubtitle: {
    fontSize: 14,
    color: '#92400e',
  },
  benefitsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  benefitItem: {
    alignItems: 'center',
    flex: 1,
  },
  benefitIcon: {
    fontSize: 20,
    marginBottom: 4,
  },
  benefitText: {
    fontSize: 12,
    color: '#374151',
    textAlign: 'center',
  },
  detailsButton: {
    alignSelf: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  detailsButtonText: {
    color: '#3b82f6',
    fontSize: 14,
    fontWeight: '500',
  },
  detailsContainer: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
  },
  detailsTitle: {
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  providerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  providerRank: {
    color: '#6b7280',
    width: 20,
  },
  providerName: {
    flex: 1,
    color: '#374151',
  },
  activeProvider: {
    fontWeight: '600',
    color: '#059669',
  },
  activeBadge: {
    backgroundColor: '#d1fae5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  activeBadgeText: {
    fontSize: 10,
    color: '#065f46',
    fontWeight: '600',
  },
  recommendationContainer: {
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  recommendationTitle: {
    fontWeight: '600',
    color: '#1e40af',
    marginBottom: 8,
  },
  recommendationCard: {
    backgroundColor: 'white',
    borderRadius: 6,
    padding: 8,
  },
  recommendationProvider: {
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  recommendationReason: {
    fontSize: 14,
    color: '#4b5563',
    marginBottom: 8,
  },
  costBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#dcfce7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  costBadgeText: {
    fontSize: 10,
    color: '#166534',
    fontWeight: '600',
  },
  setupContainer: {
    marginBottom: 16,
  },
  setupTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 8,
  },
  setupDescription: {
    fontSize: 14,
    color: '#4b5563',
    marginBottom: 16,
  },
  optionsContainer: {
    gap: 12,
    marginBottom: 16,
  },
  optionCard: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  optionTitle: {
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  optionDescription: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 12,
  },
  commandContainer: {
    backgroundColor: '#f3f4f6',
    borderRadius: 6,
    padding: 8,
    marginBottom: 8,
  },
  commandTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
  },
  commandText: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#1f2937',
    paddingVertical: 2,
  },
  stepsContainer: {
    marginBottom: 8,
  },
  stepText: {
    fontSize: 14,
    color: '#4b5563',
    paddingVertical: 2,
  },
  linkButton: {
    alignSelf: 'flex-start',
  },
  linkButtonText: {
    color: '#3b82f6',
    fontSize: 14,
    fontWeight: '500',
  },
  actionContainer: {
    gap: 8,
  },
  testButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  testButtonDisabled: {
    opacity: 0.5,
  },
  testButtonIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  testButtonText: {
    color: 'white',
    fontWeight: '600',
  },
  spinner: {
    width: 16,
    height: 16,
    borderWidth: 2,
    borderColor: 'white',
    borderTopColor: 'transparent',
    borderRadius: 8,
    marginRight: 8,
  },
  refreshButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  refreshButtonText: {
    color: '#6b7280',
    fontSize: 14,
  },
  instructionsContainer: {
    backgroundColor: '#f9fafb',
    borderRadius: 6,
    padding: 12,
    marginTop: 12,
  },
  instructionsTitle: {
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  instructionsText: {
    fontSize: 12,
    color: '#4b5563',
    lineHeight: 16,
  },
  advantageContainer: {
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    padding: 12,
    marginTop: 16,
  },
  advantageTitle: {
    fontWeight: '600',
    color: '#92400e',
    marginBottom: 4,
  },
  advantageText: {
    fontSize: 14,
    color: '#78350f',
    lineHeight: 18,
  },
});