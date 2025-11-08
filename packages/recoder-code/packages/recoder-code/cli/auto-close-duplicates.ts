#!/usr/bin/env node

import { autoCloseDuplicates } from '../api/githubApi';

autoCloseDuplicates().catch(console.error);
