/**
 * AI Agents Screen - All Web Platform agents available on mobile
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  TextInput,
  Image,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { dualPlatformClient, AIAgent } from '../services/DualPlatformClient';

const { width } = Dimensions.get('window');

interface AgentCardProps {
  agent: AIAgent;
  onPress: () => void;
}

const AgentCard: React.FC<AgentCardProps> = ({ agent, onPress }) => {
  const getAgentIcon = (agentId: string): string => {
    const icons: Record<string, string> = {
      'blockchain': '⛓️',
      'web': '🌐', 
      'mobile': '📱',
      'security': '🔒',
      'devops': '🚀',
      'ai': '🤖',
      'backend': '⚙️',
      'frontend': '🎨',
      'database': '🗄️',
      'api': '🔌',
    };
    return icons[agentId] || '🤖';
  };

  const getAgentColor = (agentId: string): string => {
    const colors: Record<string, string> = {
      'blockchain': '#3B82F6',
      'web': '#10B981',
      'mobile': '#8B5CF6',
      'security': '#EF4444',
      'devops': '#F59E0B',
      'ai': '#6366F1',
      'backend': '#6B7280',
      'frontend': '#EC4899',
      'database': '#14B8A6',
      'api': '#F97316',
    };
    return colors[agentId] || '#6B7280';
  };

  return (
    <TouchableOpacity 
      style={[styles.agentCard, { borderLeftColor: getAgentColor(agent.id) }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.agentHeader}>
        <Text style={styles.agentIcon}>{getAgentIcon(agent.id)}</Text>
        <View style={styles.agentInfo}>
          <Text style={styles.agentName}>{agent.displayName}</Text>
          <Text style={styles.agentDescription} numberOfLines={2}>
            {agent.description}
          </Text>
        </View>
        <View style={[styles.statusBadge, { 
          backgroundColor: agent.available ? '#10B981' : '#6B7280' 
        }]}>
          <Text style={styles.statusText}>
            {agent.available ? '✓' : '○'}
          </Text>
        </View>
      </View>
      
      <View style={styles.specialtiesContainer}>
        {agent.specialties.slice(0, 3).map((specialty, index) => (
          <View key={index} style={styles.specialtyTag}>
            <Text style={styles.specialtyText}>{specialty}</Text>
          </View>
        ))}
        {agent.specialties.length > 3 && (
          <Text style={styles.moreSpecialties}>+{agent.specialties.length - 3}</Text>
        )}
      </View>
    </TouchableOpacity>
  );
};

const AgentsScreen: React.FC = () => {
  const [agents, setAgents] = useState<AIAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<AIAgent | null>(null);
  const [chatModalVisible, setChatModalVisible] = useState(false);
  const [message, setMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<Array<{
    role: 'user' | 'assistant';
    content: string;
  }>>([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    loadAgents();
  }, []);

  const loadAgents = async () => {
    try {
      setLoading(true);
      const response = await dualPlatformClient.getAvailableAgents();
      
      if (response.success && response.data) {
        // Add all the AI agents with their capabilities
        const allAgents: AIAgent[] = [
          {
            id: 'blockchain',
            name: 'blockchain-agent',
            displayName: 'Blockchain Agent',
            description: 'Create smart contracts, DeFi protocols, and blockchain applications for Solana and Ethereum.',
            icon: '⛓️',
            specialties: ['Smart Contracts', 'DeFi', 'NFTs', 'DAOs', 'Token Creation', 'Web3 Integration'],
            available: true,
            platform: 'web'
          },
          {
            id: 'web',
            name: 'web-agent',
            displayName: 'Web Development Agent',
            description: 'Build full-stack web applications with React, Next.js, Vue, and modern frameworks.',
            icon: '🌐',
            specialties: ['React', 'Next.js', 'Vue', 'API Development', 'Database Design', 'UI/UX'],
            available: true,
            platform: 'web'
          },
          {
            id: 'mobile',
            name: 'mobile-agent', 
            displayName: 'Mobile Development Agent',
            description: 'Create native mobile apps with React Native, Flutter, and platform-specific features.',
            icon: '📱',
            specialties: ['React Native', 'Flutter', 'iOS Development', 'Android Development', 'App Store Optimization'],
            available: true,
            platform: 'web'
          },
          {
            id: 'security',
            name: 'security-agent',
            displayName: 'Security Agent',
            description: 'Perform security audits, vulnerability scanning, and implement security best practices.',
            icon: '🔒',
            specialties: ['Security Audits', 'Penetration Testing', 'OWASP', 'Encryption', 'Access Control'],
            available: true,
            platform: 'web'
          },
          {
            id: 'devops',
            name: 'devops-agent',
            displayName: 'DevOps Agent',
            description: 'Set up CI/CD pipelines, containerization, cloud deployments, and infrastructure automation.',
            icon: '🚀',
            specialties: ['Docker', 'Kubernetes', 'CI/CD', 'AWS/Azure/GCP', 'Monitoring', 'Infrastructure'],
            available: true,
            platform: 'web'
          },
          {
            id: 'ai',
            name: 'ai-agent',
            displayName: 'AI Integration Agent',
            description: 'Integrate AI/ML models, build AI pipelines, and implement intelligent features.',
            icon: '🤖',
            specialties: ['Machine Learning', 'AI APIs', 'Data Processing', 'Model Training', 'Natural Language'],
            available: true,
            platform: 'web'
          }
        ];
        
        setAgents(allAgents);
      } else {
        Alert.alert('Error', 'Failed to load AI agents');
      }
    } catch (error) {
      console.error('Error loading agents:', error);
      Alert.alert('Error', 'Failed to connect to AI agents');
    } finally {
      setLoading(false);
    }
  };

  const handleAgentPress = (agent: AIAgent) => {
    setSelectedAgent(agent);
    setChatModalVisible(true);
    setChatHistory([]);
  };

  const sendMessageToAgent = async () => {
    if (!message.trim() || !selectedAgent || sending) return;

    const userMessage = message.trim();
    setMessage('');
    setSending(true);

    // Add user message to chat
    setChatHistory(prev => [...prev, { role: 'user', content: userMessage }]);

    try {
      const response = await dualPlatformClient.chatWithAgent(
        selectedAgent.id, 
        userMessage,
        { agentType: selectedAgent.name }
      );

      if (response.success && response.data) {
        setChatHistory(prev => [...prev, { 
          role: 'assistant', 
          content: response.data.content 
        }]);
      } else {
        throw new Error(response.error || 'Failed to get response');
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setChatHistory(prev => [...prev, { 
        role: 'assistant', 
        content: 'Sorry, I encountered an error. Please try again.' 
      }]);
    } finally {
      setSending(false);
    }
  };

  const getQuickActions = (agent: AIAgent): string[] => {
    const actions: Record<string, string[]> = {
      'blockchain': [
        'Create ERC-20 token',
        'Build DeFi protocol',
        'Generate NFT contract',
        'Setup DAO governance'
      ],
      'web': [
        'Create React app',
        'Build API endpoints',
        'Setup authentication',
        'Design database schema'
      ],
      'mobile': [
        'Create React Native app',
        'Add native features',
        'Setup app store',
        'Implement push notifications'
      ],
      'security': [
        'Security audit',
        'Penetration testing',
        'Vulnerability scan',
        'Security best practices'
      ],
      'devops': [
        'Setup CI/CD',
        'Create Docker container',
        'Deploy to cloud',
        'Setup monitoring'
      ],
      'ai': [
        'Integrate AI model',
        'Build ML pipeline',
        'Create chatbot',
        'Process data'
      ]
    };
    
    return actions[agent.id] || [];
  };

  const handleQuickAction = (action: string) => {
    setMessage(action);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading AI Agents...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>AI Agents</Text>
        <Text style={styles.headerSubtitle}>
          Choose a specialized AI agent for your development needs
        </Text>
      </View>

      <ScrollView 
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        {agents.map((agent) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            onPress={() => handleAgentPress(agent)}
          />
        ))}
      </ScrollView>

      {/* Agent Chat Modal */}
      <Modal
        visible={chatModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setChatModalVisible(false)}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
            
            {selectedAgent && (
              <View style={styles.agentModalInfo}>
                <Text style={styles.agentModalIcon}>
                  {selectedAgent.icon}
                </Text>
                <View>
                  <Text style={styles.agentModalName}>
                    {selectedAgent.displayName}
                  </Text>
                  <Text style={styles.agentModalDescription}>
                    {selectedAgent.description}
                  </Text>
                </View>
              </View>
            )}
          </View>

          {/* Quick Actions */}
          {selectedAgent && (
            <View style={styles.quickActionsContainer}>
              <Text style={styles.quickActionsTitle}>Quick Actions:</Text>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                style={styles.quickActionsScroll}
              >
                {getQuickActions(selectedAgent).map((action, index) => (
                  <TouchableOpacity
                    key={index}
                    style={styles.quickActionButton}
                    onPress={() => handleQuickAction(action)}
                  >
                    <Text style={styles.quickActionText}>{action}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Chat History */}
          <ScrollView style={styles.chatHistory}>
            {chatHistory.map((msg, index) => (
              <View
                key={index}
                style={[
                  styles.messageContainer,
                  msg.role === 'user' ? styles.userMessage : styles.assistantMessage
                ]}
              >
                <Text style={[
                  styles.messageText,
                  msg.role === 'user' ? styles.userMessageText : styles.assistantMessageText
                ]}>
                  {msg.content}
                </Text>
              </View>
            ))}
          </ScrollView>

          {/* Message Input */}
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.messageInput}
              value={message}
              onChangeText={setMessage}
              placeholder="Ask your agent anything..."
              multiline
              maxLength={1000}
            />
            <TouchableOpacity
              style={[styles.sendButton, { 
                opacity: (!message.trim() || sending) ? 0.5 : 1 
              }]}
              onPress={sendMessageToAgent}
              disabled={!message.trim() || sending}
            >
              <Text style={styles.sendButtonText}>
                {sending ? '⏳' : '→'}
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#6b7280',
  },
  header: {
    padding: 20,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#6b7280',
  },
  scrollView: {
    flex: 1,
    padding: 16,
  },
  agentCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  agentHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  agentIcon: {
    fontSize: 32,
    marginRight: 16,
  },
  agentInfo: {
    flex: 1,
  },
  agentName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 4,
  },
  agentDescription: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
  },
  statusBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusText: {
    fontSize: 12,
    color: '#ffffff',
    fontWeight: 'bold',
  },
  specialtiesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  specialtyTag: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 8,
    marginBottom: 4,
  },
  specialtyText: {
    fontSize: 12,
    color: '#374151',
  },
  moreSpecialties: {
    fontSize: 12,
    color: '#9ca3af',
    fontStyle: 'italic',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  closeButtonText: {
    fontSize: 16,
    color: '#6b7280',
  },
  agentModalInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  agentModalIcon: {
    fontSize: 32,
    marginRight: 12,
  },
  agentModalName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  agentModalDescription: {
    fontSize: 14,
    color: '#6b7280',
  },
  quickActionsContainer: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  quickActionsTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#374151',
    marginBottom: 8,
  },
  quickActionsScroll: {
    marginHorizontal: -4,
  },
  quickActionButton: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginHorizontal: 4,
  },
  quickActionText: {
    fontSize: 12,
    color: '#3b82f6',
    fontWeight: '500',
  },
  chatHistory: {
    flex: 1,
    padding: 16,
  },
  messageContainer: {
    marginBottom: 12,
    maxWidth: '80%',
  },
  userMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#3b82f6',
    borderRadius: 18,
    padding: 12,
  },
  assistantMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#f3f4f6',
    borderRadius: 18,
    padding: 12,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  userMessageText: {
    color: '#ffffff',
  },
  assistantMessageText: {
    color: '#1f2937',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    alignItems: 'flex-end',
  },
  messageInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginRight: 12,
    maxHeight: 100,
    fontSize: 16,
  },
  sendButton: {
    width: 44,
    height: 44,
    backgroundColor: '#3b82f6',
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonText: {
    fontSize: 20,
    color: '#ffffff',
  },
});

export default AgentsScreen;