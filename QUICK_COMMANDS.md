# ⚡ Quick Commands Reference

## 🎯 One-Command Deploy
```bash
./DEPLOY_NOW.sh
```
This deploys both backend and frontend to Vercel in one go!

---

## 🔧 Manual Deployment

### Deploy Backend Only:
```bash
cd backend
vercel --prod
```

### Deploy Frontend Only:
```bash
cd app
vercel --prod
```

---

## 🧪 Local Testing

### Start Backend:
```bash
cd backend
npm start
# Backend runs on http://localhost:3001
```

### Start Frontend:
```bash
cd app
npm run dev
# Frontend runs on http://localhost:3000
```

### Test Both Together:
```bash
# Terminal 1:
cd backend && npm start

# Terminal 2:
cd app && npm run dev

# Terminal 3:
./test-implementation.sh
```

---

## 📊 Database Commands

### Run Migrations:
```bash
cd app
npx prisma migrate deploy
```

### Generate Prisma Client:
```bash
cd app
npx prisma generate
```

### View Database:
```bash
cd app
npx prisma studio
# Opens at http://localhost:5555
```

### Reset Database (DANGER):
```bash
cd app
npx prisma migrate reset
```

---

## 🧪 Test Commands

### Quick Test:
```bash
./test-implementation.sh
```

### Test Backend Endpoints:
```bash
# Health check
curl http://localhost:3001/health

# Get plans
curl http://localhost:3001/api/billing/plans

# Register user
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!","name":"Test"}'
```

### Test Frontend Pages:
```bash
# Open in browser:
open http://localhost:3000/pricing
open http://localhost:3000/checkout/success
```

---

## 🔐 Payment Provider Setup

### Paddle:
1. **Create account:** https://paddle.com
2. **Get credentials:** Dashboard → Developer Tools → Authentication
3. **Create products:** Dashboard → Catalog → Products
4. **Set webhooks:** Dashboard → Developer Tools → Notifications
   - URL: `https://YOUR-BACKEND/api/webhooks/paddle`

### DODO Pay:
1. **Create account:** https://dodo.ac
2. **Get credentials:** Dashboard → API Keys
3. **Set webhooks:** Dashboard → Webhooks
   - URL: `https://YOUR-BACKEND/api/webhooks/dodo`

---

## 🌐 Vercel Commands

### Login:
```bash
vercel login
```

### View Deployments:
```bash
vercel ls
```

### View Logs:
```bash
vercel logs
vercel logs --follow  # Live logs
```

### Environment Variables:
```bash
# Add variable
vercel env add VARIABLE_NAME production

# List variables
vercel env ls

# Pull variables
vercel env pull
```

### Domain Setup:
```bash
vercel domains add recoder.xyz
vercel domains add api.recoder.xyz
```

---

## 📝 Environment Setup

### Backend Environment:
```bash
cd backend
cp .env.example .env
nano .env  # Edit with your values
```

### Frontend Environment:
```bash
cd app
cp .env.example .env.local
nano .env.local  # Edit with your values
```

---

## 🐛 Debugging Commands

### Check Backend Build:
```bash
cd backend
npm run build
```

### Check Frontend Build:
```bash
cd app
npm run build
```

### Check TypeScript:
```bash
cd backend
npx tsc --noEmit
```

### View Backend Logs:
```bash
cd backend
npm start | tee backend.log
```

---

## 📦 Package Management

### Install All Dependencies:
```bash
pnpm install --recursive
```

### Update Dependencies:
```bash
pnpm update --recursive
```

### Add Package to Backend:
```bash
cd backend
npm install package-name
```

### Add Package to Frontend:
```bash
cd app
npm install package-name
```

---

## 🔄 Git Commands

### Commit Changes:
```bash
git add .
git commit -m "Add payment integration"
git push
```

### Create Branch:
```bash
git checkout -b feature/payment-integration
```

### Merge Branch:
```bash
git checkout main
git merge feature/payment-integration
```

---

## 📚 Documentation Commands

### View Main Guide:
```bash
cat START_HERE.md
```

### View Deployment Guide:
```bash
cat DEPLOYMENT_READY.md
```

### View Testing Guide:
```bash
cat TESTING_GUIDE.md
```

### View All Docs:
```bash
ls -la *.md
```

---

## 🎯 Quick Links

### Development:
- Backend: http://localhost:3001
- Frontend: http://localhost:3000
- Database UI: http://localhost:5555 (prisma studio)

### Documentation:
- START_HERE.md - Quick start
- DEPLOYMENT_READY.md - Deployment guide
- TESTING_GUIDE.md - Testing instructions
- PAYMENT_INTEGRATION_COMPLETE.md - Payment setup

### Production:
- Backend: https://YOUR-BACKEND.vercel.app
- Frontend: https://YOUR-FRONTEND.vercel.app
- Vercel Dashboard: https://vercel.com/dashboard

---

## 💡 Pro Tips

### Fast Iteration:
```bash
# Keep these running in separate terminals:
cd backend && npm start  # Terminal 1
cd app && npm run dev    # Terminal 2
npx prisma studio        # Terminal 3 (optional)
```

### Quick Deploy:
```bash
# Deploy both in parallel:
cd backend && vercel --prod & cd ../app && vercel --prod
```

### Monitor Everything:
```bash
# Watch logs live:
vercel logs --follow --project recoder-backend &
vercel logs --follow --project recoder-app &
```

### Quick Test:
```bash
# One-liner health check:
curl $(vercel ls --prod | grep backend | awk '{print "https://"$2}' | head -1)/health
```

---

**Status:** Ready to use!

**Most Common Commands:**
1. `./DEPLOY_NOW.sh` - Deploy everything
2. `npm start` (in backend) - Start backend
3. `npm run dev` (in app) - Start frontend
4. `./test-implementation.sh` - Run tests

**Next:** Run `./DEPLOY_NOW.sh` to deploy!
