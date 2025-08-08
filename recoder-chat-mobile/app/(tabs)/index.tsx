import { View, Text, FlatList, TouchableOpacity, StyleSheet, useColorScheme } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useChatContext } from '../../contexts/ChatContext';
import { useAuthContext } from '../../contexts/AuthContext';

export default function ChatsScreen() {
  const colorScheme = useColorScheme();
  const { chats, createNewChat } = useChatContext();
  const { user } = useAuthContext();

  const handleNewChat = async () => {
    const newChat = await createNewChat();
    if (newChat) {
      router.push(`/chat/${newChat.id}`);
    }
  };

  const handleChatPress = (chatId: string) => {
    router.push(`/chat/${chatId}`);
  };

  const renderChatItem = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={[
        styles.chatItem,
        {
          backgroundColor: colorScheme === 'dark' ? '#2C2C2E' : '#F2F2F7',
          borderBottomColor: colorScheme === 'dark' ? '#38383A' : '#E5E5E7',
        },
      ]}
      onPress={() => handleChatPress(item.id)}
    >
      <View style={styles.chatIcon}>
        <Ionicons
          name="chatbubble-ellipses"
          size={24}
          color={colorScheme === 'dark' ? '#FFFFFF' : '#007AFF'}
        />
      </View>
      <View style={styles.chatContent}>
        <Text
          style={[
            styles.chatTitle,
            { color: colorScheme === 'dark' ? '#FFFFFF' : '#000000' },
          ]}
          numberOfLines={1}
        >
          {item.title || 'New Chat'}
        </Text>
        <Text
          style={[
            styles.chatPreview,
            { color: colorScheme === 'dark' ? '#8E8E93' : '#8E8E93' },
          ]}
          numberOfLines={1}
        >
          {item.lastMessage || 'Start a conversation...'}
        </Text>
        <Text
          style={[
            styles.chatTime,
            { color: colorScheme === 'dark' ? '#8E8E93' : '#8E8E93' },
          ]}
        >
          {new Date(item.updatedAt || Date.now()).toLocaleDateString()}
        </Text>
      </View>
      <Ionicons
        name="chevron-forward"
        size={16}
        color={colorScheme === 'dark' ? '#8E8E93' : '#C7C7CC'}
      />
    </TouchableOpacity>
  );

  const EmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons
        name="chatbubbles-outline"
        size={64}
        color={colorScheme === 'dark' ? '#48484A' : '#C7C7CC'}
      />
      <Text
        style={[
          styles.emptyTitle,
          { color: colorScheme === 'dark' ? '#FFFFFF' : '#000000' },
        ]}
      >
        Welcome to Recoder Chat
      </Text>
      <Text
        style={[
          styles.emptyDescription,
          { color: colorScheme === 'dark' ? '#8E8E93' : '#8E8E93' },
        ]}
      >
        Start your first AI conversation by tapping the + button
      </Text>
    </View>
  );

  if (!user) {
    return (
      <View style={[styles.container, { backgroundColor: colorScheme === 'dark' ? '#000000' : '#FFFFFF' }]}>
        <View style={styles.emptyState}>
          <Ionicons
            name="person-circle-outline"
            size={64}
            color={colorScheme === 'dark' ? '#48484A' : '#C7C7CC'}
          />
          <Text
            style={[
              styles.emptyTitle,
              { color: colorScheme === 'dark' ? '#FFFFFF' : '#000000' },
            ]}
          >
            Please sign in
          </Text>
          <TouchableOpacity
            style={styles.signInButton}
            onPress={() => router.push('/auth/login')}
          >
            <Text style={styles.signInButtonText}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colorScheme === 'dark' ? '#000000' : '#FFFFFF' }]}>
      <FlatList
        data={chats}
        renderItem={renderChatItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={chats.length === 0 ? styles.emptyContainer : styles.listContainer}
        ListEmptyComponent={EmptyState}
        showsVerticalScrollIndicator={false}
      />
      <TouchableOpacity style={styles.fabButton} onPress={handleNewChat}>
        <Ionicons name="add" size={24} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContainer: {
    flexGrow: 1,
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  chatIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  chatContent: {
    flex: 1,
    marginRight: 8,
  },
  chatTitle: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Inter-SemiBold',
    marginBottom: 4,
  },
  chatPreview: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    marginBottom: 2,
  },
  chatTime: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    fontFamily: 'Inter-SemiBold',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 20,
  },
  signInButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  signInButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Inter-SemiBold',
  },
  fabButton: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
});