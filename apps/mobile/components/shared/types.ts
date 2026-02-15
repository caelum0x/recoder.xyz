import type { LucideIcon } from 'lucide-react-native';

export interface QuickAction {
  id: string;
  label: string;
  icon: LucideIcon;
  onPress?: () => void;
  isSelected?: boolean;
}
