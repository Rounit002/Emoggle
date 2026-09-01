/**
 * Celebrity Face Mimic - Database Seed Script
 * Populates the celebrity_faces table with sample data.
 *
 * Each row may also carry a hand-curated `expressionProfile` — a
 * normalized (0..1) target the local scorer compares the player's
 * webcam feed against. Profiles are OPTIONAL: if you don't ship
 * one for a row, the front-end falls back to a deterministic
 * category × difficulty default in
 * `frontend/app/lib/celebrityScoring.ts` so the row still works.
 *
 * Usage:
 *   node seed-celebrities.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD } = process.env;
if (!process.env.DATABASE_URL && DB_HOST && DB_USER && DB_NAME) {
  process.env.DATABASE_URL = `postgresql://${encodeURIComponent(DB_USER)}:${encodeURIComponent(DB_PASSWORD || '')}@${DB_HOST}:${DB_PORT || 5432}/${DB_NAME}`;
}
const { pool, initSchema } = require('./db');

const sampleCelebrities = [
  // Pilot target: the only Celebrity Face asset currently shipped.
  {
    name: 'IShowSpeed Squint',
    category: 'celebrity',
    imageUrl: '/celebrity-faces/memes/ishowspeed-squint.jpg',
    difficulty: 'medium',
    expressionProfile: {
      mouthOpen: 0.0,
      mouthWidth: 0.28,
      mouthSmile: 0.0,
      mouthFrown: 0.15,
      eyeOpen: 0.08,
      eyeSquint: 0.92,
      browRaise: 0.0,
      browDown: 0.55,
      lipPucker: 0.78,
    },
  },
  // Memes
  {
    name: 'Drake No',
    category: 'meme',
    imageUrl: '/celebrity-faces/memes/drake-no.jpg',
    difficulty: 'easy',
    expressionProfile: {
      mouthOpen: 0.0,
      mouthWidth: 0.30,
      mouthSmile: 0.0,
      mouthFrown: 0.55,
      eyeOpen: 0.55,
      eyeSquint: 0.0,
      browRaise: 0.0,
      browDown: 0.35,
      lipPucker: 0.0,
    },
  },
  {
    name: 'Drake Yes',
    category: 'meme',
    imageUrl: '/celebrity-faces/memes/drake-yes.jpg',
    difficulty: 'easy',
    expressionProfile: {
      mouthOpen: 0.0,
      mouthWidth: 0.55,
      mouthSmile: 0.65,
      mouthFrown: 0.0,
      eyeOpen: 0.55,
      eyeSquint: 0.0,
      browRaise: 0.40,
      browDown: 0.0,
      lipPucker: 0.0,
    },
  },
  {
    name: 'Success Kid',
    category: 'meme',
    imageUrl: '/celebrity-faces/memes/success-kid.jpg',
    difficulty: 'easy',
    expressionProfile: {
      mouthOpen: 0.0,
      mouthWidth: 0.45,
      mouthSmile: 0.7,
      mouthFrown: 0.0,
      eyeOpen: 0.50,
      eyeSquint: 0.4,
      browRaise: 0.0,
      browDown: 0.0,
      lipPucker: 0.0,
    },
  },
  {
    name: 'Surprised Pikachu',
    category: 'meme',
    imageUrl: '/celebrity-faces/memes/surprised-pikachu.jpg',
    difficulty: 'medium',
    expressionProfile: {
      mouthOpen: 0.6,
      mouthWidth: 0.35,
      mouthSmile: 0.0,
      mouthFrown: 0.0,
      eyeOpen: 0.85,
      eyeSquint: 0.0,
      browRaise: 0.75,
      browDown: 0.0,
      lipPucker: 0.0,
    },
  },
  {
    name: 'Hide the Pain Harold',
    category: 'meme',
    imageUrl: '/celebrity-faces/memes/harold-hide-pain.jpg',
    difficulty: 'medium',
    expressionProfile: {
      mouthOpen: 0.0,
      mouthWidth: 0.40,
      mouthSmile: 0.5,
      mouthFrown: 0.0,
      eyeOpen: 0.40,
      eyeSquint: 0.0,
      browRaise: 0.30,
      browDown: 0.0,
      lipPucker: 0.0,
    },
  },
  {
    name: 'Distracted Boyfriend',
    category: 'meme',
    imageUrl: '/celebrity-faces/memes/distracted-boyfriend.jpg',
    difficulty: 'medium',
    expressionProfile: {
      mouthOpen: 0.0,
      mouthWidth: 0.40,
      mouthSmile: 0.0,
      mouthFrown: 0.0,
      eyeOpen: 0.65,
      eyeSquint: 0.0,
      browRaise: 0.65,
      browDown: 0.0,
      lipPucker: 0.0,
    },
  },
  {
    name: 'Disaster Girl',
    category: 'meme',
    imageUrl: '/celebrity-faces/memes/disaster-girl.jpg',
    difficulty: 'hard',
    expressionProfile: {
      mouthOpen: 0.05,
      mouthWidth: 0.35,
      mouthSmile: 0.0,
      mouthFrown: 0.30,
      eyeOpen: 0.55,
      eyeSquint: 0.0,
      browRaise: 0.0,
      browDown: 0.50,
      lipPucker: 0.0,
    },
  },

  // Celebrities
  {
    name: 'Leo DiCaprio Cheers',
    category: 'celebrity',
    imageUrl: '/celebrity-faces/celebrities/leo-dicaprio-cheers.jpg',
    difficulty: 'medium',
    expressionProfile: {
      mouthOpen: 0.30,
      mouthWidth: 0.50,
      mouthSmile: 0.45,
      mouthFrown: 0.0,
      eyeOpen: 0.55,
      eyeSquint: 0.40,
      browRaise: 0.40,
      browDown: 0.0,
      lipPucker: 0.0,
    },
  },
  {
    name: 'Morgan Freeman Smile',
    category: 'celebrity',
    imageUrl: '/celebrity-faces/celebrities/morgan-freeman-smile.jpg',
    difficulty: 'medium',
    expressionProfile: {
      mouthOpen: 0.0,
      mouthWidth: 0.55,
      mouthSmile: 0.70,
      mouthFrown: 0.0,
      eyeOpen: 0.50,
      eyeSquint: 0.40,
      browRaise: 0.40,
      browDown: 0.0,
      lipPucker: 0.0,
    },
  },
  {
    name: 'The Rock Eyebrow',
    category: 'celebrity',
    imageUrl: '/celebrity-faces/celebrities/the-rock-eyebrow.jpg',
    difficulty: 'hard',
    expressionProfile: {
      mouthOpen: 0.0,
      mouthWidth: 0.40,
      mouthSmile: 0.55,
      mouthFrown: 0.0,
      eyeOpen: 0.45,
      eyeSquint: 0.40,
      browRaise: 0.65,
      browDown: 0.0,
      lipPucker: 0.0,
    },
  },
  {
    name: 'Samuel L Jackson Serious',
    category: 'celebrity',
    imageUrl: '/celebrity-faces/celebrities/samuel-l-jackson-serious.jpg',
    difficulty: 'medium',
    expressionProfile: {
      mouthOpen: 0.0,
      mouthWidth: 0.40,
      mouthSmile: 0.0,
      mouthFrown: 0.0,
      eyeOpen: 0.50,
      eyeSquint: 0.0,
      browRaise: 0.0,
      browDown: 0.55,
      lipPucker: 0.0,
    },
  },
  {
    name: 'Will Smith Smirk',
    category: 'celebrity',
    imageUrl: '/celebrity-faces/celebrities/will-smith-smirk.jpg',
    difficulty: 'medium',
    expressionProfile: {
      mouthOpen: 0.0,
      mouthWidth: 0.55,
      mouthSmile: 0.55,
      mouthFrown: 0.0,
      eyeOpen: 0.50,
      eyeSquint: 0.30,
      browRaise: 0.45,
      browDown: 0.0,
      lipPucker: 0.0,
    },
  },

  // Characters
  {
    name: 'Joker Smile',
    category: 'character',
    imageUrl: '/celebrity-faces/characters/joker-smile.jpg',
    difficulty: 'hard',
    expressionProfile: {
      mouthOpen: 0.0,
      mouthWidth: 0.85,
      mouthSmile: 0.95,
      mouthFrown: 0.0,
      eyeOpen: 0.50,
      eyeSquint: 0.40,
      browRaise: 0.55,
      browDown: 0.0,
      lipPucker: 0.0,
    },
  },
  {
    name: 'Gandalf Wise',
    category: 'character',
    imageUrl: '/celebrity-faces/characters/gandalf-wise.jpg',
    difficulty: 'medium',
    expressionProfile: {
      mouthOpen: 0.0,
      mouthWidth: 0.40,
      mouthSmile: 0.30,
      mouthFrown: 0.0,
      eyeOpen: 0.55,
      eyeSquint: 0.0,
      browRaise: 0.50,
      browDown: 0.0,
      lipPucker: 0.0,
    },
  },
  {
    name: 'Iron Man Smirk',
    category: 'character',
    imageUrl: '/celebrity-faces/characters/iron-man-smirk.jpg',
    difficulty: 'medium',
    expressionProfile: {
      mouthOpen: 0.0,
      mouthWidth: 0.50,
      mouthSmile: 0.55,
      mouthFrown: 0.0,
      eyeOpen: 0.55,
      eyeSquint: 0.20,
      browRaise: 0.50,
      browDown: 0.0,
      lipPucker: 0.0,
    },
  },
  {
    name: 'Yoda Serious',
    category: 'character',
    imageUrl: '/celebrity-faces/characters/yoda-serious.jpg',
    difficulty: 'easy',
    expressionProfile: {
      mouthOpen: 0.0,
      mouthWidth: 0.30,
      mouthSmile: 0.0,
      mouthFrown: 0.0,
      eyeOpen: 0.40,
      eyeSquint: 0.0,
      browRaise: 0.30,
      browDown: 0.0,
      lipPucker: 0.0,
    },
  },
];

async function seed() {
  console.log('🎭 Starting celebrity faces seed...');

  try {
    await initSchema();
    // Insert sample celebrities. `expressionProfile` is optional
    // and stored as JSONB so the client can read it back as a
    // structured object. Rows without a profile still work — the
    // client falls back to a category × difficulty default.
    let count = 0;
    for (const celeb of sampleCelebrities) {
      try {
        const result = await pool.query(
          `INSERT INTO celebrity_faces
             (name, category, image_url, difficulty, expression_profile)
           SELECT $1, $2, $3, $4, $5
            WHERE NOT EXISTS (SELECT 1 FROM celebrity_faces WHERE name = $1)`,
          [
            celeb.name,
            celeb.category,
            celeb.imageUrl,
            celeb.difficulty,
            celeb.expressionProfile ? JSON.stringify(celeb.expressionProfile) : null,
          ],
        );
        count += result.rowCount;
        console.log(
          `${result.rowCount ? 'Added' : 'Skipped existing'}: ${celeb.name} (${celeb.category}, ${celeb.difficulty})`
        );
      } catch (err) {
        console.error(`✗ Failed to add ${celeb.name}:`, err.message);
      }
    }

    console.log(`\n🎉 Successfully seeded ${count}/${sampleCelebrities.length} celebrity faces!`);
    console.log('\nNext steps:');
    console.log('1. Add actual image files to frontend/public/celebrity-faces/');
    console.log('2. Ensure image filenames match the database records');
    console.log('3. Start the signaling server and frontend');
    console.log('4. Test the Celebrity Face Mimic mode!');
    console.log('\nTo re-seed a row with a new expression profile, run:');
    console.log('   UPDATE celebrity_faces SET expression_profile = $1 WHERE name = $2;');

  } catch (error) {
    console.error('❌ Error seeding database:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run seed function
seed()
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
