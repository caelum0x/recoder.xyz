import { useMutation } from '@tanstack/react-query';
import {
  generateVoice,
  type GenerateVoiceRequest,
} from '@/lib/api/voice';
import { toast } from '@/lib/toast';

export function useGenerateVoice() {
  return useMutation({
    mutationFn: (request: GenerateVoiceRequest) => generateVoice(request),
    onError: (error: Error) => {
      toast.error(error.message || 'Voice generation failed');
    },
  });
}
