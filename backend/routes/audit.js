const express = require('express');
const { query } = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

// Get audit logs
router.get('/', authenticate, async (req, res) => {
  try {
    const {
      limit = 50,
      offset = 0,
      action,
      userId,
      startDate,
      endDate,
      status,
    } = req.query;

    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (req.user.role !== 'admin') {
      conditions.push(`user_id = $${paramIndex}`);
      params.push(req.user.id);
      paramIndex++;
    } else if (userId) {
      conditions.push(`user_id = $${paramIndex}`);
      params.push(userId);
      paramIndex++;
    }

    if (action) {
      conditions.push(`action ILIKE $${paramIndex}`);
      params.push(`%${action}%`);
      paramIndex++;
    }

    if (status) {
      conditions.push(`status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    if (startDate) {
      conditions.push(`created_at >= $${paramIndex}`);
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      conditions.push(`created_at <= $${paramIndex}`);
      params.push(endDate);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await query(
      `SELECT COUNT(*) FROM audit_logs ${whereClause}`,
      params
    );
    const totalCount = parseInt(countResult.rows[0].count);

    params.push(limit, offset);
    const logsResult = await query(
      `SELECT 
        al.*,
        u.username,
        u.email
       FROM audit_logs al
       LEFT JOIN users u ON al.user_id = u.id
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      params
    );

    res.json({
      success: true,
      logs: logsResult.rows,
      pagination: {
        total: totalCount,
        limit: parseInt(limit),
        offset: parseInt(offset),
        pages: Math.ceil(totalCount / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({ error: 'Failed to retrieve audit logs' });
  }
});

// Get audit log statistics (admin only)
router.get('/stats', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { days = 7 } = req.query;

    const totalResult = await query(
      `SELECT COUNT(*) as total FROM audit_logs WHERE created_at >= NOW() - INTERVAL '${days} days'`
    );

    const actionTypesResult = await query(
      `SELECT action, COUNT(*) as count
       FROM audit_logs
       WHERE created_at >= NOW() - INTERVAL '${days} days'
       GROUP BY action
       ORDER BY count DESC
       LIMIT 10`
    );

    const userActionsResult = await query(
      `SELECT u.username, COUNT(*) as count
       FROM audit_logs al
       LEFT JOIN users u ON al.user_id = u.id
       WHERE al.created_at >= NOW() - INTERVAL '${days} days'
       GROUP BY u.username
       ORDER BY count DESC
       LIMIT 10`
    );

    const statusResult = await query(
      `SELECT status, COUNT(*) as count
       FROM audit_logs
       WHERE created_at >= NOW() - INTERVAL '${days} days'
       GROUP BY status`
    );

    const dailyResult = await query(
      `SELECT 
        DATE(created_at) as date,
        COUNT(*) as count
       FROM audit_logs
       WHERE created_at >= NOW() - INTERVAL '${days} days'
       GROUP BY DATE(created_at)
       ORDER BY date DESC`
    );

    res.json({
      success: true,
      stats: {
        total: parseInt(totalResult.rows[0].total),
        actionTypes: actionTypesResult.rows,
        userActions: userActionsResult.rows,
        statusBreakdown: statusResult.rows,
        dailyActivity: dailyResult.rows,
        period: `${days} days`,
      },
    });
  } catch (error) {
    console.error('Get audit stats error:', error);
    res.status(500).json({ error: 'Failed to retrieve audit statistics' });
  }
});

module.exports = router;
