# 🧪 USER TEST GUIDE

## ✅ YOUR SYSTEM IS READY!

Everything is configured and running. Now let's test it!

---

## 🎯 MANUAL TESTING (Do This Now)

### Test 1: Sign Up with Email (2 minutes)

1. **Open your browser:**
   ```
   http://localhost:3002/auth/signup
   ```

2. **Fill in the form:**
   - Name: Your Name
   - Email: test@example.com
   - Password: Test123!@# (see strength indicator)
   - Confirm Password: Test123!@#

3. **Click "Create Account"**

4. **Expected Result:**
   - ✅ Loading state shows
   - ✅ Success message appears
   - ✅ Redirected to /dashboard or /onboarding
   - ✅ You're signed in!

---

### Test 2: Onboarding Flow (2 minutes)

If redirected to onboarding:

1. **Step 1: Welcome**
   - ✅ See feature cards
   - ✅ Click "Get Started"

2. **Step 2: Preferences**
   - ✅ Select "Web Development" (or any use case)
   - ✅ Select "Intermediate" (or any level)
   - ✅ Select AI models (one or more)
   - ✅ Choose CLI setup (yes/no)
   - ✅ Click "Continue"

3. **Step 3: Plan Selection**
   - ✅ See Free and Pro plans
   - ✅ Click "Start with Free"

4. **Step 4: Complete**
   - ✅ See success message
   - ✅ See CLI instructions (if you selected yes)
   - ✅ Click "Go to Dashboard"

5. **Expected Result:**
   - ✅ Redirected to /dashboard?welcome=true
   - ✅ Welcome banner shows (green, auto-dismisses)
   - ✅ Dashboard displays your info

---

### Test 3: Dashboard (1 minute)

On the dashboard you should see:

- ✅ Your name and email at top
- ✅ Current plan (Free)
- ✅ Daily sessions quota (0/6 used)
- ✅ Platform cards (CLI, Web, Chat, VS Code)
- ✅ Quick actions
- ✅ Upgrade CTA (since you're on free plan)

**Try clicking around:**
- Sign out button (top right)
- Platform cards
- Quick action links

---

### Test 4: Sign Out & Sign In (1 minute)

1. **Click "Sign Out"** (top right)
   - ✅ Redirected to home or sign-in

2. **Go to sign in:**
   ```
   http://localhost:3002/auth/signin
   ```

3. **Fill in:**
   - Email: test@example.com
   - Password: Test123!@#

4. **Click "Sign In"**

5. **Expected Result:**
   - ✅ Loading state
   - ✅ Success message
   - ✅ Redirected to /dashboard
   - ✅ Same dashboard as before
   - ✅ Session persisted

---

### Test 5: GitHub OAuth (1 minute)

1. **Go to sign in:**
   ```
   http://localhost:3002/auth/signin
   ```

2. **Click "Continue with GitHub"**

3. **Expected Flow:**
   - ✅ Redirects to GitHub
   - ✅ Shows "Authorize Recoder.xyz"
   - ✅ Click "Authorize"
   - ✅ Redirects back to your app
   - ✅ Signed in automatically
   - ✅ Dashboard shows

4. **Check dashboard:**
   - ✅ Your GitHub name shown
   - ✅ GitHub email shown
   - ✅ Profile picture (if you have one)

---

### Test 6: Google OAuth (1 minute)

1. **Sign out first** (if signed in)

2. **Go to sign in:**
   ```
   http://localhost:3002/auth/signin
   ```

3. **Click "Continue with Google"**

4. **Expected Flow:**
   - ✅ Redirects to Google
   - ✅ Shows account selector
   - ✅ Click your account
   - ✅ Redirects back to your app
   - ✅ Signed in automatically
   - ✅ Dashboard shows

---

### Test 7: Session Persistence (30 seconds)

1. **While signed in, refresh the page**
   - ✅ Still signed in
   - ✅ Dashboard loads
   - ✅ No redirect to sign-in

2. **Close browser and reopen**
   - ✅ Still signed in (session lasts 30 days)

---

### Test 8: Protected Routes (30 seconds)

1. **Sign out**

2. **Try to access dashboard directly:**
   ```
   http://localhost:3002/dashboard
   ```

3. **Expected:**
   - ✅ Redirected to /auth/signin
   - ✅ (Or see login required message)

---

## 🎉 SUCCESS CRITERIA

If all tests pass:
- ✅ You can sign up with email
- ✅ You can complete onboarding
- ✅ You can see dashboard
- ✅ You can sign out
- ✅ You can sign back in
- ✅ GitHub OAuth works
- ✅ Google OAuth works
- ✅ Sessions persist
- ✅ Protected routes work

**Congratulations! Your authentication system is fully functional!** 🚀

---

## 🐛 IF SOMETHING DOESN'T WORK

### Sign Up Fails?
- Check browser console for errors
- Check server terminal for errors
- Verify database is connected

### OAuth Redirects but No Sign In?
- Check redirect URIs match exactly in GitHub/Google
- Should be: `http://localhost:3002/api/auth/callback/github`
- Should be: `http://localhost:3002/api/auth/callback/google`

### Dashboard Shows Loading Forever?
- Check browser console
- Look for session errors
- Try signing out and in again

### Session Doesn't Persist?
- Check cookies in browser dev tools
- Look for `recoder` cookies
- Verify `BETTER_AUTH_SECRET` in .env

---

## 📊 WHAT TO CHECK IN DATABASE

After testing, check your database:

```bash
cd app
npx prisma studio
```

You should see:
- ✅ New user in `users` table
- ✅ Session in `sessions` table
- ✅ OAuth account in `accounts` table (if used OAuth)
- ✅ User preferences saved (if completed onboarding)

---

## 🎯 NEXT AFTER TESTING

Once all tests pass:

1. **Celebrate!** 🎉 You have working auth!

2. **Customize:**
   - Change colors in your pages
   - Add your logo
   - Customize dashboard

3. **Build features:**
   - API key management
   - Usage tracking
   - Subscription webhooks
   - Device management

4. **Deploy:**
   - Push to GitHub
   - Deploy app to Vercel
   - Deploy backend to Railway
   - Update OAuth URLs for production

---

## 📞 HELP

If tests fail, check:
1. Server logs in terminal
2. Browser console (F12)
3. `TEST_RESULTS.md` for troubleshooting
4. `FINAL_DELIVERABLES.md` for complete info

---

**Ready? Start Test 1 now!** 

Open: http://localhost:3002/auth/signup 🚀
