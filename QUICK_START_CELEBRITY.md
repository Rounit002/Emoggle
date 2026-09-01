# Celebrity Face Mimic - Quick Start Guide

## 🚀 5-Minute Setup

### Step 1: Database Migration (2 min)
```bash
cd signaling-server
npx prisma migrate dev --name add_celebrity_faces
npx prisma generate
```

### Step 2: Seed Sample Data (1 min)
```bash
cd signaling-server
node seed-celebrities.js
```

### Step 3: Add Images (Optional - 2 min)
For testing, the feature will work without actual images. Add real images later:
```
frontend/public/celebrity-faces/
├── memes/drake-no.jpg
├── celebrities/leo-dicaprio-cheers.jpg
└── characters/joker-smile.jpg
```

### Step 4: Start Servers
**Terminal 1:**
```bash
cd signaling-server
npm run dev
```

**Terminal 2:**
```bash
cd frontend
npm run dev
```

### Step 5: Test It! 🎭
1. Open http://localhost:3000
2. Click "Celebrity Face Mimic" button
3. Open another browser tab (incognito mode) for 2nd player
4. Both users join and get matched
5. Mimic the celebrity face that appears!

---

## 🎯 Quick Test Without Images

If you don't have celebrity images yet, the feature will still work. The celebrity face display will show a loading spinner, but matchmaking, video, scoring, and results will all function.

To add a test placeholder:
```bash
# Create a simple colored square as a placeholder
# Save as frontend/public/celebrity-faces/test.jpg
```

---

## ✅ Verification

**Check API Works:**
```bash
curl http://localhost:3001/api/celebrity/random
# Should return JSON with celebrity data
```

**Check Database:**
```bash
psql -U your_user -d your_database
SELECT * FROM celebrity_faces;
# Should show seeded celebrity records
```

---

## 🐛 Troubleshooting

**"Prisma Client not found"**
```bash
cd signaling-server
npx prisma generate
```

**"Database unavailable"**
- Check DATABASE_URL in `.env`
- Verify PostgreSQL is running

**"Celebrity face not found"**
- Run seed script: `node seed-celebrities.js`
- Check database has records: `SELECT COUNT(*) FROM celebrity_faces;`

**Matchmaking not working**
- Open browser console, check for errors
- Verify signaling server on port 3001
- Check NEXT_PUBLIC_SIGNALING_SERVER_URL in frontend `.env.local`

---

## 📖 Full Documentation

For complete details, see:
- **IMPLEMENTATION_SUMMARY.md** - What was built
- **CELEBRITY_MIMIC_README.md** - Complete feature docs
- **setup-celebrity-feature.md** - Detailed setup guide

---

## 🎉 You're Done!

The Celebrity Face Mimic feature is now ready to use. Add more celebrity faces, customize the experience, and enjoy!

**Status**: ✅ Ready to Test
**Time**: < 5 minutes
