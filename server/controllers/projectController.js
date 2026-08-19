import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { AppError } from '../utils/appError.js';
import { createStarterFiles } from '../utils/starterFiles.js';
import { buildProjectZip, findDownloadProject, getSafeDownloadFilename } from '../services/projectDownloadService.js';

const frameworkValues = ['React', 'Next.js', 'Vue', 'HTML', 'Node', 'Express', 'Other'];
const createProjectSchema = z.object({
  title: z.string().trim().min(3).max(60),
  description: z.string().trim().max(500).optional().transform((value) => value || null),
  framework: z.enum(frameworkValues).default('React')
});
const updateProjectSchema = z.object({
  title: z.string().trim().min(3).max(60).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  thumbnail: z.string().url().max(2048).nullable().optional(),
  framework: z.enum(frameworkValues).optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional()
}).refine((data) => Object.keys(data).length > 0, 'Provide at least one field to update.');

const projectSelect = { id: true, title: true, description: true, thumbnail: true, framework: true, status: true, createdAt: true, updatedAt: true };
const parse = (schema, input) => { try { return schema.parse(input); } catch (error) { if (error instanceof z.ZodError) throw new AppError(error.issues[0].message, 400); throw error; } };

export async function createProject(request, response, next) {
  try { const data = parse(createProjectSchema, request.body); const project = await prisma.project.create({ data: { ...data, userId: request.auth.userId, files: { create: createStarterFiles(data.title) } }, select: projectSelect }); response.status(201).json({ project }); } catch (error) { next(error); }
}
export async function listProjects(request, response, next) {
  try { const projects = await prisma.project.findMany({ where: { userId: request.auth.userId }, select: projectSelect, orderBy: { updatedAt: 'desc' } }); response.status(200).json({ projects }); } catch (error) { next(error); }
}
export async function getProject(request, response, next) {
  try { const project = await prisma.project.findFirst({ where: { id: request.params.id, userId: request.auth.userId }, select: projectSelect }); if (!project) throw new AppError('Project not found.', 404); response.status(200).json({ project }); } catch (error) { next(error); }
}
export async function downloadProject(request, response, next) {
  try {
    const project = await findDownloadProject(prisma, request.params.id, request.auth.userId);

    const archive = await buildProjectZip(project.files);
    response.setHeader('Content-Type', 'application/zip');
    response.setHeader('Content-Disposition', `attachment; filename="${getSafeDownloadFilename(project.title)}"`);
    response.status(200).send(archive);
  } catch (error) { next(error); }
}
export async function updateProject(request, response, next) {
  try { const data = parse(updateProjectSchema, request.body); const result = await prisma.project.updateMany({ where: { id: request.params.id, userId: request.auth.userId }, data }); if (!result.count) throw new AppError('Project not found.', 404); const project = await prisma.project.findUnique({ where: { id: request.params.id }, select: projectSelect }); response.status(200).json({ project }); } catch (error) { next(error); }
}
export async function deleteProject(request, response, next) {
  try { const result = await prisma.project.deleteMany({ where: { id: request.params.id, userId: request.auth.userId } }); if (!result.count) throw new AppError('Project not found.', 404); response.status(204).send(); } catch (error) { next(error); }
}
