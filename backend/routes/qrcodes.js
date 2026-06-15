// routes/qrcodes.js
const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const rateLimiter = require('../middleware/rateLimiter');
const qrService = require('../services/qrService');
const pool = require('../config/database');
const redis = require('../config/redis');
const axios = require('axios');

const router = express.Router();

// Get user's QR codes
router.get('/', authenticateToken, async (req, res) => {
  const { page = 1, limit = 10, type } = req.query;
  const offset = (page - 1) * limit;
  
  let query = 'SELECT * FROM qr_codes WHERE user_id = $1';
  let params = [req.user.id];
  
  if (type) {
    query += ' AND type = $2';
    params.push(type);
  }
  
  query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);
  
  try {
    const result = await pool.query(query, params);
    const countResult = await pool.query(
      'SELECT COUNT(*) FROM qr_codes WHERE user_id = $1',
      [req.user.id]
    );
    
    // Get scan counts from Redis
    const qrCodesWithStats = await Promise.all(
      result.rows.map(async (qr) => {
        const scanCount = await redis.zscore('qr_leaderboard', qr.id);
        return { ...qr, scan_count: parseInt(scanCount) || 0 };
      })
    );
    
    res.json({
      data: qrCodesWithStats,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].count)
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch QR codes' });
  }
});

// Generate QR code
router.post('/generate',
  authenticateToken,
  [
    body('type').isIn(['url', 'text', 'contact', 'wifi', 'json']),
    body('content').notEmpty()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { type, content } = req.body;
    
    try {
      const qrCode = await qrService.generateQRCode(content, req.user.id, type);
      
      // Invalidate cache
      await redis.del(`qr:${qrCode.slug}`);
      
      res.status(201).json(qrCode);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to generate QR code' });
    }
  }
);

// Update QR code
router.put('/:id',
  authenticateToken,
  async (req, res) => {
    const { id } = req.params;
    const { content, is_active } = req.body;
    
    try {
      // Check ownership
      const checkResult = await pool.query(
        'SELECT * FROM qr_codes WHERE id = $1 AND user_id = $2',
        [id, req.user.id]
      );
      
      if (checkResult.rows.length === 0) {
        return res.status(404).json({ error: 'QR code not found' });
      }
      
      const updateFields = [];
      const updateValues = [];
      let valueCounter = 1;
      
      if (content) {
        updateFields.push(`content = $${valueCounter++}`);
        updateValues.push(JSON.stringify(content));
      }
      
      if (is_active !== undefined) {
        updateFields.push(`is_active = $${valueCounter++}`);
        updateValues.push(is_active);
      }
      
      updateFields.push(`updated_at = NOW()`);
      
      const query = `
        UPDATE qr_codes 
        SET ${updateFields.join(', ')}
        WHERE id = $${valueCounter}
        RETURNING *
      `;
      updateValues.push(id);
      
      const result = await pool.query(query, updateValues);
      
      // Invalidate cache
      await redis.del(`qr:${result.rows[0].slug}`);
      
      res.json(result.rows[0]);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update QR code' });
    }
  }
);

// Delete QR code
router.delete('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await pool.query(
      'DELETE FROM qr_codes WHERE id = $1 AND user_id = $2 RETURNING slug',
      [id, req.user.id]
    );
    
    if (result.rows.length > 0) {
      await redis.del(`qr:${result.rows[0].slug}`);
      await redis.zrem('qr_leaderboard', id);
    }
    
    res.json({ message: 'QR code deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete QR code' });
  }
});

// Scan endpoint (public, rate limited)
router.get('/scan/:slug',
  rateLimiter(60, 60000), // 60 requests per minute
  async (req, res) => {
    const { slug } = req.params;
    
    try {
      const qrCode = await qrService.getQRCodeBySlug(slug);
      
      if (!qrCode) {
        return res.status(404).json({ error: 'QR code not found or inactive' });
      }
      
      // Get geo location from IP
      let geoData = null;
      try {
        const geoResponse = await axios.get(`http://ip-api.com/json/${req.ip}`);
        if (geoResponse.data.status === 'success') {
          geoData = {
            city: geoResponse.data.city,
            country: geoResponse.data.country
          };
        }
      } catch (error) {
        console.error('Geo lookup failed:', error);
      }
      
      // Log scan asynchronously
      qrService.logScan(
        qrCode.id,
        req.user?.id || null,
        req.ip,
        req.headers['user-agent'],
        req.headers['referer'],
        geoData
      ).then(() => {
        // Emit real-time update
        const io = req.app.get('io');
        io.emit('scan:update', { qrCodeId: qrCode.id, slug: qrCode.slug });
      }).catch(console.error);
      
      // Return appropriate response based on type
      const content = typeof qrCode.content === 'string' 
        ? JSON.parse(qrCode.content) 
        : qrCode.content;
      
      if (qrCode.type === 'url') {
        return res.redirect(content.url || content);
      }
      
      res.json({
        type: qrCode.type,
        content: content
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to process scan' });
    }
  }
);

module.exports = router;