const jwt = require('jsonwebtoken');

module.exports = function(req, res, next){
  const token = req.header('Authorization')?.split(' ')[1];
  if(!token) return res.status(401).json({ msg: 'No token' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: decoded.id };
    next();
  } catch(e) {
    return res.status(401).json({ msg: 'Token invalid' });
  }
};
