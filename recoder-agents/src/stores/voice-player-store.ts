import { create } from 'zustand';
import { generateVoice } from '@/lib/api/voice';

type PlayerState = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error';

interface VoicePlayerState {
  // State
  state: PlayerState;
  text: string | null;
  audioUrls: string[];
  currentIndex: number;
  error: string | null;
  audioElement: HTMLAudioElement | null;

  // Actions
  playText: (text: string) => Promise<void>;
  pause: () => void;
  resume: () => void;
  replay: () => void;
  togglePlayPause: () => void;
  close: () => void;
  _cleanup: () => void;
  _playIndex: (index: number) => void;
}

export const useVoicePlayerStore = create<VoicePlayerState>((set, get) => ({
  state: 'idle',
  text: null,
  audioUrls: [],
  currentIndex: 0,
  error: null,
  audioElement: null,

  _cleanup: () => {
    const { audioElement } = get();
    if (audioElement) {
      audioElement.pause();
      audioElement.src = '';
      audioElement.onended = null;
      audioElement.onerror = null;
    }
    set({ audioElement: null });
  },

  _playIndex: (index: number) => {
    const { audioUrls, _cleanup } = get();

    if (index >= audioUrls.length) {
      // All chunks played
      set({ state: 'ended', currentIndex: 0 });
      return;
    }

    _cleanup();

    const url = audioUrls[index];

    const audio = new Audio(url);

    audio.onended = () => {
      const nextIndex = index + 1;
      get()._playIndex(nextIndex);
    };

    audio.onerror = (e) => {
      console.error('[VoicePlayer] Error playing chunk:', e);
      set({ state: 'error', error: 'Failed to play audio' });
    };

    audio.play().then(() => {
      set({ audioElement: audio, state: 'playing', currentIndex: index });
    }).catch((e) => {
      console.error('[VoicePlayer] Error starting playback:', e);
      set({ state: 'error', error: e?.message || 'Failed to play audio' });
    });
  },

  playText: async (text: string) => {
    const { _cleanup } = get();

    // Cleanup any existing playback
    _cleanup();

    set({ state: 'loading', text, error: null, audioUrls: [], currentIndex: 0 });

    try {
      // Clean text - remove problematic characters
      const cleanedText = text
        .replace(/[\r\n]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      const data = await generateVoice({
        text: cleanedText,
      });

      set({ audioUrls: data.audio_urls });
      // Start playing first chunk
      get()._playIndex(0);

    } catch (error: any) {
      const errorMessage = error?.message || 'Failed to generate voice';
      console.error('[VoicePlayer] Error:', errorMessage, error);
      set({
        state: 'error',
        error: errorMessage
      });
    }
  },

  pause: () => {
    const { audioElement, state } = get();
    if (audioElement && state === 'playing') {
      audioElement.pause();
      set({ state: 'paused' });
    }
  },

  resume: () => {
    const { audioElement, state } = get();
    if (audioElement && state === 'paused') {
      audioElement.play();
      set({ state: 'playing' });
    }
  },

  replay: () => {
    const { state, audioUrls, _playIndex } = get();
    if (state === 'ended' && audioUrls.length > 0) {
      _playIndex(0);
    }
  },

  togglePlayPause: () => {
    const { state, pause, resume, replay } = get();
    if (state === 'playing') {
      pause();
    } else if (state === 'ended') {
      replay();
    } else if (state === 'paused') {
      resume();
    }
  },

  close: () => {
    const { _cleanup } = get();
    _cleanup();
    set({
      state: 'idle',
      text: null,
      audioUrls: [],
      currentIndex: 0,
      error: null
    });
  },
}));
