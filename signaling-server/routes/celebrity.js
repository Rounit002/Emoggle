/**
 * Celebrity Face Mimic API Routes
 * Handles celebrity face data retrieval and management
 */

const express = require('express');
const router = express.Router();

// Import database connection from parent
let prisma;
try {
  const { PrismaClient } = require('@prisma/client');
  prisma = new PrismaClient();
} catch (err) {
  console.error('[Celebrity] Prisma unavailable:', err.message);
}

/**
 * GET /api/celebrity/random
 * Returns a random celebrity face for the match
 * Query params:
 *   - difficulty: 'easy', 'medium', 'hard' (optional)
 *   - category: 'meme', 'celebrity', 'character' (optional)
 */
router.get('/random', async (req, res) => {
  try {
    if (!prisma) {
      return res.status(503).json({ error: 'Database unavailable' });
    }

    const { difficulty, category } = req.query;
    const where = {};
    
    if (difficulty) where.difficulty = difficulty;
    if (category) where.category = category;

    // Get total count
    const count = await prisma.celebrityFace.count({ where });
    
    if (count === 0) {
      return res.status(404).json({ error: 'No celebrity faces found' });
    }

    // Get random offset
    const skip = Math.floor(Math.random() * count);
    
    // Fetch one random face
    const face = await prisma.celebrityFace.findFirst({
      where,
      skip,
      orderBy: { usageCount: 'asc' } // Prefer less-used faces
    });

    if (!face) {
      return res.status(404).json({ error: 'Celebrity face not found' });
    }

    // Increment usage counter
    await prisma.celebrityFace.update({
      where: { id: face.id },
      data: { usageCount: { increment: 1 } }
    });

    res.json({
      id: face.id,
      name: face.name,
      category: face.category,
      imageUrl: face.imageUrl,
      difficulty: face.difficulty,
      facialLandmarks: face.facialLandmarks
    });
  } catch (error) {
    console.error('[Celebrity] Error fetching random face:', error);
    res.status(500).json({ error: 'Failed to fetch celebrity face' });
  }
});

/**
 * GET /api/celebrity/list
 * Returns paginated list of available celebrity faces
 * Query params:
 *   - page: page number (default: 1)
 *   - limit: items per page (default: 20)
 *   - category: filter by category (optional)
 */
router.get('/list', async (req, res) => {
  try {
    if (!prisma) {
      return res.status(503).json({ error: 'Database unavailable' });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const { category } = req.query;
    
    const where = {};
    if (category) where.category = category;

    const [faces, total] = await Promise.all([
      prisma.celebrityFace.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { usageCount: 'asc' }
      }),
      prisma.celebrityFace.count({ where })
    ]);

    res.json({
      faces: faces.map(f => ({
        id: f.id,
        name: f.name,
        category: f.category,
        imageUrl: f.imageUrl,
        difficulty: f.difficulty,
        usageCount: f.usageCount
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('[Celebrity] Error listing faces:', error);
    res.status(500).json({ error: 'Failed to list celebrity faces' });
  }
});

/**
 * POST /api/celebrity/landmarks
 * Accepts celebrity face image, returns computed landmarks for scoring
 * Body: { faceId: number }
 */
router.post('/landmarks', async (req, res) => {
  try {
    if (!prisma) {
      return res.status(503).json({ error: 'Database unavailable' });
    }

    const { faceId } = req.body;
    
    if (!faceId) {
      return res.status(400).json({ error: 'faceId is required' });
    }

    const face = await prisma.celebrityFace.findUnique({
      where: { id: parseInt(faceId) }
    });

    if (!face) {
      return res.status(404).json({ error: 'Celebrity face not found' });
    }

    res.json({
      id: face.id,
      name: face.name,
      facialLandmarks: face.facialLandmarks || null
    });
  } catch (error) {
    console.error('[Celebrity] Error fetching landmarks:', error);
    res.status(500).json({ error: 'Failed to fetch landmarks' });
  }
});

/**
 * GET /api/celebrity/:id
 * Get specific celebrity face by ID
 */
router.get('/:id', async (req, res) => {
  try {
    if (!prisma) {
      return res.status(503).json({ error: 'Database unavailable' });
    }

    const face = await prisma.celebrityFace.findUnique({
      where: { id: parseInt(req.params.id) }
    });

    if (!face) {
      return res.status(404).json({ error: 'Celebrity face not found' });
    }

    res.json({
      id: face.id,
      name: face.name,
      category: face.category,
      imageUrl: face.imageUrl,
      difficulty: face.difficulty,
      facialLandmarks: face.facialLandmarks,
      usageCount: face.usageCount
    });
  } catch (error) {
    console.error('[Celebrity] Error fetching face:', error);
    res.status(500).json({ error: 'Failed to fetch celebrity face' });
  }
});

module.exports = router;
