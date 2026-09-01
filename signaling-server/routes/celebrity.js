/**
 * Celebrity Face Mimic API Routes
 * Handles celebrity face data retrieval and management
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../db');

const DIFFICULTIES = new Set(['easy', 'medium', 'hard']);
const CATEGORIES = new Set(['meme', 'celebrity', 'character']);

function readEnum(value, allowed) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !allowed.has(value)) return null;
  return value;
}

function readPositiveInteger(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= max ? parsed : null;
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
    const difficulty = readEnum(req.query.difficulty, DIFFICULTIES);
    const category = readEnum(req.query.category, CATEGORIES);
    if (difficulty === null || category === null) {
      return res.status(400).json({ error: 'Invalid difficulty or category' });
    }
    const values = [];
    const filters = [];
    if (difficulty) {
      values.push(difficulty);
      filters.push(`difficulty = $${values.length}`);
    }
    if (category) {
      values.push(category);
      filters.push(`category = $${values.length}`);
    }
    const whereSql = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT id, name, category, image_url, difficulty, facial_landmarks
         FROM celebrity_faces
         ${whereSql}
        ORDER BY usage_count ASC, RANDOM()
        LIMIT 1`,
      values,
    );
    const face = rows[0];

    if (!face) {
      return res.status(404).json({ error: 'Celebrity face not found' });
    }

    res.json({
      id: face.id,
      name: face.name,
      category: face.category,
      imageUrl: face.image_url,
      difficulty: face.difficulty,
      facialLandmarks: face.facial_landmarks
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
    const page = readPositiveInteger(req.query.page, 1, 100000);
    const limit = readPositiveInteger(req.query.limit, 20, 100);
    const category = readEnum(req.query.category, CATEGORIES);
    if (page === null || limit === null || category === null) {
      return res.status(400).json({ error: 'Invalid pagination or category' });
    }
    
    const categoryFilter = category ? 'WHERE category = $1' : '';
    const listValues = category
      ? [category, limit, (page - 1) * limit]
      : [limit, (page - 1) * limit];
    const limitParameter = category ? '$2' : '$1';
    const offsetParameter = category ? '$3' : '$2';
    const [facesResult, totalResult] = await Promise.all([
      pool.query(
        `SELECT id, name, category, image_url, difficulty, usage_count
           FROM celebrity_faces ${categoryFilter}
          ORDER BY usage_count ASC, id ASC
          LIMIT ${limitParameter} OFFSET ${offsetParameter}`,
        listValues,
      ),
      pool.query(
        `SELECT COUNT(*)::int AS count FROM celebrity_faces ${categoryFilter}`,
        category ? [category] : [],
      ),
    ]);
    const faces = facesResult.rows;
    const total = totalResult.rows[0].count;

    res.json({
      faces: faces.map(f => ({
        id: f.id,
        name: f.name,
        category: f.category,
        imageUrl: f.image_url,
        difficulty: f.difficulty,
        usageCount: f.usage_count
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
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ error: 'A JSON body is required' });
    }

    const faceId = Number(req.body.faceId);
    if (!Number.isSafeInteger(faceId) || faceId <= 0) {
      return res.status(400).json({ error: 'faceId must be a positive integer' });
    }

    const { rows } = await pool.query(
      `SELECT id, name, facial_landmarks FROM celebrity_faces WHERE id = $1`,
      [faceId],
    );
    const face = rows[0];

    if (!face) {
      return res.status(404).json({ error: 'Celebrity face not found' });
    }

    res.json({
      id: face.id,
      name: face.name,
      facialLandmarks: face.facial_landmarks || null
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
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'id must be a positive integer' });
    }

    const { rows } = await pool.query(
      `SELECT id, name, category, image_url, difficulty, facial_landmarks, usage_count
         FROM celebrity_faces WHERE id = $1`,
      [id],
    );
    const face = rows[0];

    if (!face) {
      return res.status(404).json({ error: 'Celebrity face not found' });
    }

    res.json({
      id: face.id,
      name: face.name,
      category: face.category,
      imageUrl: face.image_url,
      difficulty: face.difficulty,
      facialLandmarks: face.facial_landmarks,
      usageCount: face.usage_count
    });
  } catch (error) {
    console.error('[Celebrity] Error fetching face:', error);
    res.status(500).json({ error: 'Failed to fetch celebrity face' });
  }
});

module.exports = router;
