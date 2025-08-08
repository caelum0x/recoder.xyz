/**
 * New Chat Screen - Mobile
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import ChatScreen from '../../screens/ChatScreen';

export default function NewChatPage() {
  const params = useLocalSearchParams();
  const { agent, agentName, specialties } = params;

  return (
    <View style={styles.container}>
      <ChatScreen
        selectedModel={agent as string}
        initialMessages={[]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});