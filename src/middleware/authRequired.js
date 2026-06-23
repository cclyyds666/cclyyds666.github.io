import { verifyToken } from '../auth.js';

export function authRequired(req, res, next) {
  const header = req.get('authorization') || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer') {
    return res.status(401).json({ message: '请先登录后再操作。' });
  }

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    return res.status(401).json({ message: '登录状态已失效，请重新登录。' });
  }

  if (!payload) {
    return res.status(401).json({ message: '登录状态已失效，请重新登录。' });
  }

  req.user = {
    id: Number(payload.sub),
    username: payload.username
  };
  return next();
}
