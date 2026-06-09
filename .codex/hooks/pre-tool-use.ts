#!/usr/bin/env -S node --import tsx
import { runHookCli } from '../../packages/agent-hooks/src/index.ts';

void runHookCli('pre-tool-use');
