# 🔧 Quick Fixes Guide
## Critical Issues and Solutions

---

## 🔴 Issue #1: Database Tables Missing (CRITICAL)

**Error:** `relation "chat_sessions" does not exist`

**Cause:** Neon database doesn't have the required tables for recoder-web

### **Solution:**

#### **Step 1: Add DATABASE_URL to .env.local**

```bash
cd /Users/arhansubasi/recoder.xyz/recoder-web
```

Add to `.env.local`:
```bash
DATABASE_URL="your-neon-database-url-here"
```

**Get your Neon URL from:**
1. Go to https://console.neon.tech
2. Select your project
3. Copy the connection string
4. It should look like: `postgresql://user:password@host/dbname?sslmode=require`

#### **Step 2: Run Database Setup**

```bash
cd /Users/arhansubasi/recoder.xyz/recoder-web
node setup-database.js
```

**This will create:**
- `chat_sessions` table
- `chat_messages` table
- `projects` table
- `anonymous_sessions` table

#### **Step 3: Restart Development Server**

```bash
npm run dev
```

---

## 🟡 Issue #2: Account Image Broken

**Symptom:** Profile image doesn't load

### **Solution:**

The image is likely missing or path is incorrect. Check:

1. **In recoder-web Header component:**
```bash
# Find the header component
find /Users/arhansubasi/recoder.xyz/recoder-web/app/components -name "*Header*" -o -name "*header*"
```

2. **Common fixes:**
   - Use initials avatar if image fails
   - Check if user.image path is correct
   - Add fallback to default avatar

---

## 🟡 Issue #3: Settings Pages Are Mock

**Pages affected:**
- Profile
- Appearance
- Security
- Notifications
- Integrations

**Current Status:**
- ✅ **AI Providers** - REAL (already implemented)
- ⚠️  **Others** - Mock/placeholder

**Priority:** Low (can be implemented post-launch)

**What works now:**
- API key management (most critical)
- Account overview shows beta status

---

## 🟢 Issue #4: Launch IDE API Key Flow

**Current behavior:**
- User clicks "Launch Web IDE"
- If no API key → shows prompt ✅ (correct)
- After adding key → doesn't redirect to Web IDE ❌

### **Solution:**

After user adds API key in `/settings/ai-providers`, redirect to Web IDE:

```typescript
// In /app/app/settings/ai-providers/page.tsx
// After successful API key save:
const webIdeUrl = process.env.NEXT_PUBLIC_RECODER_WEB_URL || 'http://localhost:5173';
window.location.href = webIdeUrl;
```

---

## 🟣 Issue #5: Missing CLI Commands

**Commands mentioned but not implemented:**
1. ✅ `recoder web sync` - IMPLEMENTED
2. ✅ `recoder web download` - IMPLEMENTED
3. ❌ `recoder agent create @expert` - MISSING
4. ❌ `recoder file create app.ts` - MISSING
5. ❌ `recoder sandbox enable` - MISSING

**Priority:** Medium (nice-to-have for launch)

**Where to add:**
```bash
/packages/recoder-code/packages/cli/src/commands/
```

---

## ⚡ Quick Testing Checklist

After fixes:

```bash
# 1. Start main app
cd /Users/arhansubasi/recoder.xyz/app
npm run dev
# → http://localhost:3000

# 2. Start recoder-web
cd /Users/arhansubasi/recoder.xyz/recoder-web
npm run dev
# → http://localhost:5173

# 3. Test flow:
# - Sign up → Add API key → Launch IDE
# - Create project in Web IDE
# - Check /projects page
# - Try CLI: recoder web list
```

---

## 📋 Environment Variables Needed

### **Main App (.env)**
```bash
# Better Auth
BETTER_AUTH_SECRET="your-secret-here"
BETTER_AUTH_URL="http://localhost:3000"

# Database
DATABASE_URL="postgresql://..."

# OAuth (optional for now)
GITHUB_CLIENT_ID=""
GITHUB_CLIENT_SECRET=""
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""

# Web IDE URL
NEXT_PUBLIC_RECODER_WEB_URL="http://localhost:5173"
RECODER_WEB_URL="http://localhost:5173"
```

### **Recoder Web (.env.local)**
```bash
# Neon Database (CRITICAL!)
DATABASE_URL="postgresql://..."

# Main app URL
VITE_API_URL="http://localhost:3000"

# Optional: AI API keys (for environment fallback)
OPENROUTER_API_KEY=""
ANTHROPIC_API_KEY=""
OPENAI_API_KEY=""
```

---

## 🎯 Priority Order

1. **🔴 Fix database (CRITICAL)** - Web IDE won't work without this
2. **🟡 Fix account image** - Visual issue, not blocking
3. **🟢 Add redirect after API key** - UX improvement
4. **🟣 Add missing CLI commands** - Nice-to-have
5. **🟡 Implement real settings pages** - Post-launch

---

## 🚨 If Database Setup Fails

**Manual SQL execution:**

1. Go to Neon Console: https://console.neon.tech
2. Select your project
3. Go to "SQL Editor"
4. Copy contents of `/recoder-web/app/lib/.server/db/chat-history-schema.sql`
5. Paste and run

---

## ✅ Success Indicators

You'll know it's working when:
- ✅ No more `relation "chat_sessions" does not exist` errors
- ✅ Web IDE chat history saves
- ✅ `/projects` page shows Web IDE projects
- ✅ Profile image loads
- ✅ After adding API key, redirects to Web IDE

---

## 📞 Need Help?

**Common errors:**

1. **"Cannot find module"** → Run `npm install`
2. **"Port already in use"** → Kill process on that port
3. **"Database connection failed"** → Check DATABASE_URL format
4. **"Unauthorized"** → Check BETTER_AUTH_SECRET matches in both apps

---

Good luck! 🚀
