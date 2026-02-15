import { useState } from 'react';
import { Keyboard } from 'react-native';
import { useRouter } from 'expo-router';
import { useAgent } from '@/contexts/AgentContext';
import { log } from '@/lib/logger';

/**
 * Custom hook for managing agent selection and operations
 * Now uses AgentContext for state management
 */
export function useAgentManager() {
  const router = useRouter();
  const { 
    selectedAgentId, 
    agents, 
    isLoading, 
    getCurrentAgent, 
    selectAgent 
  } = useAgent();
  
  const [isDrawerVisible, setIsDrawerVisible] = useState(false);

  const openDrawer = () => {
    log.log('🔽 [useAgentManager] Agent Selector Pressed');
    log.log('📊 [useAgentManager] Current Agent:', { 
      id: selectedAgentId, 
      name: getCurrentAgent()?.name 
    });
    log.log('⏰ [useAgentManager] Timestamp:', new Date().toISOString());
    log.log('👁️ [useAgentManager] Current state:', isDrawerVisible);
    
    // If already visible, force a re-render by toggling
    if (isDrawerVisible) {
      log.log('⚡ [useAgentManager] Drawer already visible - force toggling');
      setIsDrawerVisible(false);
      setTimeout(() => {
        setIsDrawerVisible(true);
      }, 50);
      return;
    }
    
    log.log('👁️ [useAgentManager] Setting isDrawerVisible to TRUE');
    
    // Dismiss keyboard first for better UX
    Keyboard.dismiss();
    
    // Small delay to ensure keyboard is dismissed before opening drawer
    setTimeout(() => {
      setIsDrawerVisible(true);
    }, 150);
  };

  const closeDrawer = () => {
    log.log('🔽 [useAgentManager] Closing drawer');
    setIsDrawerVisible(false);
  };

  const selectAgentHandler = async (agentId: string) => {
    log.log('✅ Agent Changed:', {
      from: { id: selectedAgentId, name: getCurrentAgent()?.name },
      to: { id: agentId, name: agents.find(a => a.agent_id === agentId)?.name },
      timestamp: new Date().toISOString()
    });
    await selectAgent(agentId);
  };

  const openAgentSettings = () => {
    log.log('⚙️ Agent Settings Opened');
    log.log('⏰ Timestamp:', new Date().toISOString());
    if (selectedAgentId) {
      router.push({
        pathname: '/worker-config',
        params: { workerId: selectedAgentId },
      });
      return;
    }
    router.push('/(settings)');
  };

  return {
    selectedAgent: getCurrentAgent(),
    isDrawerVisible,
    agents,
    isLoading,
    openDrawer,
    closeDrawer,
    selectAgent: selectAgentHandler,
    openAgentSettings
  };
}
