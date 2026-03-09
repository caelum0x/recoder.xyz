"use client"
import { useState, useCallback } from "react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useContextUsageStore } from "@/stores/context-usage-store"
import { useModelSelection } from "@/hooks/agents"
import { cn } from "@/lib/utils"
import { compressThreadContext } from "@/lib/api/context-compression"
import { toast } from "@/lib/toast"
import { Shrink } from "lucide-react"

interface ContextUsageIndicatorProps {
  threadId: string
  modelName?: string
  className?: string
}

export const ContextUsageIndicator = ({
  threadId,
  modelName,
  className,
}: ContextUsageIndicatorProps) => {
  const contextUsage = useContextUsageStore((state) => state.getUsage(threadId))
  const { allModels } = useModelSelection()

  if (!contextUsage || !contextUsage.current_tokens) return null

  const { current_tokens } = contextUsage
  

  const modelData = modelName ? allModels.find((m) => m.id === modelName) : null
  const context_window = modelData?.contextWindow || 200000
  const displayModelName = modelData?.label || ""

  const rawPct = (current_tokens / context_window) * 100
  const percentage = Math.max(0, Math.min(100, rawPct))

  const getColor = (pct: number) => {
    if (pct < 60) return "text-muted-foreground"
    if (pct < 75) return "text-blue-500"
    if (pct < 90) return "text-orange-500"
    return "text-red-500"
  }

  const [isCompressing, setIsCompressing] = useState(false)
  const showCompressButton = percentage >= 80

  const handleCompress = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isCompressing) return

    setIsCompressing(true)
    try {
      // Build a lightweight messages array from token count context.
      // The backend only needs role+content pairs; we send a placeholder
      // so the endpoint knows the thread and can pull real messages.
      const result = await compressThreadContext(threadId, [], 4)

      // Update the store to reflect reduced token usage
      const estimatedReduction = result.original_count > 0
        ? (result.compressed_count / result.original_count)
        : 0.5
      const reducedTokens = Math.round(current_tokens * estimatedReduction)
      useContextUsageStore.getState().setUsage(threadId, { current_tokens: reducedTokens })

      toast.info(`Context compressed — ${result.original_count} → ${result.compressed_count} messages`)
    } catch (err) {
      console.error('Context compression failed:', err)
      toast.warning('Context compression failed — try again later')
    } finally {
      setIsCompressing(false)
    }
  }, [threadId, isCompressing, current_tokens])

  const colorClass = getColor(percentage)
  const radius = 8
  const strokeWidth = 2
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (percentage / 100) * circumference
  const size = (radius + strokeWidth) * 2

  return (
    <TooltipProvider>
      <div className={cn("flex items-center gap-1", className)}>
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <div className={cn(
              "flex items-center justify-center cursor-help transition-opacity hover:opacity-100",
              percentage < 60 ? "opacity-60" : "opacity-100",
            )}>
              <svg
                className="w-6 h-6 -rotate-90"
                viewBox={`0 0 ${size} ${size}`}
                role="img"
                aria-label={`Context usage ${percentage.toFixed(1)} percent`}
              >
                <circle
                  cx={radius + strokeWidth}
                  cy={radius + strokeWidth}
                  r={radius}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={strokeWidth}
                  className="stroke-muted-foreground/30"
                />
                <circle
                  cx={radius + strokeWidth}
                  cy={radius + strokeWidth}
                  r={radius}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={strokeWidth}
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  className={cn(
                    "transition-all duration-500 ease-out",
                    colorClass
                  )}
                />
              </svg>
            </div>
          </TooltipTrigger>
          <TooltipContent
            side="top"
            align="center"
            className="px-3 py-2 text-xs"
          >
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold">Context:</span>
                <span className={cn("font-mono", colorClass)}>{percentage.toFixed(1)}%</span>
              </div>
              <div className="text-muted-foreground font-mono text-[10px]">
                {current_tokens.toLocaleString()} / {context_window.toLocaleString()}
              </div>
              {displayModelName && (
                <div className="text-muted-foreground text-[10px] mt-0.5 border-t border-border/50 pt-1">
                  {displayModelName}
                </div>
              )}
            </div>
          </TooltipContent>
        </Tooltip>

        {showCompressButton && (
          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
              <button
                onClick={handleCompress}
                disabled={isCompressing}
                className={cn(
                  "flex items-center justify-center w-5 h-5 rounded transition-colors",
                  "hover:bg-muted text-muted-foreground hover:text-foreground",
                  isCompressing && "opacity-50 cursor-wait",
                )}
                aria-label="Compress context"
              >
                <Shrink className={cn("w-3.5 h-3.5", isCompressing && "animate-pulse")} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" align="center" className="text-xs">
              Compress context
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  )
}
