import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Alert,
  Dimensions,
  ActivityIndicator,
  Image,
  ScrollView,
} from 'react-native';
import { Camera, CameraType, FlashMode } from 'expo-camera';
import * as MediaLibrary from 'expo-media-library';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useTheme } from '../contexts/ThemeContext';
import { HapticService } from '../services/MobileNativeModules';

const { width, height } = Dimensions.get('window');

interface CameraIntegrationProps {
  visible: boolean;
  onClose: () => void;
  onImageCaptured: (imageUri: string, metadata?: any) => void;
  onCodeDetected?: (codes: any[]) => void;
  mode?: 'photo' | 'qr' | 'document' | 'ai-analysis';
  allowMultiple?: boolean;
  quality?: number;
  aspectRatio?: [number, number];
}

interface CapturedImage {
  uri: string;
  width: number;
  height: number;
  base64?: string;
  metadata?: any;
}

export const CameraIntegration: React.FC<CameraIntegrationProps> = ({
  visible,
  onClose,
  onImageCaptured,
  onCodeDetected,
  mode = 'photo',
  allowMultiple = false,
  quality = 0.8,
  aspectRatio = [4, 3],
}) => {
  const { theme } = useTheme();
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [cameraType, setCameraType] = useState(CameraType.back);
  const [flashMode, setFlashMode] = useState(FlashMode.off);
  const [isCapturing, setIsCapturing] = useState(false);
  const [capturedImages, setCapturedImages] = useState<CapturedImage[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [currentImage, setCurrentImage] = useState<CapturedImage | null>(null);
  const [zoom, setZoom] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [detectedCodes, setDetectedCodes] = useState<any[]>([]);
  const [cameraReady, setCameraReady] = useState(false);
  
  const cameraRef = useRef<Camera>(null);

  // Request permissions
  useEffect(() => {
    (async () => {
      const { status: cameraStatus } = await Camera.requestCameraPermissionsAsync();
      const { status: mediaLibraryStatus } = await MediaLibrary.requestPermissionsAsync();
      setHasPermission(cameraStatus === 'granted' && mediaLibraryStatus === 'granted');
    })();
  }, []);

  // Cleanup when component unmounts or modal closes
  useEffect(() => {
    if (!visible) {
      setCapturedImages([]);
      setCurrentImage(null);
      setShowPreview(false);
      setDetectedCodes([]);
      setZoom(0);
    }
  }, [visible]);

  const takePicture = async () => {
    if (!cameraRef.current || isCapturing) return;

    try {
      setIsCapturing(true);
      HapticService.light();

      const photo = await cameraRef.current.takePictureAsync({
        quality,
        base64: mode === 'ai-analysis',
        exif: true,
        skipProcessing: false,
      });

      const processedImage = await processImage(photo);
      
      if (allowMultiple) {
        setCapturedImages(prev => [...prev, processedImage]);
      } else {
        setCapturedImages([processedImage]);
      }

      setCurrentImage(processedImage);
      setShowPreview(true);

      // Perform AI analysis if requested
      if (mode === 'ai-analysis') {
        await performAIAnalysis(processedImage);
      }

      HapticService.success();
    } catch (error) {
      console.error('Error taking picture:', error);
      Alert.alert('Error', 'Failed to take picture. Please try again.');
      HapticService.error();
    } finally {
      setIsCapturing(false);
    }
  };

  const processImage = async (photo: any): Promise<CapturedImage> => {
    try {
      setIsProcessing(true);

      let processedPhoto = photo;

      // Apply image processing based on mode
      switch (mode) {
        case 'document':
          // Enhance contrast and apply document processing
          processedPhoto = await ImageManipulator.manipulateAsync(
            photo.uri,
            [{ resize: { width: Math.min(photo.width, 2048) } }],
            {
              compress: quality,
              format: ImageManipulator.SaveFormat.JPEG,
              base64: false,
            }
          );
          break;
        
        case 'ai-analysis':
          // Optimize for AI analysis
          processedPhoto = await ImageManipulator.manipulateAsync(
            photo.uri,
            [
              { resize: { width: 512 } }, // Optimize for AI models
              { rotate: 0 }, // Ensure proper orientation
            ],
            {
              compress: 0.9,
              format: ImageManipulator.SaveFormat.JPEG,
              base64: true,
            }
          );
          break;
        
        default:
          // Standard photo processing
          if (photo.width > 1920) {
            processedPhoto = await ImageManipulator.manipulateAsync(
              photo.uri,
              [{ resize: { width: 1920 } }],
              {
                compress: quality,
                format: ImageManipulator.SaveFormat.JPEG,
              }
            );
          }
      }

      return {
        uri: processedPhoto.uri,
        width: processedPhoto.width,
        height: processedPhoto.height,
        base64: processedPhoto.base64,
        metadata: {
          originalWidth: photo.width,
          originalHeight: photo.height,
          exif: photo.exif,
          mode,
          timestamp: Date.now(),
        },
      };
    } catch (error) {
      console.error('Error processing image:', error);
      return {
        uri: photo.uri,
        width: photo.width,
        height: photo.height,
        metadata: { mode, timestamp: Date.now() },
      };
    } finally {
      setIsProcessing(false);
    }
  };

  const performAIAnalysis = async (image: CapturedImage) => {
    if (!image.base64) return;

    try {
      // Simulate AI analysis - replace with actual AI service call
      const analysisResult = {
        detectedObjects: ['code snippet', 'text'],
        confidence: 0.85,
        extractedText: 'Sample extracted text from image',
        suggestedActions: ['Convert to code', 'Extract text', 'Save as reference'],
      };

      image.metadata = {
        ...image.metadata,
        aiAnalysis: analysisResult,
      };

      // You would typically send to your AI service here
      console.log('AI Analysis Result:', analysisResult);
    } catch (error) {
      console.error('AI analysis error:', error);
    }
  };

  const pickFromGallery = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: mode !== 'document',
        aspect: aspectRatio,
        quality,
        base64: mode === 'ai-analysis',
        allowsMultipleSelection: allowMultiple,
      });

      if (!result.canceled && result.assets) {
        for (const asset of result.assets) {
          const processedImage = await processImage({
            uri: asset.uri,
            width: asset.width,
            height: asset.height,
            base64: asset.base64,
          });

          if (allowMultiple) {
            setCapturedImages(prev => [...prev, processedImage]);
          } else {
            setCapturedImages([processedImage]);
            setCurrentImage(processedImage);
            setShowPreview(true);
          }

          if (mode === 'ai-analysis') {
            await performAIAnalysis(processedImage);
          }
        }
      }
    } catch (error) {
      console.error('Error picking from gallery:', error);
      Alert.alert('Error', 'Failed to pick image from gallery.');
    }
  };

  const useCurrentImage = () => {
    if (currentImage) {
      onImageCaptured(currentImage.uri, currentImage.metadata);
      onClose();
    }
  };

  const retakePhoto = () => {
    setShowPreview(false);
    setCurrentImage(null);
  };

  const deleteImage = (index: number) => {
    setCapturedImages(prev => prev.filter((_, i) => i !== index));
    if (capturedImages[index] === currentImage) {
      setCurrentImage(null);
      setShowPreview(false);
    }
  };

  const toggleCameraType = () => {
    setCameraType(
      cameraType === CameraType.back ? CameraType.front : CameraType.back
    );
    HapticService.light();
  };

  const toggleFlash = () => {
    const modes = [FlashMode.off, FlashMode.on, FlashMode.auto];
    const currentIndex = modes.indexOf(flashMode);
    setFlashMode(modes[(currentIndex + 1) % modes.length]);
    HapticService.light();
  };

  const handleCodeDetected = (codes: any[]) => {
    if (mode === 'qr' && codes.length > 0) {
      setDetectedCodes(codes);
      onCodeDetected?.(codes);
      HapticService.medium();
    }
  };

  if (hasPermission === null) {
    return (
      <Modal visible={visible} animationType="slide">
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={[styles.message, { color: theme.colors.text }]}>
            Requesting camera permissions...
          </Text>
        </View>
      </Modal>
    );
  }

  if (hasPermission === false) {
    return (
      <Modal visible={visible} animationType="slide">
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
          <Ionicons name="camera-off" size={64} color={theme.colors.textSecondary} />
          <Text style={[styles.message, { color: theme.colors.text }]}>
            Camera permission is required to use this feature
          </Text>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: theme.colors.primary }]}
            onPress={onClose}
          >
            <Text style={[styles.buttonText, { color: theme.colors.onPrimary }]}>
              Close
            </Text>
          </TouchableOpacity>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent>
      <View style={styles.modalContainer}>
        {!showPreview ? (
          <View style={styles.cameraContainer}>
            <Camera
              ref={cameraRef}
              style={styles.camera}
              type={cameraType}
              flashMode={flashMode}
              ratio="4:3"
              onCameraReady={() => setCameraReady(true)}
              zoom={zoom}
              autoFocus={Camera.Constants.AutoFocus.on}
              whiteBalance={Camera.Constants.WhiteBalance.auto}
              onBarCodeScanned={mode === 'qr' ? handleCodeDetected : undefined}
            >
              {/* Top controls */}
              <View style={styles.topControls}>
                <TouchableOpacity
                  style={styles.topButton}
                  onPress={onClose}
                >
                  <BlurView intensity={50} style={styles.blurButton}>
                    <Ionicons name="close" size={24} color="#fff" />
                  </BlurView>
                </TouchableOpacity>

                <View style={styles.topCenter}>
                  <Text style={styles.modeText}>
                    {mode === 'photo' && 'Photo'}
                    {mode === 'qr' && 'QR Code'}
                    {mode === 'document' && 'Document'}
                    {mode === 'ai-analysis' && 'AI Analysis'}
                  </Text>
                </View>

                <TouchableOpacity
                  style={styles.topButton}
                  onPress={toggleFlash}
                >
                  <BlurView intensity={50} style={styles.blurButton}>
                    <Ionicons
                      name={
                        flashMode === FlashMode.off
                          ? 'flash-off'
                          : flashMode === FlashMode.on
                          ? 'flash'
                          : 'flash-outline'
                      }
                      size={24}
                      color="#fff"
                    />
                  </BlurView>
                </TouchableOpacity>
              </View>

              {/* QR Code overlay */}
              {mode === 'qr' && (
                <View style={styles.qrOverlay}>
                  <View style={styles.qrFrame} />
                  {detectedCodes.length > 0 && (
                    <View style={styles.qrResults}>
                      {detectedCodes.map((code, index) => (
                        <Text key={index} style={styles.qrText}>
                          {code.data}
                        </Text>
                      ))}
                    </View>
                  )}
                </View>
              )}

              {/* Document overlay */}
              {mode === 'document' && (
                <View style={styles.documentOverlay}>
                  <View style={styles.documentFrame} />
                  <Text style={styles.documentHint}>
                    Position document within the frame
                  </Text>
                </View>
              )}

              {/* Bottom controls */}
              <View style={styles.bottomControls}>
                <TouchableOpacity
                  style={styles.galleryButton}
                  onPress={pickFromGallery}
                >
                  <BlurView intensity={50} style={styles.blurButton}>
                    <Ionicons name="images" size={24} color="#fff" />
                  </BlurView>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.captureButton,
                    isCapturing && styles.capturingButton,
                  ]}
                  onPress={takePicture}
                  disabled={!cameraReady || isCapturing}
                >
                  {isCapturing || isProcessing ? (
                    <ActivityIndicator size="large" color="#fff" />
                  ) : (
                    <View style={styles.captureInner} />
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.flipButton}
                  onPress={toggleCameraType}
                >
                  <BlurView intensity={50} style={styles.blurButton}>
                    <Ionicons name="camera-reverse" size={24} color="#fff" />
                  </BlurView>
                </TouchableOpacity>
              </View>

              {/* Zoom control */}
              {cameraType === CameraType.back && (
                <View style={styles.zoomControl}>
                  <Text style={styles.zoomText}>{(zoom * 10 + 1).toFixed(1)}x</Text>
                </View>
              )}
            </Camera>
          </View>
        ) : (
          <View style={styles.previewContainer}>
            {/* Preview header */}
            <View style={[styles.previewHeader, { backgroundColor: theme.colors.surface }]}>
              <TouchableOpacity
                style={styles.headerButton}
                onPress={retakePhoto}
              >
                <Ionicons name="camera" size={24} color={theme.colors.primary} />
                <Text style={[styles.headerButtonText, { color: theme.colors.primary }]}>
                  Retake
                </Text>
              </TouchableOpacity>

              <Text style={[styles.previewTitle, { color: theme.colors.text }]}>
                {mode === 'ai-analysis' ? 'AI Analysis' : 'Preview'}
              </Text>

              <TouchableOpacity
                style={styles.headerButton}
                onPress={useCurrentImage}
              >
                <Ionicons name="checkmark" size={24} color={theme.colors.primary} />
                <Text style={[styles.headerButtonText, { color: theme.colors.primary }]}>
                  Use
                </Text>
              </TouchableOpacity>
            </View>

            {/* Preview content */}
            <ScrollView style={styles.previewContent}>
              {currentImage && (
                <View>
                  <Image
                    source={{ uri: currentImage.uri }}
                    style={[
                      styles.previewImage,
                      {
                        aspectRatio: currentImage.width / currentImage.height,
                      },
                    ]}
                    resizeMode="contain"
                  />

                  {/* AI Analysis Results */}
                  {currentImage.metadata?.aiAnalysis && (
                    <View style={[styles.analysisResults, { backgroundColor: theme.colors.surface }]}>
                      <Text style={[styles.analysisTitle, { color: theme.colors.text }]}>
                        AI Analysis Results
                      </Text>
                      
                      <View style={styles.analysisItem}>
                        <Text style={[styles.analysisLabel, { color: theme.colors.textSecondary }]}>
                          Detected Objects:
                        </Text>
                        <Text style={[styles.analysisValue, { color: theme.colors.text }]}>
                          {currentImage.metadata.aiAnalysis.detectedObjects.join(', ')}
                        </Text>
                      </View>

                      <View style={styles.analysisItem}>
                        <Text style={[styles.analysisLabel, { color: theme.colors.textSecondary }]}>
                          Confidence:
                        </Text>
                        <Text style={[styles.analysisValue, { color: theme.colors.text }]}>
                          {(currentImage.metadata.aiAnalysis.confidence * 100).toFixed(1)}%
                        </Text>
                      </View>

                      {currentImage.metadata.aiAnalysis.extractedText && (
                        <View style={styles.analysisItem}>
                          <Text style={[styles.analysisLabel, { color: theme.colors.textSecondary }]}>
                            Extracted Text:
                          </Text>
                          <Text style={[styles.analysisValue, { color: theme.colors.text }]}>
                            {currentImage.metadata.aiAnalysis.extractedText}
                          </Text>
                        </View>
                      )}

                      <View style={styles.analysisActions}>
                        {currentImage.metadata.aiAnalysis.suggestedActions.map((action: string, index: number) => (
                          <TouchableOpacity
                            key={index}
                            style={[styles.actionButton, { backgroundColor: theme.colors.primary }]}
                            onPress={() => console.log('Action:', action)}
                          >
                            <Text style={[styles.actionButtonText, { color: theme.colors.onPrimary }]}>
                              {action}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  )}

                  {/* Image metadata */}
                  <View style={[styles.metadata, { backgroundColor: theme.colors.surface }]}>
                    <Text style={[styles.metadataTitle, { color: theme.colors.text }]}>
                      Image Details
                    </Text>
                    <Text style={[styles.metadataText, { color: theme.colors.textSecondary }]}>
                      Size: {currentImage.width} x {currentImage.height}
                    </Text>
                    <Text style={[styles.metadataText, { color: theme.colors.textSecondary }]}>
                      Mode: {currentImage.metadata?.mode}
                    </Text>
                    <Text style={[styles.metadataText, { color: theme.colors.textSecondary }]}>
                      Captured: {new Date(currentImage.metadata?.timestamp || Date.now()).toLocaleString()}
                    </Text>
                  </View>
                </View>
              )}
            </ScrollView>
          </View>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  cameraContainer: {
    flex: 1,
  },
  camera: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  message: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 30,
  },
  button: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  topControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  topButton: {
    width: 44,
    height: 44,
  },
  topCenter: {
    flex: 1,
    alignItems: 'center',
  },
  modeText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  blurButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  bottomControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingBottom: 40,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  captureButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  capturingButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
  },
  captureInner: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#fff',
  },
  galleryButton: {
    width: 44,
    height: 44,
  },
  flipButton: {
    width: 44,
    height: 44,
  },
  zoomControl: {
    position: 'absolute',
    bottom: 140,
    left: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  zoomText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  qrOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qrFrame: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: 'transparent',
  },
  qrResults: {
    position: 'absolute',
    bottom: 200,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    padding: 16,
    borderRadius: 8,
  },
  qrText: {
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
  },
  documentOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  documentFrame: {
    width: width * 0.8,
    height: height * 0.6,
    borderWidth: 2,
    borderColor: '#fff',
    borderStyle: 'dashed',
    backgroundColor: 'transparent',
  },
  documentHint: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  previewContainer: {
    flex: 1,
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  previewTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  previewContent: {
    flex: 1,
  },
  previewImage: {
    width: '100%',
    maxHeight: height * 0.5,
  },
  analysisResults: {
    margin: 20,
    padding: 16,
    borderRadius: 12,
  },
  analysisTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  analysisItem: {
    marginBottom: 12,
  },
  analysisLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
  },
  analysisValue: {
    fontSize: 16,
  },
  analysisActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16,
  },
  actionButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  metadata: {
    margin: 20,
    padding: 16,
    borderRadius: 12,
  },
  metadataTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  metadataText: {
    fontSize: 14,
    marginBottom: 4,
  },
});

export default CameraIntegration;