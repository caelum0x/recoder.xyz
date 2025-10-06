'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getImageGenerationModels } from '@/lib/ai/model-registry';

interface GeneratedImage {
  url?: string;
  b64_json?: string;
  revised_prompt?: string;
}

export function ImageGenerator() {
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState('google/gemini-2.5-flash-image');
  const [size, setSize] = useState('1024x1024');
  const [quality, setQuality] = useState<'standard' | 'hd'>('standard');
  const [loading, setLoading] = useState(false);
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [error, setError] = useState<string | null>(null);

  const imageModels = getImageGenerationModels();

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError('Please enter a prompt');
      return;
    }

    setLoading(true);
    setError(null);
    setImages([]);

    try {
      const response = await fetch('/api/images/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: prompt.trim(),
          model,
          size,
          quality,
          n: 1,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Image generation failed');
      }

      const data = await response.json();
      setImages(data.images || []);
    } catch (err) {
      console.error('Image generation error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const downloadImage = (image: GeneratedImage, index: number) => {
    const dataUrl = image.url || `data:image/png;base64,${image.b64_json}`;
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `generated-image-${index + 1}.png`;
    link.click();
  };

  return (
    <div className="flex flex-col gap-4 p-4 border rounded-lg">
      <h3 className="text-lg font-semibold">🎨 AI Image Generator</h3>

      {/* Prompt Input */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium">Prompt</label>
        <Textarea
          placeholder="Describe the image you want to generate..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          className="resize-none"
        />
      </div>

      {/* Model Selection */}
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium">Model</label>
          <Select value={model} onValueChange={setModel}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {imageModels.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name} {m.isFree ? '(FREE)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium">Size</label>
          <Select value={size} onValueChange={setSize}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1024x1024">1024x1024 (Square)</SelectItem>
              <SelectItem value="1024x1792">1024x1792 (Portrait)</SelectItem>
              <SelectItem value="1792x1024">1792x1024 (Landscape)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Quality Selection */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium">Quality</label>
        <Select value={quality} onValueChange={(v) => setQuality(v as 'standard' | 'hd')}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="standard">Standard</SelectItem>
            <SelectItem value="hd">HD (Higher cost)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Generate Button */}
      <Button
        onClick={handleGenerate}
        disabled={loading || !prompt.trim()}
        className="w-full"
      >
        {loading ? (
          <>
            <span className="animate-spin mr-2">⏳</span>
            Generating...
          </>
        ) : (
          '✨ Generate Image'
        )}
      </Button>

      {/* Error Display */}
      {error && (
        <div className="p-3 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-100 rounded-md text-sm">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Generated Images */}
      {images.length > 0 && (
        <div className="flex flex-col gap-4">
          <h4 className="text-sm font-semibold">Generated Images</h4>
          <div className="grid grid-cols-1 gap-4">
            {images.map((image, index) => {
              const imageUrl = image.url || `data:image/png;base64,${image.b64_json}`;
              return (
                <div key={index} className="flex flex-col gap-2 border rounded-lg p-2">
                  <img
                    src={imageUrl}
                    alt={image.revised_prompt || prompt}
                    className="w-full h-auto rounded-lg"
                  />
                  {image.revised_prompt && (
                    <p className="text-xs text-muted-foreground">
                      <strong>Revised prompt:</strong> {image.revised_prompt}
                    </p>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => downloadImage(image, index)}
                  >
                    📥 Download
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
