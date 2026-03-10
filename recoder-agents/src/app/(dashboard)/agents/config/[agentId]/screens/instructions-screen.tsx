'use client';

import React, { useState, useEffect } from 'react';
import { useAgent, useUpdateAgent } from '@/hooks/agents/use-agents';
import { ExpandableMarkdownEditor } from '@/components/ui/expandable-markdown-editor';
import { Label } from '@/components/ui/label';
import { toast } from '@/lib/toast';
import { Skeleton } from '@/components/ui/skeleton';
import { PromptSnippetPicker } from '@/components/agents/config/prompt-snippet-picker';

interface InstructionsScreenProps {
    agentId: string;
}

export function InstructionsScreen({ agentId }: InstructionsScreenProps) {
    const { data: agent, isLoading } = useAgent(agentId);
    const updateAgentMutation = useUpdateAgent();
    const [systemPrompt, setSystemPrompt] = useState('');

    useEffect(() => {
        if (agent?.system_prompt) {
            setSystemPrompt(agent.system_prompt);
        }
    }, [agent?.system_prompt]);

    const isRecoderAgent = agent?.metadata?.is_recoder_default || agent?.metadata?.is_suna_default || false;
    const restrictions = agent?.metadata?.restrictions || {};
    const isEditable = (restrictions.system_prompt_editable !== false) && !isRecoderAgent;

    const handleSave = async (value: string) => {
        if (!isEditable) {
            if (isRecoderAgent) {
                toast.error("System prompt cannot be edited", {
                    description: "Recoder's system prompt is managed centrally.",
                });
            }
            return;
        }

        try {
            await updateAgentMutation.mutateAsync({
                agentId,
                system_prompt: value,
            });
            setSystemPrompt(value);
            toast.success('System prompt updated successfully');
        } catch (error) {
            console.error('Failed to update system prompt:', error);
            toast.error('Failed to update system prompt');
        }
    };

    if (isLoading) {
        return (
            <div className="flex-1 overflow-auto pb-6">
                <div className="px-1 pt-1 space-y-3">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-[500px] w-full rounded-xl" />
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-auto pb-6">
            <div className="px-1 pt-1 flex flex-col h-full">
                <div className="flex items-center justify-between mb-3 flex-shrink-0">
                    <Label className="text-base font-semibold">
                        System Prompt
                    </Label>
                    {isEditable && (
                        <PromptSnippetPicker
                            agentId={agentId}
                            onInsert={(content) => {
                                const newValue = systemPrompt
                                    ? `${systemPrompt}\n\n${content}`
                                    : content;
                                setSystemPrompt(newValue);
                                handleSave(newValue);
                            }}
                        />
                    )}
                </div>
                <div className="flex-1 min-h-[500px]">
                    <ExpandableMarkdownEditor
                        value={systemPrompt}
                        onSave={handleSave}
                        disabled={!isEditable}
                        placeholder="Define how your Worker should behave..."
                        className="h-full"
                    />
                </div>
            </div>
        </div>
    );
}
