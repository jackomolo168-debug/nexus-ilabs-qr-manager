// routes/analytics.js
const express = require('express');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const pool = require('../config/database');
const redis = require('../config/redis');
const { Parser } = require('json2csv');

const router = express.Router();

// Get scan analytics
router.get('/scans', authenticateToken, async (req, res) => {
  const { qr_code_id, start_date, end_date, limit = 100 } = req.query;
  
  let query = `
    SELECT s.*, q.slug, q.type 
    FROM scans s
    JOIN qr_codes q ON s.qr_code_id = q.id
    WHERE 1=1
  `;
  let params = [];
  let paramCounter = 1;
  
  if (qr_code_id) {
    query += ` AND s.qr_code_id = $${paramCounter++}`;
    params.push(qr_code_id);
  }
  
  if (!qr_code_id && req.user.role !== 'admin') {
    query += ` AND q.user_id = $${paramCounter++}`;
    params.push(req.user.id);
  }
  
  if (start_date) {
    query += ` AND s.scanned_at >= $${paramCounter++}`;
    params.push(start_date);
  }
  
  if (end_date) {
    query += ` AND s.scanned_at <= $${paramCounter++}`;
    params.push(end_date);
  }
  
  query += ` ORDER BY s.scanned_at DESC LIMIT $${paramCounter}`;
  params.push(limit);
  
  try {
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// Export scans as CSV
router.get('/scans/export', authenticateToken, async (req, res) => {
  const { qr_code_id } = req.query;
  
  let query = `
    SELECT s.scanned_at, s.ip_address, s.user_agent, s.referrer, s.geo_city, s.geo_country, q.slug
    FROM scans s
    JOIN qr_codes q ON s.qr_code_id = q.id
    WHERE 1=1
  `;
  let params = [];
  
  if (qr_code_id) {
    query += ` AND s.qr_code_id = $1`;
    params.push(qr_code_id);
  }
  
  if (!qr_code_id && req.user.role !== 'admin') {
    query += ` AND q.user_id = $${params.length + 1}`;
    params.push(req.user.id);
  }
  
  try {
    const result = await pool.query(query, params);
    const json2csv = new Parser();
    const csv = json2csv.parse(result.rows);
    
    res.header('Content-Type', 'text/csv');
    res.attachment('scans.csv');
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: 'Failed to export scans' });
  }
});

// Get leaderboard (top QR codes)
router.get('/leaderboard', authenticateToken, async (req, res) => {
  const { limit = 10 } = req.query;
  
  try {
    const leaderboard = await redis.zrevrange('qr_leaderboard', 0, limit - 1, 'WITHSCORES');
    
    const results = [];
    for (let i = 0; i < leaderboard.length; i += 2) {
      const qrCodeId = leaderboard[i];
      const score = leaderboard[i + 1];
      
      const qrResult = await pool.query(
        'SELECT slug, type, user_id FROM qr_codes WHERE id = $1',
        [qrCodeId]
      );
      
      if (qrResult.rows.length > 0) {
        results.push({
          ...qrResult.rows[0],
          scan_count: parseInt(score)
        });
      }
    }
    
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// Get dashboard stats
router.get('/dashboard', authenticateToken, async (req, res) => {
  try {
    let stats = {};
    
    if (req.user.role === 'admin') {
      // Admin stats
      const totalUsers = await pool.query('SELECT COUNT(*) FROM users');
      const totalQRCodes = await pool.query('SELECT COUNT(*) FROM qr_codes');
      const totalScans = await pool.query('SELECT COUNT(*) FROM scans');
      const scansLast7Days = await pool.query(`
        SELECT DATE(scanned_at) as date, COUNT(*) as count
        FROM scans
        WHERE scanned_at >= NOW() - INTERVAL '7 days'
        GROUP BY DATE(scanned_at)
        ORDER BY date DESC
      `);
      
      stats = {
        total_users: parseInt(totalUsers.rows[0].count),
        total_qrcodes: parseInt(totalQRCodes.rows[0].count),
        total_scans: parseInt(totalScans.rows[0].count),
        scans_last_7_days: scansLast7Days.rows
      };
    } else {
      // User stats
      const userQRCodes = await pool.query(
        'SELECT COUNT(*) FROM qr_codes WHERE user_id = $1',
        [req.user.id]
      );
      const userScans = await pool.query(
        `SELECT COUNT(*) FROM scans s
         JOIN qr_codes q ON s.qr_code_id = q.id
         WHERE q.user_id = $1`,
        [req.user.id]
      );
      
      stats = {
        total_qrcodes: parseInt(userQRCodes.rows[0].count),
        total_scans: parseInt(userScans.rows[0].count)
      };
    }
    
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
});

module.exports = router;