import { type A2AMessage, type A2ATextPart, type ClaudeCodeWireMessage, type CodexWireMessage, type RecoderA2AEnvelope, type RecoderAgentCard } from './types';
export declare function createRecoderAgentCard(input: {
    name: string;
    description: string;
    version: string;
    url: string;
    skills: RecoderAgentCard['skills'];
    defaultInputModes?: string[];
    defaultOutputModes?: string[];
    supportsStreaming?: boolean;
    supportsPushNotifications?: boolean;
}): RecoderAgentCard;
export declare function envelopeToA2ATextPart(envelope: RecoderA2AEnvelope): A2ATextPart;
export declare function envelopeToA2AMessage(envelope: RecoderA2AEnvelope, role?: A2AMessage['role']): A2AMessage;
export declare function a2aTextPartToEnvelope(part: A2ATextPart): RecoderA2AEnvelope;
export declare function codexToEnvelope(input: {
    message: CodexWireMessage;
    from: RecoderA2AEnvelope['from'];
    to: RecoderA2AEnvelope['to'];
    messageId: string;
    threadId: string;
    now?: string;
}): RecoderA2AEnvelope;
export declare function envelopeToCodex(envelope: RecoderA2AEnvelope): CodexWireMessage;
export declare function claudeCodeToEnvelope(input: {
    message: ClaudeCodeWireMessage;
    from: RecoderA2AEnvelope['from'];
    to: RecoderA2AEnvelope['to'];
    messageId: string;
    threadId: string;
    now?: string;
}): RecoderA2AEnvelope;
export declare function envelopeToClaudeCode(envelope: RecoderA2AEnvelope): ClaudeCodeWireMessage;
