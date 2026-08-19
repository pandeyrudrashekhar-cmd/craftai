import bcrypt from 'bcrypt';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { AppError } from '../utils/appError.js';
import { createAccessToken } from '../utils/token.js';

const signupSchema = z.object({ name: z.string().trim().min(2).max(80), email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()), password: z.string().min(8).max(128) });
const loginSchema = z.object({ email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()), password: z.string().min(8).max(128) });
const presentUser = ({ id, name, email, createdAt }) => ({ id, name, email, createdAt });
const respondAuthenticated = (response, user) => response.status(200).json({ token: createAccessToken(user.id), user: presentUser(user) });

export async function signup(request, response, next) { try { const data = signupSchema.parse(request.body); const existing = await prisma.user.findUnique({ where: { email: data.email } }); if (existing) throw new AppError('An account already exists for this email.', 409); const passwordHash = await bcrypt.hash(data.password, 12); const user = await prisma.user.create({ data: { name: data.name, email: data.email, passwordHash } }); respondAuthenticated(response, user); } catch (error) { next(error instanceof z.ZodError ? new AppError(error.issues[0].message, 400) : error); } }
export async function login(request, response, next) { try { const data = loginSchema.parse(request.body); const user = await prisma.user.findUnique({ where: { email: data.email } }); if (!user || !(await bcrypt.compare(data.password, user.passwordHash))) throw new AppError('Invalid email or password.', 401); respondAuthenticated(response, user); } catch (error) { next(error instanceof z.ZodError ? new AppError(error.issues[0].message, 400) : error); } }
