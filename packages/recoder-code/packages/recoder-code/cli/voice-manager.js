const fs = require('fs');
const path = require('path');
// Handle chalk properly
const chalkModule = require('chalk');
const chalk = chalkModule.default || chalkModule;
const record = require('node-record-lpcm16');
const say = require('say');

class VoiceManager {
  constructor() {
    this.isRecording = false;
    this.recordingStream = null;
    this.speechToTextEnabled = false;
    this.textToSpeechEnabled = false;
    this.voiceEngine = 'system'; // 'system', 'google-cloud', 'web-speech'
    this.speechRecognitionEngine = 'web-speech'; // 'web-speech', 'google-cloud'
    this.ttsVoice = null; // System voice name
    this.language = 'en-US';
    this.tempAudioDir = path.join(process.cwd(), 'temp-audio');
    
    // Ensure temp audio directory exists
    if (!fs.existsSync(this.tempAudioDir)) {
      fs.mkdirSync(this.tempAudioDir, { recursive: true });
    }
    
    this.initializeVoiceCapabilities();
  }

  async initializeVoiceCapabilities() {
    try {
      // Check if system TTS is available
      if (process.platform === 'darwin') {
        this.textToSpeechEnabled = true;
        console.log(chalk.green('✅ macOS text-to-speech enabled'));
      } else if (process.platform === 'win32') {
        this.textToSpeechEnabled = true;
        console.log(chalk.green('✅ Windows text-to-speech enabled'));
      } else if (process.platform === 'linux') {
        // Check if espeak or festival is available
        try {
          require('child_process').execSync('which espeak', { stdio: 'ignore' });
          this.textToSpeechEnabled = true;
          console.log(chalk.green('✅ Linux text-to-speech enabled (espeak)'));
        } catch (e) {
          console.log(chalk.yellow('⚠️  Text-to-speech not available on this Linux system'));
        }
      }
      
      // Check for speech recognition capabilities
      this.speechToTextEnabled = this.checkSpeechRecognitionAvailability();
      
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Voice capabilities limited: ${error.message}`));
    }
  }

  checkSpeechRecognitionAvailability() {
    // For now, we'll use a simple file-based approach
    // In production, you'd want to check for actual STT services
    console.log(chalk.blue('🎤 Speech-to-text: Manual recording mode available'));
    return true;
  }

  async startRecording() {
    if (this.isRecording) {
      console.log(chalk.yellow('⚠️  Already recording'));
      return false;
    }

    try {
      console.log(chalk.blue('🎤 Recording started... Press Enter to stop'));
      this.isRecording = true;
      
      const audioFile = path.join(this.tempAudioDir, `recording-${Date.now()}.wav`);
      
      // Start recording
      this.recordingStream = record.record({
        sampleRateHertz: 16000,
        threshold: 0,
        verbose: false,
        recordProgram: 'rec', // Uses SoX for cross-platform recording
        silence: '1.0s',
      });

      // Save to file
      const file = fs.createWriteStream(audioFile);
      this.recordingStream.stream().pipe(file);
      
      this.currentAudioFile = audioFile;
      return true;
      
    } catch (error) {
      console.log(chalk.red(`❌ Recording failed: ${error.message}`));
      this.isRecording = false;
      return false;
    }
  }

  async stopRecording() {
    if (!this.isRecording) {
      console.log(chalk.yellow('⚠️  Not currently recording'));
      return null;
    }

    try {
      console.log(chalk.blue('🛑 Stopping recording...'));
      
      if (this.recordingStream) {
        this.recordingStream.stop();
        this.recordingStream = null;
      }
      
      this.isRecording = false;
      
      // Wait a moment for file to be written
      await new Promise(resolve => setTimeout(resolve, 500));
      
      if (fs.existsSync(this.currentAudioFile)) {
        console.log(chalk.green(`✅ Recording saved: ${this.currentAudioFile}`));
        return this.currentAudioFile;
      } else {
        console.log(chalk.red('❌ Recording file not found'));
        return null;
      }
      
    } catch (error) {
      console.log(chalk.red(`❌ Stop recording failed: ${error.message}`));
      this.isRecording = false;
      return null;
    }
  }

  async transcribeAudio(audioFile) {
    if (!audioFile || !fs.existsSync(audioFile)) {
      console.log(chalk.red('❌ Audio file not found for transcription'));
      return null;
    }

    try {
      console.log(chalk.blue('🔄 Transcribing audio...'));
      
      // For now, return a placeholder - in production you'd use:
      // - Google Cloud Speech-to-Text API
      // - OpenAI Whisper API
      // - Azure Speech Services
      // - Web Speech API (for browser environments)
      
      console.log(chalk.yellow('📝 Transcription: [Manual transcription required]'));
      console.log(chalk.gray(`Audio file saved at: ${audioFile}`));
      console.log(chalk.gray('You can manually transcribe or implement STT service integration'));
      
      // Cleanup temp file after a delay
      setTimeout(() => {
        try {
          if (fs.existsSync(audioFile)) {
            fs.unlinkSync(audioFile);
          }
        } catch (e) {
          // Ignore cleanup errors
        }
      }, 30000); // Keep for 30 seconds
      
      return '[Speech recorded - manual transcription needed]';
      
    } catch (error) {
      console.log(chalk.red(`❌ Transcription failed: ${error.message}`));
      return null;
    }
  }

  async speakText(text, options = {}) {
    if (!this.textToSpeechEnabled) {
      console.log(chalk.yellow('⚠️  Text-to-speech not available'));
      return false;
    }

    if (!text || text.trim().length === 0) {
      return false;
    }

    try {
      console.log(chalk.blue('🔊 Speaking response...'));
      
      const speakOptions = {
        voice: options.voice || this.ttsVoice,
        speed: options.speed || 1.0,
        ...options
      };

      return new Promise((resolve, reject) => {
        say.speak(text, speakOptions.voice, speakOptions.speed, (err) => {
          if (err) {
            console.log(chalk.red(`❌ TTS failed: ${err.message}`));
            reject(err);
          } else {
            console.log(chalk.green('✅ Speech complete'));
            resolve(true);
          }
        });
      });
      
    } catch (error) {
      console.log(chalk.red(`❌ Text-to-speech failed: ${error.message}`));
      return false;
    }
  }

  async stopSpeaking() {
    try {
      say.stop();
      console.log(chalk.yellow('🔇 Speech stopped'));
      return true;
    } catch (error) {
      console.log(chalk.red(`❌ Stop speech failed: ${error.message}`));
      return false;
    }
  }

  getAvailableVoices() {
    try {
      if (process.platform === 'darwin') {
        // macOS voices
        return [
          'Alex', 'Allison', 'Ava', 'Samantha', 'Susan', 'Victoria',
          'Daniel', 'Tom', 'Oliver', 'Fred'
        ];
      } else if (process.platform === 'win32') {
        // Windows voices (common ones)
        return [
          'Microsoft David Desktop',
          'Microsoft Zira Desktop',
          'Microsoft Mark Desktop'
        ];
      } else {
        // Linux/espeak voices
        return ['default', 'english', 'english-us', 'english-uk'];
      }
    } catch (error) {
      return ['default'];
    }
  }

  setVoice(voiceName) {
    const availableVoices = this.getAvailableVoices();
    if (availableVoices.includes(voiceName)) {
      this.ttsVoice = voiceName;
      console.log(chalk.green(`✅ Voice set to: ${voiceName}`));
      return true;
    } else {
      console.log(chalk.red(`❌ Voice not available: ${voiceName}`));
      console.log(chalk.gray('Available voices:'), availableVoices.join(', '));
      return false;
    }
  }

  getStatus() {
    return {
      speechToTextEnabled: this.speechToTextEnabled,
      textToSpeechEnabled: this.textToSpeechEnabled,
      isRecording: this.isRecording,
      currentVoice: this.ttsVoice || 'default',
      language: this.language,
      availableVoices: this.getAvailableVoices()
    };
  }

  enableSpeechToText() {
    this.speechToTextEnabled = true;
    console.log(chalk.green('✅ Speech-to-text enabled'));
  }

  disableSpeechToText() {
    this.speechToTextEnabled = false;
    if (this.isRecording) {
      this.stopRecording();
    }
    console.log(chalk.yellow('⏸️  Speech-to-text disabled'));
  }

  enableTextToSpeech() {
    this.textToSpeechEnabled = true;
    console.log(chalk.green('✅ Text-to-speech enabled'));
  }

  disableTextToSpeech() {
    this.textToSpeechEnabled = false;
    this.stopSpeaking();
    console.log(chalk.yellow('⏸️  Text-to-speech disabled'));
  }

  cleanup() {
    if (this.isRecording) {
      this.stopRecording();
    }
    this.stopSpeaking();
    
    // Cleanup temp files
    try {
      if (fs.existsSync(this.tempAudioDir)) {
        const files = fs.readdirSync(this.tempAudioDir);
        files.forEach(file => {
          const filePath = path.join(this.tempAudioDir, file);
          try {
            fs.unlinkSync(filePath);
          } catch (e) {
            // Ignore individual file errors
          }
        });
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  }
}

module.exports = VoiceManager;