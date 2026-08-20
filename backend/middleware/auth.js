const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

// Verifies the JWT on every protected request and attaches the user to req.user
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'ما في تسجيل دخول' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload; // { id, name, roleKey, roleLabel, permissions }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'الجلسة منتهية، سجل دخول من جديد' });
  }
}

// Blocks the request unless the logged-in user's role includes this module key.
// Usage: router.get('/', requireAuth, requireModule('team'), handler)
function requireModule(moduleKey) {
  return (req, res, next) => {
    if (!req.user.permissions.includes(moduleKey)) {
      return res.status(403).json({ error: 'ما عندك صلاحية توصل لهاد الجزء' });
    }
    next();
  };
}

module.exports = { requireAuth, requireModule };
