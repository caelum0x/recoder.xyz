import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  recordCommand,
  getCommandHistory,
  getFrequentCommands,
  pinCommand,
  getCommandPins,
  unpinCommand,
  type CommandType,
  type RecordCommandPayload,
  type PinCommandPayload,
} from '@/lib/api/command-palette';

const commandPaletteKeys = {
  all: ['command-palette'] as const,
  history: (type?: CommandType) => [...commandPaletteKeys.all, 'history', type] as const,
  frequent: () => [...commandPaletteKeys.all, 'frequent'] as const,
  pins: () => [...commandPaletteKeys.all, 'pins'] as const,
};

export function useRecordCommand() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: RecordCommandPayload) => recordCommand(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commandPaletteKeys.all });
    },
  });
}

interface CommandPaletteQueryOptions {
  enabled?: boolean;
}

export function useCommandHistory(type?: CommandType, options?: CommandPaletteQueryOptions) {
  return useQuery({
    queryKey: commandPaletteKeys.history(type),
    queryFn: () => getCommandHistory(20, type),
    staleTime: 30_000,
    enabled: options?.enabled ?? true,
  });
}

export function useFrequentCommands() {
  return useQuery({
    queryKey: commandPaletteKeys.frequent(),
    queryFn: () => getFrequentCommands(10),
    staleTime: 60_000,
  });
}

export function usePinCommand() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: PinCommandPayload) => pinCommand(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commandPaletteKeys.pins() });
    },
  });
}

export function useCommandPins(options?: CommandPaletteQueryOptions) {
  return useQuery({
    queryKey: commandPaletteKeys.pins(),
    queryFn: () => getCommandPins(),
    staleTime: 60_000,
    enabled: options?.enabled ?? true,
  });
}

export function useUnpinCommand() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (pinId: string) => unpinCommand(pinId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commandPaletteKeys.pins() });
    },
  });
}
