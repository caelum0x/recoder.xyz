/**
 * Deployment Providers Plugin for Craft Code
 * Provides multi-platform deployment capabilities
 */

import { EventEmitter } from 'events';
import { spawn, exec } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';
import {
  Plugin,
  PluginContext, 
  PluginMetadata,
  WorkspaceAPI,
  PluginUI
} from '../../plugin-sdk/types';
