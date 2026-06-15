// services/qrService.js
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs').promises;
const pool = require('../config/database');
const redis = require('../config/redis');

class QRService {
  async generateQRCode(data, userId, type) {
    const slug = this.generateSlug();
    const imageUrl = await this.createQRImage(data, slug);
    
    const result = await pool.query(
      `INSERT INTO qr_codes (id, user_id, slug, type, content, image_url) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [uuidv4(), userId, slug, type, JSON.stringify(data), imageUrl]
    );
    
    return result.rows[0];
  }
  
  generateSlug() {
    return uuidv4().substring(0, 8);
  }
  
  async createQRImage(data, slug) {
    const qrData = typeof data === 'string' ? data : JSON.stringify(data);
    const filename = `${slug}.png`;
    const filepath = path.join(__dirname, '../uploads', filename);
    
    await QRCode.toFile(filepath, qrData, {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 300
    });
    
    return `/uploads/${filename}`;
  }
  
  async getQRCodeBySlug(slug) {
    // Check cache first
    const cached = await redis.get(`qr:${slug}`);
    if (cached) {
      return JSON.parse(cached);
    }
    
    const result = await pool.query(
      'SELECT * FROM qr_codes WHERE slug = $1 AND is_active = true',
      [slug]
    );
    
    if (result.rows.length > 0) {
      // Cache for 1 hour
      await redis.setex(`qr:${slug}`, 3600, JSON.stringify(result.rows[0]));
    }
    
    return result.rows[0];
  }
  
  async logScan(qrCodeId, userId, ip, userAgent, referrer, geoData) {
    const result = await pool.query(
      `INSERT INTO scans (id, qr_code_id, user_id, ip_address, user_agent, referrer, geo_city, geo_country)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [uuidv4(), qrCodeId, userId, ip, userAgent, referrer, geoData?.city, geoData?.country]
    );
    
    // Update Redis counter
    await redis.zincrby('qr_leaderboard', 1, qrCodeId);
    await redis.incr(`qr:scans:${qrCodeId}:today`);
    await redis.expire(`qr:scans:${qrCodeId}:today`, 86400);
    
    return result.rows[0];
  }
  
  async getScanStats(qrCodeId, days = 7) {
    const result = await pool.query(
      `SELECT 
        DATE(scanned_at) as date,
        COUNT(*) as count
       FROM scans
       WHERE qr_code_id = $1 
         AND scanned_at >= NOW() - INTERVAL '${days} days'
       GROUP BY DATE(scanned_at)
       ORDER BY date DESC`,
      [qrCodeId]
    );
    
    return result.rows;
  }
}

module.exports = new QRService();