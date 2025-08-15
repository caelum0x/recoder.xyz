/**
 * Enhanced Chat Screen with ID - Mobile
 * Professional chat interface with real-time messaging
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import EnhancedChatScreen from '../../screens/EnhancedChatScreen';

export default function ChatPage() {
  const { id } = useLocalSearchParams();

  const handleClose = () => {
    router.back();
  };

  return (
    <View style={styles.container}>
      <EnhancedChatScreen
        chatId={id as string}
        onClose={handleClose}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});