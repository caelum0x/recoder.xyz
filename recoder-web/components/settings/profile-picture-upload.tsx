"use client";

import { useState, useRef, useCallback } from "react";
import { 
  Upload, Camera, Trash2, RotateCcw, Crop, 
  ZoomIn, ZoomOut, Move, Check, X, AlertTriangle,
  User, Image as ImageIcon, Loader2
} from "lucide-react";
import Image from "next/image";

interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ProfilePictureUploadProps {
  currentAvatar?: string;
  onUpload?: (avatarUrl: string) => void;
  onRemove?: () => void;
  maxFileSize?: number; // in MB
  allowedTypes?: string[];
  cropAspectRatio?: number; // width/height ratio, 1 = square
}

export function ProfilePictureUpload({
  currentAvatar,
  onUpload,
  onRemove,
  maxFileSize = 5,
  allowedTypes = ["image/jpeg", "image/png", "image/webp"],
  cropAspectRatio = 1, // square by default
}: ProfilePictureUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showCropDialog, setShowCropDialog] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [dragActive, setDragActive] = useState(false);

  // Cropping state
  const [cropArea, setCropArea] = useState<CropArea>({ x: 0, y: 0, width: 200, height: 200 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const validateFile = (file: File): string | null => {
    if (!allowedTypes.includes(file.type)) {
      return `Please select a valid image file (${allowedTypes.map(t => t.split('/')[1].toUpperCase()).join(', ')})`;
    }

    if (file.size > maxFileSize * 1024 * 1024) {
      return `File size must be less than ${maxFileSize}MB`;
    }

    return null;
  };

  const handleFileSelect = (file: File) => {
    const error = validateFile(file);
    if (error) {
      setMessage(error);
      setTimeout(() => setMessage(""), 3000);
      return;
    }

    setSelectedFile(file);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setShowCropDialog(true);
    
    // Reset crop settings
    setZoom(1);
    setRotation(0);
    setCropArea({ x: 50, y: 50, width: 200, height: 200 });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!imageRef.current) return;
    
    setIsDragging(true);
    const rect = imageRef.current.getBoundingClientRect();
    setDragStart({
      x: e.clientX - rect.left - cropArea.x,
      y: e.clientY - rect.top - cropArea.y,
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !imageRef.current) return;

    const rect = imageRef.current.getBoundingClientRect();
    const newX = Math.max(0, Math.min(rect.width - cropArea.width, e.clientX - rect.left - dragStart.x));
    const newY = Math.max(0, Math.min(rect.height - cropArea.height, e.clientY - rect.top - dragStart.y));
    
    setCropArea(prev => ({ ...prev, x: newX, y: newY }));
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const getCroppedImageBlob = (): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      if (!imageRef.current || !canvasRef.current) {
        reject(new Error("Required elements not found"));
        return;
      }

      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas context not available"));
        return;
      }

      const img = imageRef.current;
      const rect = img.getBoundingClientRect();
      
      // Calculate the actual image dimensions vs displayed dimensions
      const scaleX = img.naturalWidth / rect.width;
      const scaleY = img.naturalHeight / rect.height;

      // Calculate crop area in actual image coordinates
      const actualCropX = cropArea.x * scaleX;
      const actualCropY = cropArea.y * scaleY;
      const actualCropWidth = cropArea.width * scaleX;
      const actualCropHeight = cropArea.height * scaleY;

      // Set canvas size to desired output size
      const outputSize = 400; // 400x400 for profile pictures
      canvas.width = outputSize;
      canvas.height = outputSize;

      // Clear canvas
      ctx.clearRect(0, 0, outputSize, outputSize);

      // Apply rotation if needed
      if (rotation !== 0) {
        ctx.translate(outputSize / 2, outputSize / 2);
        ctx.rotate((rotation * Math.PI) / 180);
        ctx.translate(-outputSize / 2, -outputSize / 2);
      }

      // Draw the cropped image
      ctx.drawImage(
        img,
        actualCropX,
        actualCropY,
        actualCropWidth,
        actualCropHeight,
        0,
        0,
        outputSize,
        outputSize
      );

      // Convert to blob
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Failed to create blob"));
        }
      }, "image/jpeg", 0.9);
    });
  };

  const uploadCroppedImage = async () => {
    setIsLoading(true);
    try {
      const blob = await getCroppedImageBlob();
      
      // Create form data
      const formData = new FormData();
      formData.append("avatar", blob, "avatar.jpg");

      // Upload to server
      const response = await fetch("/api/user/profile/avatar", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to upload avatar");
      }

      const data = await response.json();
      
      // Clean up
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl(null);
      setSelectedFile(null);
      setShowCropDialog(false);
      
      // Notify parent
      if (onUpload && data.avatarUrl) {
        onUpload(data.avatarUrl);
      }
      
      setMessage("Profile picture updated successfully!");
    } catch (error) {
      console.error("Failed to upload avatar:", error);
      setMessage("Failed to upload profile picture");
    } finally {
      setIsLoading(false);
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const removeAvatar = async () => {
    if (!confirm("Are you sure you want to remove your profile picture?")) {
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/user/profile/avatar", {
        method: "DELETE",
        credentials: "include",
      });

      if (response.ok) {
        if (onRemove) {
          onRemove();
        }
        setMessage("Profile picture removed");
      } else {
        setMessage("Failed to remove profile picture");
      }
    } catch (error) {
      setMessage("Failed to remove profile picture");
    } finally {
      setIsLoading(false);
      setTimeout(() => setMessage(""), 3000);
    }
  };

  return (
    <div className="space-y-4">
      {/* Message Display */}
      {message && (
        <div className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
          message.includes("successfully") || message.includes("updated") || message.includes("removed")
            ? "bg-green-100 text-green-800"
            : "bg-red-100 text-red-800"
        }`}>
          {message.includes("successfully") || message.includes("updated") || message.includes("removed") ? (
            <Check className="w-4 h-4" />
          ) : (
            <AlertTriangle className="w-4 h-4" />
          )}
          {message}
        </div>
      )}

      {/* Current Avatar Display */}
      <div className="flex items-center gap-4">
        <div className="w-20 h-20 rounded-full overflow-hidden border-4 border-gray-200 bg-gray-100 flex-shrink-0">
          {currentAvatar ? (
            <Image
              src={currentAvatar}
              alt="Profile"
              width={80}
              height={80}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <User className="w-8 h-8 text-gray-400" />
            </div>
          )}
        </div>

        <div className="flex-1">
          <h3 className="text-lg font-medium text-gray-900">Profile Picture</h3>
          <p className="text-sm text-gray-600">
            Upload a new profile picture. For best results, use a square image at least 400x400 pixels.
          </p>
        </div>
      </div>

      {/* Upload Area */}
      <div
        className={`relative border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
          dragActive
            ? "border-indigo-400 bg-indigo-50"
            : "border-gray-300 hover:border-gray-400"
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={allowedTypes.join(",")}
          onChange={handleInputChange}
          className="hidden"
        />

        <div className="space-y-2">
          <div className="flex justify-center">
            <Upload className="w-8 h-8 text-gray-400" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-gray-900">
              Drop your image here, or{" "}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-indigo-600 hover:text-indigo-700"
              >
                browse
              </button>
            </p>
            <p className="text-xs text-gray-500">
              Supports: {allowedTypes.map(t => t.split('/')[1].toUpperCase()).join(', ')} • Max {maxFileSize}MB
            </p>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
          Upload New Picture
        </button>
        
        {currentAvatar && (
          <button
            onClick={removeAvatar}
            disabled={isLoading}
            className="px-4 py-2 text-red-600 border border-red-300 rounded-lg hover:bg-red-50 disabled:opacity-50 flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Remove
          </button>
        )}
      </div>

      {/* Crop Dialog */}
      {showCropDialog && previewUrl && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Crop Profile Picture</h3>
                <button
                  onClick={() => {
                    setShowCropDialog(false);
                    if (previewUrl) {
                      URL.revokeObjectURL(previewUrl);
                    }
                    setPreviewUrl(null);
                    setSelectedFile(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {/* Crop Area */}
              <div className="relative bg-gray-100 rounded-lg overflow-hidden" style={{ height: "400px" }}>
                <Image
                  ref={imageRef}
                  src={previewUrl}
                  alt="Crop preview"
                  width={400}
                  height={400}
                  className="w-full h-full object-contain"
                  style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                />
                
                {/* Crop Overlay */}
                <div
                  className="absolute border-2 border-white shadow-lg cursor-move"
                  style={{
                    left: `${cropArea.x}px`,
                    top: `${cropArea.y}px`,
                    width: `${cropArea.width}px`,
                    height: `${cropArea.height}px`,
                  }}
                  onMouseDown={handleMouseDown}
                >
                  <div className="absolute inset-0 bg-white bg-opacity-20"></div>
                  <div className="absolute -top-1 -left-1 w-3 h-3 bg-white border border-gray-300 rounded-full cursor-nw-resize"></div>
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-white border border-gray-300 rounded-full cursor-ne-resize"></div>
                  <div className="absolute -bottom-1 -left-1 w-3 h-3 bg-white border border-gray-300 rounded-full cursor-sw-resize"></div>
                  <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-white border border-gray-300 rounded-full cursor-se-resize"></div>
                </div>
              </div>

              {/* Controls */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">Zoom</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setZoom(Math.max(0.5, zoom - 0.1))}
                      className="p-1 text-gray-400 hover:text-gray-600"
                    >
                      <ZoomOut className="w-4 h-4" />
                    </button>
                    <input
                      type="range"
                      min="0.5"
                      max="3"
                      step="0.1"
                      value={zoom}
                      onChange={(e) => setZoom(parseFloat(e.target.value))}
                      className="w-24"
                    />
                    <button
                      onClick={() => setZoom(Math.min(3, zoom + 0.1))}
                      className="p-1 text-gray-400 hover:text-gray-600"
                    >
                      <ZoomIn className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">Rotation</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setRotation((rotation - 90) % 360)}
                      className="p-1 text-gray-400 hover:text-gray-600"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                    <input
                      type="range"
                      min="-180"
                      max="180"
                      step="5"
                      value={rotation}
                      onChange={(e) => setRotation(parseInt(e.target.value))}
                      className="w-24"
                    />
                    <span className="text-sm text-gray-500 w-12">{rotation}°</span>
                  </div>
                </div>
              </div>

              {/* Preview */}
              <div className="flex items-center justify-center">
                <div className="text-center">
                  <p className="text-sm font-medium text-gray-700 mb-2">Preview</p>
                  <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-gray-300 bg-gray-100 mx-auto">
                    <canvas
                      ref={canvasRef}
                      className="w-full h-full object-cover"
                      style={{ display: "none" }}
                    />
                    {/* We'd show a real preview here in a full implementation */}
                    <div className="w-full h-full flex items-center justify-center bg-gray-200">
                      <ImageIcon className="w-6 h-6 text-gray-400" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setShowCropDialog(false);
                  if (previewUrl) {
                    URL.revokeObjectURL(previewUrl);
                  }
                  setPreviewUrl(null);
                  setSelectedFile(null);
                }}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={uploadCroppedImage}
                disabled={isLoading}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Save Picture
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}