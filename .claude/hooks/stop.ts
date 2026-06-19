#!/usr/bin/env -S node --import tsx
import { emitClaudeCodeHook } from './claude-code-bridge.ts';

void emitClaudeCodeHook('stop');
