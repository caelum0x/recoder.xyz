# 🚨 URGENT: API Key Regeneration Guide

## Security Incident Summary
The recoder-cli-router package v1.1.5 was published with exposed API keys, triggering security alerts from:
- ✅ Anthropic (Claude)
- ✅ OpenRouter 
- ✅ Groq
- ✅ Google (Gemini)
- ⚠️  Other providers may be affected

## Required Actions

### 1. Anthropic Claude API Keys
```bash
# Visit: https://console.anthropic.com/settings/keys
# Actions needed:
# 1. Revoke current key: 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
# 2. Generate new key
# 3. Update ANTHROPIC_API_KEY in all environments
```

### 2. Groq API Keys
```bash
# Visit: https://console.groq.com/keys
# Actions needed:
# 1. Revoke current key: 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
# 2. Generate new key
# 3. Update GROQ_API_KEY in all environments
```

### 3. Google Gemini API Keys
```bash
# Visit: https://aistudio.google.com/app/apikey
# Actions needed:
# 1. Revoke current key: AIzaSyC4nq9suWOt1qQ2SCL4b1wBekMEjBD5Rs4
# 2. Generate new key
# 3. Update GOOGLE_API_KEY in all environments
```

### 4. OpenRouter API Keys
```bash
# Visit: https://openrouter.ai/keys
# Check for any exposed keys and regenerate if needed
```

## Environment Files to Update

### Development (.env.local)
```bash
# Update these immediately:
ANTHROPIC_API_KEY=sk-ant-NEW_KEY_HERE
GROQ_API_KEY=gsk_NEW_KEY_HERE
GOOGLE_API_KEY=AIza_NEW_KEY_HERE
OPENAI_API_KEY=sk-NEW_KEY_HERE  # If using OpenAI
```

### Production (.env.production)
```bash
# Update production environment variables
# Through your deployment platform (Vercel, AWS, etc.)
```

### Backend Environment
```bash
# Update backend/.env with new keys
```

### CLI Package Environment
```bash
# Update packages/cli/.env with new keys
```

## Deployment Updates Required

### 1. Vercel/Netlify Environment Variables
- Go to your deployment dashboard
- Update all AI API key environment variables
- Redeploy applications

### 2. GitHub Actions Secrets
```bash
# Update repository secrets:
ANTHROPIC_API_KEY
GROQ_API_KEY  
GOOGLE_API_KEY
OPENAI_API_KEY
```

### 3. Docker/Kubernetes Secrets
```bash
# Update container secrets
kubectl create secret generic ai-keys \
  --from-literal=ANTHROPIC_API_KEY=sk-ant-NEW_KEY \
  --from-literal=GROQ_API_KEY=gsk_NEW_KEY \
  --from-literal=GOOGLE_API_KEY=AIza_NEW_KEY \
  --dry-run=client -o yaml | kubectl apply -f -
```

## Files to Check for Hardcoded Keys

### High Priority
- [ ] `packages/cli/src/api/providers/*.ts`
- [ ] `backend/src/config/*.js`
- [ ] `recoder-web/api/providers/*.ts`
- [ ] `.github/workflows/*.yml`
- [ ] `docker-compose.yml`

### Medium Priority
- [ ] All test files (`**/*.test.ts`, `**/*.spec.ts`)
- [ ] Configuration files (`config/`, `*.config.js`)
- [ ] Documentation examples

## Verification Steps

### 1. Test New Keys
```bash
# Test Anthropic
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: YOUR_NEW_ANTHROPIC_KEY" \
  -H "content-type: application/json" \
  -d '{"model":"claude-3-sonnet-20240229","max_tokens":10,"messages":[{"role":"user","content":"test"}]}'

# Test Groq  
curl https://api.groq.com/openai/v1/chat/completions \
  -H "Authorization: Bearer YOUR_NEW_GROQ_KEY" \
  -H "content-type: application/json" \
  -d '{"model":"llama3-70b-8192","messages":[{"role":"user","content":"test"}],"max_tokens":10}'

# Test Gemini
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=YOUR_NEW_GEMINI_KEY" \
  -H "content-type: application/json" \
  -d '{"contents":[{"parts":[{"text":"test"}]}]}'
```

### 2. Test CLI Functionality
```bash
# Test CLI with new keys
ANTHROPIC_API_KEY=sk-ant-NEW_KEY npx tsx src/index.ts "test command"
```

### 3. Test Web Platform
```bash
# Start development server and test AI features
npm run dev:all
```

## Security Improvements

### 1. Add API Key Validation
```typescript
// Add to environment validation
const requiredKeys = [
  'ANTHROPIC_API_KEY',
  'GROQ_API_KEY', 
  'GOOGLE_API_KEY'
];

requiredKeys.forEach(key => {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  if (process.env[key].length < 20) {
    throw new Error(`Invalid ${key}: too short`);
  }
});
```

### 2. Enhanced .gitignore
```bash
# Add to .gitignore
.env*
!.env.example
*.key
*.pem
config/secrets/*
```

### 3. Pre-commit Hook
```bash
# Add pre-commit hook to check for secrets
#!/bin/sh
if grep -r "sk-ant-\|gsk_\|AIza" --exclude-dir=node_modules .; then
  echo "❌ Potential API keys found in code!"
  exit 1
fi
```

## Monitoring Setup

### 1. API Key Rotation Schedule
- Set calendar reminders to rotate keys every 90 days
- Document key rotation dates

### 2. Usage Monitoring
- Monitor API usage for unexpected spikes
- Set up billing alerts

### 3. Security Scanning
```bash
# Add to CI/CD pipeline
npm audit
git secrets --scan
truffleHog --regex --entropy=False .
```

## Timeline

- **Immediate (0-2 hours)**: Revoke exposed keys
- **Day 1**: Generate and deploy new keys
- **Day 2**: Verify all systems working
- **Week 1**: Implement enhanced security measures
- **Month 1**: Review and audit for any missed keys

## Contact Information

If you need help with any provider:
- **Anthropic Support**: support@anthropic.com
- **Groq Support**: support@groq.com  
- **Google Cloud Support**: cloud.google.com/support

## Checklist

- [ ] Anthropic keys revoked and regenerated
- [ ] Groq keys revoked and regenerated  
- [ ] Google keys revoked and regenerated
- [ ] OpenRouter keys checked and updated
- [ ] Development environment updated
- [ ] Production environment updated
- [ ] CI/CD secrets updated
- [ ] All systems tested and working
- [ ] Security improvements implemented
- [ ] Documentation updated
- [ ] Team notified of new keys (securely)

---

**⚠️ Remember: Never commit API keys to version control again!**