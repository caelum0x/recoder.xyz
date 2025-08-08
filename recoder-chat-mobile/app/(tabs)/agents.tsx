import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  ScrollView, 
  TouchableOpacity,
  StyleSheet, 
  useColorScheme,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { getProviderStatus } from '../../lib/ai/providers';

interface Agent {
  id: string;
  name: string;
  icon: string;
  description: string;
  specialties: string[];
  color: string;
  available: boolean;
}

export default function AgentsScreen() {
  const colorScheme = useColorScheme();
  const [aiStatus, setAIStatus] = useState<any>(null);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  useEffect(() => {
    loadAIStatus();
  }, []);

  const loadAIStatus = async () => {
    try {
      const status = await getProviderStatus();
      setAIStatus(status);
    } catch (error) {
      console.error('Failed to load AI status:', error);
    }
  };

  const agents: Agent[] = [
    {
      id: 'blockchain',
      name: 'Blockchain Agent',
      icon: '🔗',
      description: 'Specialized in blockchain development, smart contracts, and DeFi protocols',
      specialties: ['Solana', 'Ethereum', 'Smart Contracts', 'DeFi', 'NFTs', 'Web3'],
      color: '#8B5CF6',
      available: true
    },
    {
      id: 'web',
      name: 'Web Agent', 
      icon: '🌐',
      description: 'Expert in modern web development with React, Next.js, and full-stack solutions',
      specialties: ['React', 'Next.js', 'TypeScript', 'Node.js', 'APIs', 'Responsive Design'],
      color: '#3B82F6',
      available: true
    },
    {
      id: 'mobile',
      name: 'Mobile Agent',
      icon: '📱', 
      description: 'Mobile development specialist for iOS, Android, and cross-platform apps',
      specialties: ['React Native', 'Flutter', 'iOS', 'Android', 'Expo', 'Mobile UI/UX'],
      color: '#10B981',
      available: true
    },
    {
      id: 'security',
      name: 'Security Agent',
      icon: '🔒',
      description: 'Security expert for vulnerability assessment and secure coding practices',
      specialties: ['Security Audits', 'Penetration Testing', 'Encryption', 'Auth', 'Compliance'],
      color: '#EF4444',
      available: true
    },
    {
      id: 'devops',
      name: 'DevOps Agent',
      icon: '⚙️',
      description: 'DevOps and infrastructure specialist for CI/CD and cloud deployments',
      specialties: ['Docker', 'Kubernetes', 'AWS', 'CI/CD', 'Monitoring', 'Infrastructure'],
      color: '#F59E0B',
      available: true
    },
    {
      id: 'ai',
      name: 'AI Agent',
      icon: '🤖',
      description: 'AI and machine learning expert for model development and integration',
      specialties: ['Machine Learning', 'Deep Learning', 'RAG', 'Model Training', 'MLOps'],
      color: '#EC4899',
      available: true
    }
  ];

  const handleAgentPress = (agent: Agent) => {
    const hasAI = aiStatus?.local?.ollama || aiStatus?.local?.lmstudio || 
                  aiStatus?.cloud?.anthropic || aiStatus?.cloud?.groq || 
                  aiStatus?.cloud?.openai || aiStatus?.cloud?.xai;

    if (!hasAI) {
      Alert.alert(
        '🤖 No AI Available',
        'You need to set up local AI (Ollama/LM Studio) or add cloud API keys to use AI agents.\n\nWould you like to see setup instructions?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Setup AI', onPress: () => router.push('/profile') }
        ]
      );
      return;
    }

    setSelectedAgent(agent.id);
    
    // Navigate to chat with agent context
    router.push({
      pathname: '/chat/new',
      params: { 
        agent: agent.id,
        agentName: agent.name,
        specialties: agent.specialties.join(',')
      }
    });
  };

  const isDark = colorScheme === 'dark';
  const backgroundColor = isDark ? '#000000' : '#FFFFFF';
  const cardBackground = isDark ? '#1C1C1E' : '#FFFFFF';
  const textColor = isDark ? '#FFFFFF' : '#000000';
  const secondaryTextColor = isDark ? '#8E8E93' : '#8E8E93';

  return (
    <ScrollView 
      style={[styles.container, { backgroundColor }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: textColor }]}>AI Agents</Text>
        <Text style={[styles.subtitle, { color: secondaryTextColor }]}>
          Specialized AI assistants for different development tasks
        </Text>
      </View>

      {/* AI Status Banner */}
      {aiStatus && (
        <View style={styles.statusBanner}>
          <View style={[
            styles.statusCard,
            { 
              backgroundColor: (aiStatus.local?.ollama || aiStatus.local?.lmstudio) 
                ? '#D1FAE5' : '#FEF3C7',
              borderColor: (aiStatus.local?.ollama || aiStatus.local?.lmstudio)
                ? '#10B981' : '#F59E0B'
            }
          ]}>
            <Text style={[
              styles.statusTitle,
              { 
                color: (aiStatus.local?.ollama || aiStatus.local?.lmstudio)
                  ? '#065F46' : '#92400E'
              }
            ]}>
              {(aiStatus.local?.ollama || aiStatus.local?.lmstudio) 
                ? '🎉 Local AI Active - Unlimited Usage!'
                : '⚠️ Cloud AI Only - Add Local AI for Free Usage'
              }
            </Text>
            <Text style={[
              styles.statusText,
              { 
                color: (aiStatus.local?.ollama || aiStatus.local?.lmstudio)
                  ? '#047857' : '#78350F'
              }
            ]}>
              Active: {aiStatus.priority?.[0] || 'No providers'}
              {aiStatus.priority?.length > 1 && ` (+${aiStatus.priority.length - 1} more)`}
            </Text>
          </View>
        </View>
      )}

      {/* Agents Grid */}
      <View style={styles.agentsContainer}>
        {agents.map((agent) => (
          <TouchableOpacity
            key={agent.id}
            style={[
              styles.agentCard,
              { 
                backgroundColor: cardBackground,
                borderColor: selectedAgent === agent.id ? agent.color : 'transparent',
                borderWidth: selectedAgent === agent.id ? 2 : 0
              }
            ]}
            onPress={() => handleAgentPress(agent)}
            activeOpacity={0.7}
          >
            <View style={styles.agentHeader}>
              <View style={[styles.agentIcon, { backgroundColor: agent.color + '20' }]}>
                <Text style={styles.agentEmoji}>{agent.icon}</Text>
              </View>
              <View style={styles.agentBadge}>
                <Ionicons 
                  name={agent.available ? "checkmark-circle" : "time-outline"} 
                  size={16} 
                  color={agent.available ? "#10B981" : "#F59E0B"} 
                />
              </View>
            </View>

            <Text style={[styles.agentName, { color: textColor }]}>
              {agent.name}
            </Text>

            <Text style={[styles.agentDescription, { color: secondaryTextColor }]}>
              {agent.description}
            </Text>

            <View style={styles.specialtiesContainer}>
              {agent.specialties.slice(0, 3).map((specialty, index) => (
                <View 
                  key={index}
                  style={[styles.specialtyTag, { backgroundColor: agent.color + '15' }]}
                >
                  <Text style={[styles.specialtyText, { color: agent.color }]}>
                    {specialty}
                  </Text>
                </View>
              ))}
              {agent.specialties.length > 3 && (
                <View style={[styles.specialtyTag, { backgroundColor: '#F3F4F6' }]}>
                  <Text style={[styles.specialtyText, { color: '#6B7280' }]}>
                    +{agent.specialties.length - 3}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.agentActions}>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: agent.color }]}
                onPress={() => handleAgentPress(agent)}
              >
                <Ionicons name="chatbubble" size={16} color="#FFFFFF" />
                <Text style={styles.actionButtonText}>Chat</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.actionButtonSecondary}>
                <Ionicons name="information-circle-outline" size={16} color={agent.color} />
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* Quick Actions */}
      <View style={[styles.quickActions, { backgroundColor: cardBackground }]}>
        <Text style={[styles.quickActionsTitle, { color: textColor }]}>
          🚀 Quick Actions
        </Text>
        
        <TouchableOpacity 
          style={styles.quickActionItem}
          onPress={() => router.push('/chat/new')}
        >
          <View style={styles.quickActionLeft}>
            <Ionicons name="add-circle-outline" size={24} color="#007AFF" />
            <Text style={[styles.quickActionText, { color: textColor }]}>
              Start New Chat
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={secondaryTextColor} />
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.quickActionItem}
          onPress={() => router.push('/profile')}
        >
          <View style={styles.quickActionLeft}>
            <Ionicons name="settings-outline" size={24} color="#007AFF" />
            <Text style={[styles.quickActionText, { color: textColor }]}>
              Configure AI Providers
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={secondaryTextColor} />
        </TouchableOpacity>
      </View>

      {/* Bottom Padding */}
      <View style={styles.bottomPadding} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    fontFamily: 'Inter-Bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    lineHeight: 22,
  },
  statusBanner: {
    marginHorizontal: 16,
    marginBottom: 20,
  },
  statusCard: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Inter-SemiBold',
    marginBottom: 4,
  },
  statusText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
  agentsContainer: {
    paddingHorizontal: 16,
    gap: 16,
  },
  agentCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  agentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  agentIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  agentEmoji: {
    fontSize: 28,
  },
  agentBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
  },
  agentName: {
    fontSize: 20,
    fontWeight: 'bold',
    fontFamily: 'Inter-Bold',
    marginBottom: 8,
  },
  agentDescription: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    lineHeight: 20,
    marginBottom: 16,
  },
  specialtiesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  specialtyTag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  specialtyText: {
    fontSize: 12,
    fontWeight: '500',
    fontFamily: 'Inter-Medium',
  },
  agentActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    gap: 8,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Inter-SemiBold',
  },
  actionButtonSecondary: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  quickActions: {
    marginHorizontal: 16,
    marginTop: 24,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  quickActionsTitle: {
    fontSize: 18,
    fontWeight: '600',
    fontFamily: 'Inter-SemiBold',
    marginBottom: 16,
  },
  quickActionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  quickActionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  quickActionText: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    marginLeft: 12,
  },
  bottomPadding: {
    height: 24,
  },
});