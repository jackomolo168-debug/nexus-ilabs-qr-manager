// middleware/rateLimiter.js
const redis = require('../config/redis');

const rateLimiter = (limit, windowMs) => {
  return async (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    const key = `rate_limit:${ip}`;
    
    try {
      const current = await redis.get(key);
      const requests = current ? parseInt(current) : 0;
      
      if (requests >= limit) {
        return res.status(429).json({
          error: 'Too many requests',
          retryAfter: Math.ceil(windowMs / 1000)
        });
      }
      
      await redis.multi()
        .set(key, requests + 1, 'EX', Math.ceil(windowMs / 1000))
        .exec();
      
      next();
    } catch (error) {
      console.error('Rate limiter error:', error);
      next();
    }
  };
};

module.exports = rateLimiter;