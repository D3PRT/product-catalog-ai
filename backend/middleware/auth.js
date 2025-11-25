const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { logAction } = require('../middleware/audit');
const { authLimiter } = require('../middleware/rateLimit');

const router = express.Router();

// Login endpoint
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { username, password, rememberMe } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    // Get user from database
    const userResult = await query(
      'SELECT * FROM users WHERE username = $1 AND active = true',
      [username]
    );

    if (userResult.rows.length === 0) {
      await logAction(null, 'LOGIN_FAILED', 'user', username, {
        reason: 'User not found',
        ip: req.ip,
      });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = userResult.rows[0];

    // Check if account is locked
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      return res.status(423).json({
        error: 'Account is locked due to too many failed attempts',
        lockedUntil: user.locked_until,
      });
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      // Increment failed login attempts
      const newAttempts = user.failed_login_attempts + 1;
      const lockUntil = newAttempts >= 5
        ? new Date(Date.now() + 30 * 60 * 1000) // Lock for 30 minutes
        : null;

      await query(
        'UPDATE users SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3',
        [newAttempts, lockUntil, user.id]
      );

      await logAction(user.id, 'LOGIN_FAILED', 'user', user.username, {
        reason: 'Invalid password',
        attempts: newAttempts,
        ip: req.ip,
      });

      return res.status(401).json({
        error: 'Invalid credentials',
        attemptsRemaining: Math.max(0, 5 - newAttempts),
      });
    }

    // Reset failed attempts on successful login
    await query(
      'UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login = NOW() WHERE id = $1',
      [user.id]
    );

    // Generate tokens
    const tokenExpiry = rememberMe ? '7d' : process.env.JWT_EXPIRY || '1h';
    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: tokenExpiry }
    );

    const refreshToken = jwt.sign(
      { userId: user.id, type: 'refresh' },
      process.env.JWT_SECRET,
      { expiresIn: process.env.REFRESH_TOKEN_EXPIRY || '7d' }
    );

    // Calculate expiry timestamps
    const tokenExpiresAt = new Date(Date.now() + (rememberMe ? 7 * 24 * 60 * 60 * 1000 : 60 * 60 * 1000));
    const refreshExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Create session
    await query(
      `INSERT INTO sessions 
       (user_id, token, refresh_token, expires_at, refresh_expires_at, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [user.id, token, refreshToken, tokenExpiresAt, refreshExpiresAt, req.ip, req.headers['user-agent']]
    );

    await logAction(user.id, 'LOGIN_SUCCESS', 'user', user.username, {
      rememberMe,
      ip: req.ip,
    });

    res.json({
      success: true,
      token,
      refreshToken: rememberMe ? refreshToken : undefined,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
      expiresIn: tokenExpiry,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Logout endpoint
router.post('/logout', authenticate, async (req, res) => {
  try {
    // Delete session
    await query('DELETE FROM sessions WHERE id = $1', [req.user.sessionId]);

    await logAction(req.user.id, 'LOGOUT', 'user', req.user.username);

    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

// Refresh token endpoint
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);

    if (decoded.type !== 'refresh') {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    // Check if refresh token exists in database
    const sessionResult = await query(
      `SELECT s.*, u.username, u.role 
       FROM sessions s
       JOIN users u ON s.user_id = u.id
       WHERE s.refresh_token = $1 AND s.refresh_expires_at > NOW()`,
      [refreshToken]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(401).json({ error: 'Refresh token expired or invalid' });
    }

    const session = sessionResult.rows[0];

    // Generate new access token
    const newToken = jwt.sign(
      { userId: session.user_id, username: session.username, role: session.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRY || '1h' }
    );

    const newExpiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Update session with new token
    await query(
      'UPDATE sessions SET token = $1, expires_at = $2, last_activity = NOW() WHERE id = $3',
      [newToken, newExpiresAt, session.id]
    );

    await logAction(session.user_id, 'TOKEN_REFRESH', 'session', session.id);

    res.json({
      success: true,
      token: newToken,
      expiresIn: '1h',
    });
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }
    console.error('Refresh token error:', error);
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

// Get current user info
router.get('/me', authenticate, async (req, res) => {
  try {
    const userResult = await query(
      'SELECT id, username, email, role, created_at, last_login FROM users WHERE id = $1',
      [req.user.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ success: true, user: userResult.rows[0] });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

// Get active sessions
router.get('/sessions', authenticate, async (req, res) => {
  try {
    const sessionsResult = await query(
      `SELECT id, ip_address, user_agent, created_at, last_activity, expires_at
       FROM sessions
       WHERE user_id = $1 AND expires_at > NOW()
       ORDER BY last_activity DESC`,
      [req.user.id]
    );

    res.json({ success: true, sessions: sessionsResult.rows });
  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({ error: 'Failed to get sessions' });
  }
});

// Logout from all devices
router.post('/logout-all', authenticate, async (req, res) => {
  try {
    await query('DELETE FROM sessions WHERE user_id = $1', [req.user.id]);

    await logAction(req.user.id, 'LOGOUT_ALL', 'user', req.user.username);

    res.json({ success: true, message: 'Logged out from all devices' });
  } catch (error) {
    console.error('Logout all error:', error);
    res.status(500).json({ error: 'Failed to logout from all devices' });
  }
});

module.exports = router;
