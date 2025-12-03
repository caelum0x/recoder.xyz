# 🚀 RECODER.XYZ PRODUCTION PLAN
**Created:** 2025-12-03
**Focus:** Production-ready functionality FIRST, features LATER

---

## 🔴 THE REAL PROBLEM

### WebContainer is Blocking Production

| Issue | Impact | Root Cause |
|-------|--------|------------|
| npm install hangs/fails | Can't build projects | WebContainer Turbo limitations |
| CLI won't install | Can't use recoder commands | WebContainer jsh limitations |
| EEXIST cache errors | Random failures | WebContainer npm cache bugs |
| License unknown | **Legal risk in production** | Using StackBlitz API commercially |

### The Hard Truth

**WebContainer is designed for demos, not production.**

- StackBlitz uses it for their free tier (limited)
- Commercial use requires licensing (unknown cost)
- Technical limitations are BY DESIGN (to upsell)
- You're hitting rate limits / restrictions because you're unlicensed

---

## 🎯 DECISION: HYBRID ARCHITECTURE

### Why Hybrid?

| Approach | Pros | Cons |
|----------|------|------|
| WebContainer Only | Already built, no server | Licensing risk, limited, unreliable |
| Docker Only | Full control, production-ready | Requires rewrite, server costs |
| **Hybrid** ✅ | Best of both, clear upgrade path | Some complexity |

### The Plan

```
┌─────────────────────────────────────────────────────────┐
│  FREE TIER (WebContainer) - Marketing/Demo              │
│  ✅ Simple projects only                                │
│  ✅ Public npm packages                                 │
│  ⚠️ Clear "limitations" messaging                       │
│  ⚠️ "Upgrade for full features" prompts                 │
└─────────────────────────────────────────────────────────┘
                         ↓ Upgrade ($20-30/month)
┌─────────────────────────────────────────────────────────┐
│  PRO TIER (Docker Backend) - Production                 │
│  ✅ Full npm registry (private packages)                │
│  ✅ Real databases (PostgreSQL, Redis)                  │
│  ✅ Native addons work                                  │
│  ✅ No WebContainer limitations                         │
│  ✅ Reliable, fast, production-ready                    │
└─────────────────────────────────────────────────────────┘
```

---

## 📋 PHASE 1: IMMEDIATE (This Week)

### Goal: Make WebContainer tier WORK for demos

**Time: 2-3 days**

#### 1.1 Fix Critical WebContainer Issues (4 hours)

```bash
# These are already partially fixed per CURRENT_ISSUES.md
```

| Fix | File | Time | Status |
|-----|------|------|--------|
| CLI exec command | `cli-installer.ts` | Done | ✅ |
| npm cache clear | `package-manager.ts` | Done | ✅ |
| MCP server-side | `filesystem.ts` | Done | ✅ |

**Remaining:**
- [ ] Test npm install reliability (30 min)
- [ ] Add retry logic with cache clear (1 hour)
- [ ] Add clear error messages for WebContainer limits (1 hour)

#### 1.2 Add Limitation Messaging (2 hours)

```typescript
// When WebContainer fails, show upgrade prompt
if (isWebContainerLimitation(error)) {
  toast.warning(
    '⚠️ This feature requires Pro tier',
    {
      description: 'WebContainer has limitations. Upgrade for full functionality.',
      action: { label: 'Upgrade', onClick: () => navigate('/upgrade') }
    }
  );
}
```

**Files to modify:**
- [ ] `action-runner.ts` - Add limitation detection
- [ ] `package-manager.ts` - Add upgrade prompts
- [ ] Create `/upgrade` landing page

#### 1.3 Contact StackBlitz (1 hour)

**CRITICAL: You need licensing info regardless of decision**

```
To: sales@stackblitz.com
Subject: Commercial License Inquiry - recoder.xyz

Hi StackBlitz team,

We're building recoder.xyz, an AI-powered development platform using WebContainer API.

Questions:
1. What are the commercial licensing requirements?
2. Pricing structure (per-seat, usage-based, flat fee)?
3. What limitations exist on unlicensed usage?
4. Support/SLA options?

Current usage: ~X users, Y projects/day

Thanks,
[Your name]
```

---

## 📋 PHASE 2: DOCKER BACKEND (Weeks 2-4)

### Goal: Production-ready execution environment

**Time: 2-3 weeks**

#### 2.1 Architecture

```
User Browser
     │
     ▼
┌─────────────────┐
│  Remix Server   │ ← Your existing backend
│  (Cloudflare)   │
└────────┬────────┘
         │ API calls
         ▼
┌─────────────────┐
│  Docker API     │ ← New service (DigitalOcean/Railway)
│  Server         │
└────────┬────────┘
         │ manages
         ▼
┌─────────────────┐
│  User Container │ ← Isolated per project
│  - Node.js 20   │
│  - Full npm     │
│  - Real fs      │
└─────────────────┘
```

