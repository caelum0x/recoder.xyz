import * as React from 'react';
import { View, ScrollView, TextInput, Alert, Pressable } from 'react-native';
import { useColorScheme } from 'nativewind';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Text } from '@/components/ui/text';
import { Icon } from '@/components/ui/icon';
import { RecoderLoader } from '@/components/ui/recoder-loader';
import { Check, Trash2, Eye, EyeOff, Key } from 'lucide-react-native';
import {
  useProviderKeys,
  useSaveProviderKey,
  useDeleteProviderKey,
  type ProviderKey,
} from '@/hooks/useProviderKeys';
import { useLanguage } from '@/contexts';
import { log } from '@/lib/logger';

export default function ApiKeysScreen() {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const { data: keys, isLoading } = useProviderKeys();

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <RecoderLoader size="medium" />
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
    >
      <View className="px-6 pt-4 gap-2">
        <Text className="text-sm text-foreground/60 mb-4">
          Add your own API keys to use AI providers directly. Keys are encrypted and stored securely.
        </Text>

        {keys?.map((providerKey) => (
          <ProviderKeyRow key={providerKey.provider} providerKey={providerKey} />
        ))}
      </View>
    </ScrollView>
  );
}

function ProviderKeyRow({ providerKey }: { providerKey: ProviderKey }) {
  const { colorScheme } = useColorScheme();
  const [isEditing, setIsEditing] = React.useState(false);
  const [keyValue, setKeyValue] = React.useState('');
  const [showKey, setShowKey] = React.useState(false);
  const saveKey = useSaveProviderKey();
  const deleteKey = useDeleteProviderKey();

  const handleSave = React.useCallback(async () => {
    if (!keyValue.trim()) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    log.log(`💾 Saving key for ${providerKey.provider}`);

    saveKey.mutate(
      { provider: providerKey.provider, key: keyValue.trim() },
      {
        onSuccess: () => {
          setIsEditing(false);
          setKeyValue('');
          setShowKey(false);
        },
      }
    );
  }, [keyValue, providerKey.provider, saveKey]);

  const handleDelete = React.useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    Alert.alert(
      'Remove Key',
      `Remove your ${providerKey.label} API key?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            log.log(`🗑️ Deleting key for ${providerKey.provider}`);
            deleteKey.mutate(providerKey.provider);
          },
        },
      ]
    );
  }, [providerKey, deleteKey]);

  const isDark = colorScheme === 'dark';
  const inputBg = isDark ? '#1a1a1e' : '#ffffff';
  const inputBorder = isDark ? '#2a2a2e' : '#e0e0e0';

  return (
    <View className="rounded-xl border border-border/50 bg-card p-4 mb-3">
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-row items-center gap-2">
          <Icon as={Key} size={16} className="text-primary" strokeWidth={2} />
          <Text className="font-roobert-medium text-base text-foreground">
            {providerKey.label}
          </Text>
        </View>

        <View className="flex-row items-center gap-2">
          {providerKey.hasKey && !isEditing && (
            <>
              <View className="rounded-full bg-green-500/20 px-2 py-0.5">
                <Text className="text-xs text-green-500 font-roobert-medium">Active</Text>
              </View>
              <Pressable onPress={handleDelete} hitSlop={8}>
                <Icon as={Trash2} size={16} className="text-destructive/60" strokeWidth={2} />
              </Pressable>
            </>
          )}
        </View>
      </View>

      {providerKey.hasKey && !isEditing && (
        <Text className="text-sm text-foreground/50 font-mono">
          {providerKey.maskedKey}
        </Text>
      )}

      {isEditing ? (
        <View className="gap-3 mt-1">
          <View
            className="flex-row items-center rounded-lg border px-3"
            style={{ borderColor: inputBorder, backgroundColor: inputBg }}
          >
            <TextInput
              value={keyValue}
              onChangeText={setKeyValue}
              placeholder={`Enter ${providerKey.label} API key`}
              placeholderTextColor={isDark ? '#666' : '#999'}
              secureTextEntry={!showKey}
              autoCapitalize="none"
              autoCorrect={false}
              className="flex-1 py-3 text-foreground text-sm"
              style={{ color: isDark ? '#fff' : '#000' }}
            />
            <Pressable onPress={() => setShowKey(!showKey)} hitSlop={8}>
              <Icon
                as={showKey ? EyeOff : Eye}
                size={18}
                className="text-foreground/40"
                strokeWidth={2}
              />
            </Pressable>
          </View>

          <View className="flex-row gap-2">
            <Pressable
              onPress={() => {
                setIsEditing(false);
                setKeyValue('');
                setShowKey(false);
              }}
              className="flex-1 rounded-lg border border-border py-2.5 items-center"
            >
              <Text className="text-sm text-foreground/60 font-roobert-medium">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={!keyValue.trim() || saveKey.isPending}
              className="flex-1 rounded-lg bg-primary py-2.5 items-center flex-row justify-center gap-1.5"
              style={{ opacity: !keyValue.trim() || saveKey.isPending ? 0.5 : 1 }}
            >
              {saveKey.isPending ? (
                <RecoderLoader size="small" customSize={16} />
              ) : (
                <Icon as={Check} size={16} className="text-primary-foreground" strokeWidth={2} />
              )}
              <Text className="text-sm text-primary-foreground font-roobert-medium">Save</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setIsEditing(true);
          }}
          className="mt-2"
        >
          <Text className="text-sm text-primary font-roobert-medium">
            {providerKey.hasKey ? 'Update Key' : 'Add Key'}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
