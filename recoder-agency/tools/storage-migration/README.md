# Storage Migration Tool

A utility script for migrating files from Vercel Blob storage to Supabase storage.

## Overview

This tool migrates files from Vercel Blob storage to Supabase storage by:
1. Listing files from Vercel Blob with a specific prefix
2. Downloading each file from Vercel
3. Uploading the file to Supabase storage
4. Providing progress and status information with colored console output

## Requirements

- Node.js v22.14+ (for native TypeScript and built-in .env file support)
- The following environment variables must be set:
  - `SUPABASE_URL` - Your Supabase project URL
  - `SUPABASE_SERVICE_KEY` - Supabase service role key
  - `VERCEL_BLOB_KEY` - Vercel Blob read access token

### How to Get Environment Variables

- SUPABASE_URL
- SUPABASE_SERVICE_KEY

    Access the Supabase dashboard and go to Settings -> Data API.
    The Project URL is the value to set as SUPABASE_URL.
    The service role under Project API Keys is the value to set as SUPABASE_SERVICE_KEY.

    Please handle the service role API KEY carefully as it has administrator privileges.

- VERCEL_BLOB_KEY

    Access the Vercel dashboard, click on Connect in the header, and obtain it from the dialog that appears.

## Usage

### Option 1: Using environment variables directly

```bash
# Set required environment variables
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_KEY="your-service-key"
export VERCEL_BLOB_KEY="your-vercel-blob-key"

# Run the migration script
node --experimental-strip-types index.ts
```

### Option 2: Using a .env file (Node.js v22.14+ built-in support)

```bash
# Create a .env file with the following content:
# SUPABASE_URL=https://your-project.supabase.co
# SUPABASE_SERVICE_KEY=your-service-key
# VERCEL_BLOB_KEY=your-vercel-blob-key

# Run with built-in env file support
node --env-file=.env --experimental-strip-types ./index.ts
```


## Features

- Processes files in batches with cursor-based pagination
- Provides colorful console output for status monitoring
- Handles files that already exist in the target storage
- Reports success, already existing, and error counts
- Processes files in parallel for efficiency

## Customization

- The `prefix` parameter in the Vercel `list()` function can be modified to target specific files
- The Supabase storage bucket name ("experiment") can be changed as needed
- Batch size can be adjusted by modifying the `limit` parameter in the list function
