/**
 * DocxPreview - DOCX file preview component using docx-preview library
 */

'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { RecoderLoader } from '@/components/ui/recoder-loader';
import { useFileContentQuery } from '@/hooks/files/use-file-queries';
import { cn } from '@/lib/utils';

export interface DocxPreviewProps {
    filepath: string;
    sandboxId?: string;
    localPreviewUrl?: string;
    className?: string;
}

export function DocxPreview({
    filepath,
    sandboxId,
    localPreviewUrl,
    className,
}: DocxPreviewProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [renderError, setRenderError] = useState<string | null>(null);
    const [isRendering, setIsRendering] = useState(false);
    const [isRendered, setIsRendered] = useState(false);

    // Store fetched blob to avoid re-fetching
    const blobRef = useRef<Blob | null>(null);

    // Fetch DOCX file as blob
    const { data: blobData, isLoading, error, failureCount } = useFileContentQuery(
        sandboxId,
        filepath,
        {
            contentType: 'blob',
            enabled: !localPreviewUrl && !!sandboxId && !!filepath,
        }
    );

    // Debug logging
    useEffect(() => {
        
    }, [filepath, sandboxId, localPreviewUrl, isLoading, blobData, error, isRendering, isRendered, renderError]);

    // Render DOCX when blob data is available
    const renderDocx = useCallback(async () => {
        // Skip if already rendered or currently rendering
        if (isRendered || isRendering) {
            
            return;
        }

        const container = containerRef.current;
        if (!container) {
            
            return;
        }

        let docxBlob: Blob | null = null;

        // Get blob from localPreviewUrl or fetched data
        if (localPreviewUrl) {
            if (blobRef.current) {
                docxBlob = blobRef.current;
            } else {
                setIsRendering(true);
                try {
                    
                    const response = await fetch(localPreviewUrl);
                    docxBlob = await response.blob();
                    blobRef.current = docxBlob;
                    
                } catch (err) {
                    console.error('[DocxPreview] Failed to fetch local preview:', err);
                    setRenderError('Failed to load document');
                    setIsRendering(false);
                    return;
                }
            }
        } else if (blobData instanceof Blob) {
            
            docxBlob = blobData;
        }

        if (!docxBlob) {
            
            return;
        }

        setIsRendering(true);
        setRenderError(null);

        try {
            
            // Dynamically import docx-preview to avoid SSR issues
            const { renderAsync } = await import('docx-preview');
            

            // Check container is still mounted
            if (!containerRef.current) {
                
                setIsRendering(false);
                return;
            }

            // Clear previous content
            containerRef.current.innerHTML = '';

            // Render DOCX to container
            // inWrapper: false - no paper wrapper, just content
            // ignoreWidth: true - fill container width instead of page width
            // ignoreHeight: true - no page height constraints
            // breakPages: false - continuous scroll, no page breaks
            await renderAsync(docxBlob, containerRef.current, containerRef.current, {
                className: 'docx-preview',
                inWrapper: false,
                ignoreWidth: true,
                ignoreHeight: true,
                ignoreFonts: false,
                breakPages: false,
                ignoreLastRenderedPageBreak: true,
                experimental: false,
                trimXmlDeclaration: true,
                useBase64URL: true,
                renderHeaders: true,
                renderFooters: true,
                renderFootnotes: true,
                renderEndnotes: true,
            });

            
            setIsRendered(true);
        } catch (err) {
            console.error('[DocxPreview] Render error:', err);
            setRenderError('Failed to render document');
        } finally {
            setIsRendering(false);
        }
    }, [blobData, localPreviewUrl, isRendered, isRendering]);

    // Trigger render when container becomes available or dependencies change
    useEffect(() => {
        if (containerRef.current && !isRendered && !isRendering) {
            const hasData = localPreviewUrl || blobData instanceof Blob;
            if (hasData) {
                renderDocx();
            }
        }
    }, [blobData, localPreviewUrl, isRendered, isRendering, renderDocx]);

    // Reset rendered state when filepath changes
    useEffect(() => {
        setIsRendered(false);
        setRenderError(null);
        blobRef.current = null;
    }, [filepath]);

    const retryCount = failureCount || 0;

    // Show error state
    if ((error && !isLoading && failureCount >= 15) || renderError) {
        return (
            <div className={cn(
                "flex flex-col items-center justify-center h-full w-full bg-muted/20",
                className
            )}>
                <div className="text-sm text-muted-foreground">
                    {renderError || 'Failed to load document'}
                </div>
            </div>
        );
    }

    // Determine if we should show loading overlay
    const showLoading = !isRendered && (
        isLoading ||
        isRendering ||
        (!localPreviewUrl && !blobData)
    );

    // Always render the container to keep ref stable, overlay loading on top
    return (
        <div className={cn("relative h-full w-full", className)}>
            {/* Loading overlay */}
            {showLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted/50 z-10">
                    <RecoderLoader size="medium" />
                    {retryCount > 0 && (
                        <div className="text-xs text-muted-foreground mt-2">
                            Loading... (attempt {retryCount + 1})
                        </div>
                    )}
                </div>
            )}

            {/* DOCX container - always mounted to keep ref stable */}
            <div
                ref={containerRef}
                className={cn(
                    "h-full w-full overflow-auto bg-white docx-container",
                    !isRendered && "invisible" // Hide until rendered
                )}
                style={{
                    '--docx-preview-bg': 'white',
                } as React.CSSProperties}
            />
        </div>
    );
}
