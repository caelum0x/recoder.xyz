/**
 * Chat Screen with ID - Mobile
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import ChatScreen from '../../screens/ChatScreen';

export default function ChatPage() {
  const { id } = useLocalSearchParams();

  return (
    <View style={styles.container}>
      <ChatScreen
        chatId={id as string}
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