#### 2.2 Implementation Steps

**Week 2: Core Docker Service**
- [ ] Set up Docker API server (Node.js + Dockerode)
- [ ] Container lifecycle (create, start, stop, destroy)
- [ ] File sync (browser ↔ container)
- [ ] WebSocket terminal streaming
- [ ] Basic security (resource limits, network isolation)

**Week 3: Integration**
- [ ] Connect Remix backend to Docker API
- [ ] Tier detection (free vs pro)
- [ ] Seamless switching between WebContainer/Docker
- [ ] Preview URL generation

**Week 4: Polish & Deploy**
- [ ] Auto-cleanup idle containers
- [ ] Monitoring & logging
- [ ] Scale testing
- [ ] Production deployment

#### 2.3 Cost Estimate

| Service | Cost | Notes |
|---------|------|-------|
| DigitalOcean Droplet | $48/mo | 4 vCPU, 8GB RAM |
| Or Railway | $20-50/mo | Usage-based |
| Or Fly.io | $30-60/mo | Edge deployment |

**Per-user cost at scale:**
- 100 users: ~$0.50/user/month
- 1000 users: ~$0.10/user/month

---

## 📋 PHASE 3: FEATURE COMPLETION (Weeks 5-6)

### Goal: Competitive feature set

**Only AFTER Docker backend works**

| Feature | Priority | Time | Notes |
|---------|----------|------|-------|
| GitHub sync (push/pull/commit) | P1 | 8h | Already partially built |
| Context management fix | P1 | 4h | Agent loses track |
| Claude-style file tools | P1 | 14h | grep, edit, etc. |
| UI polish | P2 | 4h | Colors, scroll, layout |
| MCP verification | P2 | 2h | Ensure it works |

---

## 🚫 WHAT NOT TO DO

1. **Don't add new features** until core works
2. **Don't ignore licensing** - legal risk
3. **Don't keep fighting WebContainer** - it's designed to be limited
4. **Don't deploy to production** with current WebContainer issues

---

## ✅ SUCCESS CRITERIA

### Phase 1 Complete When:
- [ ] npm install works 90%+ of the time
- [ ] Clear error messages for limitations
- [ ] Upgrade prompts in place
- [ ] StackBlitz licensing info received

### Phase 2 Complete When:
- [ ] Docker backend deployed
- [ ] Pro users get Docker execution
- [ ] Free users get WebContainer (with limits)
- [ ] Seamless tier switching

### Phase 3 Complete When:
- [ ] All P1 features working
- [ ] Agent can work autonomously
- [ ] GitHub sync functional
- [ ] UI polished

---

## 📊 TIMELINE SUMMARY

```
Week 1: Fix WebContainer + Add upgrade prompts + Contact StackBlitz
Week 2: Docker API server core
Week 3: Docker integration with Remix
Week 4: Docker polish + deploy
Week 5: Feature completion (GitHub, context, file tools)
Week 6: UI polish + testing + launch
```

**Total: 6 weeks to production-ready**

---

## 🎬 IMMEDIATE NEXT ACTIONS

### Today:
1. [ ] Send StackBlitz licensing email
2. [ ] Test current npm install reliability
3. [ ] Add upgrade prompt component

### This Week:
4. [ ] Create /upgrade landing page
5. [ ] Add limitation detection to action-runner
6. [ ] Start Docker API server design

### Decision Point (End of Week 1):
- If StackBlitz license is affordable → Consider WebContainer-only
- If StackBlitz license is expensive → Proceed with Docker hybrid
- If no response → Assume unlicensed = risky, proceed with Docker

---

## 💡 KEY INSIGHT

**You're not building a demo tool. You're building a production platform.**

WebContainer is great for:
- StackBlitz's free tier
- Quick demos
- Marketing funnels

WebContainer is NOT great for:
- Production workloads
- Enterprise customers
- Reliable execution
- Your mission ("production-ready code")

**The hybrid approach lets you:**
- Keep WebContainer for marketing (free tier)
- Use Docker for production (paid tier)
- Avoid licensing uncertainty
- Match competitors (Replit, CodeSandbox, Gitpod all use Docker)

---

## 📞 SUPPORT

Questions about this plan? The key decisions are:

1. **Licensing** - Must contact StackBlitz
2. **Docker provider** - DigitalOcean vs Railway vs Fly.io
3. **Timeline** - Can compress to 4 weeks if needed
4. **Features** - Can defer Phase 3 for faster launch

Focus on PRODUCTION FIRST. Features can wait.
