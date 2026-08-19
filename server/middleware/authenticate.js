import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from '../utils/appError.js';
export function authenticate(request, response, next) { const token = request.headers.authorization?.startsWith('Bearer ') ? request.headers.authorization.slice(7) : null; if (!token) return next(new AppError('Authentication required.', 401)); try { request.auth = { userId: jwt.verify(token, env.jwtSecret).sub }; next(); } catch { next(new AppError('Invalid or expired access token.', 401)); } }
