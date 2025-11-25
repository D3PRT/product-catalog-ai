const { query } = require('../config/database');

// Log every request to audit logs
async function auditLog(req, res, next) {
  const startTime = Date.now();
  
  const originalEnd = res.end;
  
  res.end = function(...args) {
    const duration = Date.now() - startTime;
    
    setImmediate(async () => {
      try {
        const action = `${req.method} ${req.path}`;
        const details = {
          method: req.method,
          path: req.path,
          query: req.query,
          body: sanitizeBody(req.body),
          duration: `${duration}ms`,
          statusCode: res.statusCode,
        };

        await query(
          `INSERT INTO audit_logs 
           (user_id, action, resource_type, details, ip_address, user_agent, status, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
          [
            req.user?.id || null,
            action,
            req.params?.type || null,
            JSON.stringify(details),
            req.ip,
            req.headers['user-agent'] || null,
            res.statusCode >= 200 && res.statusCode < 300 ? 'success' : 'error',
          ]
        );
      } catch (error) {
        console.error('❌ Audit log error:', error);
      }
    });
    
    originalEnd.apply(res, args);
  };
  
  next();
}

function sanitizeBody(body) {
  if (!body || typeof body !== 'object') return body;
  
  const sanitized = { ...body };
  const sensitiveFields = [
    'password',
    'token',
    'apiKey',
    'api_key',
    'secret',
    'refresh_token',
    'refreshToken',
  ];
  
  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  }
  
  return sanitized;
}

async function logAction(userId, action, resourceType, resourceId, details = {}) {
  try {
    await query(
      `INSERT INTO audit_logs 
       (user_id, action, resource_type, resource_id, details, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [
        userId,
        action,
        resourceType,
        resourceId,
        JSON.stringify(details),
        'success',
      ]
    );
  } catch (error) {
    console.error('❌ Failed to log action:', error);
  }
}

module.exports = {
  auditLog,
  logAction,
};
