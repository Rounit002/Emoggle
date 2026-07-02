/**
 * Celebrity Face Mimic - Database Seed Script
 * Populates the celebrity_faces table with sample data
 * 
 * Usage:
 *   node seed-celebrities.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const sampleCelebrities = [
  // Memes
  {
    name: 'Drake No',
    category: 'meme',
    imageUrl: '/celebrity-faces/memes/drake-no.jpg',
    difficulty: 'easy',
  },
  {
    name: 'Drake Yes',
    category: 'meme',
    imageUrl: '/celebrity-faces/memes/drake-yes.jpg',
    difficulty: 'easy',
  },
  {
    name: 'Success Kid',
    category: 'meme',
    imageUrl: '/celebrity-faces/memes/success-kid.jpg',
    difficulty: 'easy',
  },
  {
    name: 'Surprised Pikachu',
    category: 'meme',
    imageUrl: '/celebrity-faces/memes/surprised-pikachu.jpg',
    difficulty: 'medium',
  },
  {
    name: 'Hide the Pain Harold',
    category: 'meme',
    imageUrl: '/celebrity-faces/memes/harold-hide-pain.jpg',
    difficulty: 'medium',
  },
  {
    name: 'Distracted Boyfriend',
    category: 'meme',
    imageUrl: '/celebrity-faces/memes/distracted-boyfriend.jpg',
    difficulty: 'medium',
  },
  {
    name: 'Disaster Girl',
    category: 'meme',
    imageUrl: '/celebrity-faces/memes/disaster-girl.jpg',
    difficulty: 'hard',
  },

  // Celebrities
  {
    name: 'Leo DiCaprio Cheers',
    category: 'celebrity',
    imageUrl: '/celebrity-faces/celebrities/leo-dicaprio-cheers.jpg',
    difficulty: 'medium',
  },
  {
    name: 'Morgan Freeman Smile',
    category: 'celebrity',
    imageUrl: '/celebrity-faces/celebrities/morgan-freeman-smile.jpg',
    difficulty: 'medium',
  },
  {
    name: 'The Rock Eyebrow',
    category: 'celebrity',
    imageUrl: '/celebrity-faces/celebrities/the-rock-eyebrow.jpg',
    difficulty: 'hard',
  },
  {
    name: 'Samuel L Jackson Serious',
    category: 'celebrity',
    imageUrl: '/celebrity-faces/celebrities/samuel-l-jackson-serious.jpg',
    difficulty: 'medium',
  },
  {
    name: 'Will Smith Smirk',
    category: 'celebrity',
    imageUrl: '/celebrity-faces/celebrities/will-smith-smirk.jpg',
    difficulty: 'medium',
  },

  // Characters
  {
    name: 'Joker Smile',
    category: 'character',
    imageUrl: '/celebrity-faces/characters/joker-smile.jpg',
    difficulty: 'hard',
  },
  {
    name: 'Gandalf Wise',
    category: 'character',
    imageUrl: '/celebrity-faces/characters/gandalf-wise.jpg',
    difficulty: 'medium',
  },
  {
    name: 'Iron Man Smirk',
    category: 'character',
    imageUrl: '/celebrity-faces/characters/iron-man-smirk.jpg',
    difficulty: 'medium',
  },
  {
    name: 'Yoda Serious',
    category: 'character',
    imageUrl: '/celebrity-faces/characters/yoda-serious.jpg',
    difficulty: 'easy',
  },
];

async function seed() {
  console.log('🎭 Starting celebrity faces seed...');

  try {
    // Clear existing data (optional - comment out if you want to keep existing data)
    // await prisma.celebrityFace.deleteMany();
    // console.log('✓ Cleared existing celebrity faces');

    // Insert sample celebrities
    let count = 0;
    for (const celeb of sampleCelebrities) {
      try {
        await prisma.celebrityFace.create({
          data: celeb,
        });
        count++;
        console.log(`✓ Added: ${celeb.name} (${celeb.category})`);
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

  } catch (error) {
    console.error('❌ Error seeding database:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run seed function
seed()
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
