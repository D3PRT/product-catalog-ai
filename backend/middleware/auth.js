const jwt = require('jsonwebtoken');
const { query } = require('../config/database');

// Verify JWT token and attach user to request
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const sessionResult = await query(
      `SELECT s.*, u.username, u.email, u.role, u.active
       FROM sessions s
       JOIN users u ON s.user_id = u.id
       WHERE s.token = $1 AND s.expires_at > NOW()`,
      [token]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(401).json({ error: 'Session expired or invalid' });
    }

    const session = sessionResult.rows[0];

    if (!session.active) {
      return res.status(403).json({ error: 'User account is disabled' });
    }

    await query(
      'UPDATE sessions SET last_activity = NOW() WHERE id = $1',
      [session.id]
    );

    req.user = {
      id: session.user_id,
      username: session.username,
      email: session.email,
      role: session.role,
      sessionId: session.id,
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    console.error('Authentication error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
}

// Check if user has required role
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

module.exports = {
  authenticate,
  requireRole,
};
