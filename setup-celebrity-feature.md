# Quick Setup Guide - Celebrity Face Mimic Feature

## Prerequisites
- Node.js installed
- PostgreSQL database running
- Existing Emoggle application set up

## Setup Steps

### 1. Install Dependencies (if needed)
```bash
cd signaling-server
npm install
```

### 2. Run Database Migration
```bash
cd signaling-server

# Option A: Using Prisma (recommended)
npx prisma migrate dev --name add_celebrity_faces

# Option B: Manual SQL
# Connect to your PostgreSQL database and run the migration file:
# signaling-server/prisma/migrations/add_celebrity_faces_table.sql
```

### 3. Generate Prisma Client
```bash
cd signaling-server
npx prisma generate
```

### 4. Add Celebrity Face Images

Create test images or download sample celebrity/meme images:

```bash
# Create directories (already done)
# frontend/public/celebrity-faces/memes/
# frontend/public/celebrity-faces/celebrities/
# frontend/public/celebrity-faces/characters/

# Add images to each directory
# Recommended format: JPG or PNG, 640x640px or larger
# Ensure images are copyright-compliant!
```

### 5. Seed Database

**Option A: Using psql**
```bash
psql -U your_user -d your_database

# Then run:
INSERT INTO celebrity_faces (name, category, image_url, difficulty) VALUES
('Drake No', 'meme', '/celebrity-faces/memes/drake-no.jpg', 'easy'),
('Success Kid', 'meme', '/celebrity-faces/memes/success-kid.jpg', 'easy'),
('Surprised Pikachu', 'meme', '/celebrity-faces/memes/surprised-pikachu.jpg', 'medium');
```

**Option B: Create a seed script**
Create `signaling-server/seed-celebrities.js`:
```javascript
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seed() {
  const celebrities = [
    { name: 'Drake No', category: 'meme', imageUrl: '/celebrity-faces/memes/drake-no.jpg', difficulty: 'easy' },
    { name: 'Success Kid', category: 'meme', imageUrl: '/celebrity-faces/memes/success-kid.jpg', difficulty: 'easy' },
    { name: 'Surprised Pikachu', category: 'meme', imageUrl: '/celebrity-faces/memes/surprised-pikachu.jpg', difficulty: 'medium' },
  ];

  for (const celeb of celebrities) {
    await prisma.celebrityFace.create({ data: celeb });
  }
  
  console.log('Seeded', celebrities.length, 'celebrity faces');
}

seed().catch(console.error).finally(() => prisma.$disconnect());
```

Run it:
```bash
node seed-celebrities.js
```

### 6. Start the Application

**Terminal 1 - Backend:**
```bash
cd signaling-server
npm run dev
# Server should start on port 3001
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
# Frontend should start on port 3000
```

### 7. Test the Feature

1. Open http://localhost:3000 in your browser
2. Log in or create an account
3. Click "Celebrity Face Mimic" button
4. Test matchmaking (open another browser tab/window for 2nd player)
5. Verify celebrity face loads in center
6. Check video streaming works
7. Test scoring and results screen

## Verification Checklist

- [ ] Database table `celebrity_faces` created
- [ ] Celebrity face records inserted
- [ ] API endpoint `/api/celebrity/random` returns data
- [ ] Frontend loads celebrity images correctly
- [ ] Matchmaking connects two users
- [ ] Video streaming works in celebrity mode
- [ ] Countdown appears before round
- [ ] Celebrity face displays in center
- [ ] Scores calculate and submit
- [ ] Results screen shows winner
- [ ] Chat functionality works
- [ ] Can play multiple rounds

## Troubleshooting

### Error: "Prisma schema not found"
```bash
cd signaling-server
npx prisma generate
```

### Error: "Celebrity face not found"
- Check database has celebrity_faces records
- Verify API endpoint: http://localhost:3001/api/celebrity/random
- Check image files exist in public/celebrity-faces/ directory

### Error: "Database unavailable"
- Verify DATABASE_URL in `.env` file
- Check PostgreSQL is running
- Test connection: `psql -U your_user -d your_database`

### Images not loading in frontend
- Verify image paths match database records
- Check image files are in `frontend/public/celebrity-faces/`
- Ensure image URLs start with `/celebrity-faces/` (not `./` or relative paths)

### Matchmaking not working
- Check signaling server is running on port 3001
- Verify NEXT_PUBLIC_SIGNALING_SERVER_URL in frontend `.env.local`
- Open browser console to check for WebSocket errors

## Testing with Sample Data

If you don't have celebrity images yet, you can use emoji images as placeholders:

```sql
INSERT INTO celebrity_faces (name, category, image_url, difficulty) VALUES
('Happy Face', 'test', '/placeholder.jpg', 'easy'),
('Sad Face', 'test', '/placeholder.jpg', 'easy');
```

Create a simple placeholder:
```bash
# In frontend/public/
# Create a 640x640px colored square as placeholder.jpg
```

## Next Steps

After basic setup works:

1. **Add Real Celebrity Images**: Replace test data with actual celebrity/meme images
2. **Implement Facial Landmarks**: Extract and store landmark data for better scoring
3. **Optimize Performance**: Implement image caching and CDN
4. **Add More Features**: See CELEBRITY_MIMIC_README.md for advanced features
5. **Deploy to Production**: Update production database and deploy code

## Support

For issues or questions:
- Check CELEBRITY_MIMIC_README.md for detailed documentation
- Review ARCHITECTURE.md for system architecture
- Check FEATURES.md for original specifications

Enjoy the Celebrity Face Mimic feature! 🎭
