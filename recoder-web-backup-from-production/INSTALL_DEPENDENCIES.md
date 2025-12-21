# Install Required Dependencies

Run these commands to install the required packages for download and GitHub push features:

```bash
cd /Users/arhansubasi/recoder.xyz/recoder-web
npm install jszip @octokit/rest
```

## Dependencies Added:
- `jszip` - For creating ZIP files of projects
- `@octokit/rest` - For GitHub API integration

## Database Migration

Run the migration to create the github_pushes table:

```bash
cd /Users/arhansubasi/recoder.xyz/app
psql $DATABASE_URL -f prisma/migrations/20251129_add_github_pushes/migration.sql
```

Or using Prisma:

```bash
npx prisma db push
```
