import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  ScrollView,
  TouchableOpacity,
  Image,
  SafeAreaView,
  Animated,
} from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthContext } from '../../contexts/AuthContext';

const { width, height } = Dimensions.get('window');

interface OnboardingSlide {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: string;
}

const slides: OnboardingSlide[] = [
  {
    id: '1',
    title: 'Welcome to Recoder',
    description: 'Your AI-powered development companion. Write code faster with intelligent assistance from multiple AI providers.',
    icon: '🚀',
    color: '#2563eb'
  },
  {
    id: '2',
    title: 'Multi-AI Intelligence',
    description: 'Access Claude, GPT-4, Groq, and local models. Smart routing picks the best AI for each task.',
    icon: '🧠',
    color: '#7c3aed'
  },
  {
    id: '3',
    title: 'Real-time Collaboration',
    description: 'Sync seamlessly across web, desktop, and mobile. Work on your projects anywhere.',
    icon: '🔄',
    color: '#059669'
  },
  {
    id: '4',
    title: 'Voice & Camera',
    description: 'Code with your voice or snap photos of whiteboard sketches. AI transforms them into working code.',
    icon: '📸',
    color: '#dc2626'
  },
  {
    id: '5',
    title: 'Start Building',
    description: 'Ready to 10x your development speed? Create your account and start coding with AI.',
    icon: '⚡',
    color: '#ea580c'
  }
];

export default function OnboardingScreen() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollViewRef = useRef<ScrollView>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const { isAuthenticated } = useAuthContext();

  React.useEffect(() => {
    // Animate in the current slide
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();
  }, [currentIndex]);

  const handleNext = () => {
    if (currentIndex < slides.length - 1) {
      // Animate out
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 0.8,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => {
        const nextIndex = currentIndex + 1;
        setCurrentIndex(nextIndex);
        scrollViewRef.current?.scrollTo({
          x: nextIndex * width,
          animated: true,
        });
      });
    } else {
      handleComplete();
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 0.8,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => {
        const prevIndex = currentIndex - 1;
        setCurrentIndex(prevIndex);
        scrollViewRef.current?.scrollTo({
          x: prevIndex * width,
          animated: true,
        });
      });
    }
  };

  const handleComplete = async () => {
    // Mark onboarding as completed
    await AsyncStorage.setItem('onboarding_completed', 'true');
    
    // Navigate based on authentication status
    if (isAuthenticated) {
      router.replace('/(tabs)' as any);
    } else {
      router.replace('/auth/login' as any);
    }
  };

  const handleSkip = async () => {
    await AsyncStorage.setItem('onboarding_completed', 'true');
    if (isAuthenticated) {
      router.replace('/(tabs)' as any);
    } else {
      router.replace('/auth/login' as any);
    }
  };

  const currentSlide = slides[currentIndex];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: currentSlide.color }]}>
      <StatusBar style="light" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleSkip} style={styles.skipButton}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
        <View style={styles.progressContainer}>
          {slides.map((_, index) => (
            <View
              key={index}
              style={[
                styles.progressDot,
                index === currentIndex && styles.progressDotActive,
              ]}
            />
          ))}
        </View>
        <View style={styles.skipButton} />
      </View>

      {/* Content */}
      <ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={false}
        style={styles.scrollView}
      >
        {slides.map((slide, index) => (
          <Animated.View
            key={slide.id}
            style={[
              styles.slide,
              {
                opacity: index === currentIndex ? fadeAnim : 0.3,
                transform: [
                  {
                    scale: index === currentIndex ? scaleAnim : 0.8,
                  },
                ],
              },
            ]}
          >
            <View style={styles.iconContainer}>
              <Text style={styles.icon}>{slide.icon}</Text>
            </View>
            
            <Text style={styles.title}>{slide.title}</Text>
            <Text style={styles.description}>{slide.description}</Text>
          </Animated.View>
        ))}
      </ScrollView>

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity
          onPress={handlePrevious}
          style={[
            styles.controlButton,
            styles.previousButton,
            currentIndex === 0 && styles.disabledButton,
          ]}
          disabled={currentIndex === 0}
        >
          <Text
            style={[
              styles.controlButtonText,
              styles.previousButtonText,
              currentIndex === 0 && styles.disabledButtonText,
            ]}
          >
            Previous
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={handleNext} style={styles.controlButton}>
          <Text style={styles.controlButtonText}>
            {currentIndex === slides.length - 1 ? 'Get Started' : 'Next'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Tutorial Features */}
      {currentIndex === 1 && (
        <Animated.View style={[styles.tutorialOverlay, { opacity: fadeAnim }]}>
          <View style={styles.tutorialCard}>
            <Text style={styles.tutorialTitle}>💡 Quick Tip</Text>
            <Text style={styles.tutorialText}>
              Swipe up from the bottom to access AI model selection at any time.
            </Text>
          </View>
        </Animated.View>
      )}

      {currentIndex === 2 && (
        <Animated.View style={[styles.tutorialOverlay, { opacity: fadeAnim }]}>
          <View style={styles.tutorialCard}>
            <Text style={styles.tutorialTitle}>🔗 Cross-Platform</Text>
            <Text style={styles.tutorialText}>
              Your conversations sync in real-time across all devices. Start on mobile, continue on desktop.
            </Text>
          </View>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 20,
  },
  skipButton: {
    width: 60,
  },
  skipText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'right',
    opacity: 0.8,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    marginHorizontal: 4,
  },
  progressDotActive: {
    backgroundColor: '#ffffff',
    width: 20,
  },
  scrollView: {
    flex: 1,
  },
  slide: {
    width,
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
  },
  icon: {
    fontSize: 60,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 20,
    fontFamily: 'Inter-Bold',
  },
  description: {
    fontSize: 18,
    color: '#ffffff',
    textAlign: 'center',
    lineHeight: 26,
    opacity: 0.9,
    fontFamily: 'Inter-Regular',
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 20,
  },
  controlButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    minWidth: 120,
  },
  previousButton: {
    backgroundColor: 'transparent',
  },
  disabledButton: {
    opacity: 0.3,
  },
  controlButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    fontFamily: 'Inter-SemiBold',
  },
  previousButtonText: {
    opacity: 0.8,
  },
  disabledButtonText: {
    opacity: 0.3,
  },
  tutorialOverlay: {
    position: 'absolute',
    bottom: 120,
    left: 20,
    right: 20,
  },
  tutorialCard: {
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    padding: 20,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#ffffff',
  },
  tutorialTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    fontFamily: 'Inter-SemiBold',
  },
  tutorialText: {
    color: '#ffffff',
    fontSize: 14,
    opacity: 0.9,
    lineHeight: 20,
    fontFamily: 'Inter-Regular',
  },
});