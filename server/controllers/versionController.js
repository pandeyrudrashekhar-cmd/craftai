import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { AppError } from '../utils/appError.js';
import { limits } from '../config/limits.js';

const createVersionSchema = z.object({
  label: z.string().trim().min(1).max(100).optional().transform((value) => value || null)
});

const versionSelect = { id: true, projectId: true, label: true, snapshot: true, createdAt: true };

const parse = (schema, input) => {
  try {
    return schema.parse(input);
  } catch (error) {
    if (error instanceof z.ZodError) throw new AppError(error.issues[0].message, 400);
    throw error;
  }
};

async function findOwnedProject(projectId, userId) {
  const project = await prisma.project.findFirst({ where: { id: projectId, userId } });
  if (!project) throw new AppError('Project not found.', 404);
  return project;
}

function isValidSnapshotPath(path) {
  return typeof path === 'string'
    && path.trim().length > 0
    && path.length <= 255
    && !path.startsWith('/')
    && !path.includes('\\')
    && !path.split('/').some((part) => !part || part === '.' || part === '..');
}

function parseSnapshot(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.files)) {
    throw new AppError('Invalid version snapshot.', 400);
  }

  for (const file of snapshot.files) {
    if (!file || !isValidSnapshotPath(file.path) || typeof file.content !== 'string') {
      throw new AppError('Invalid version snapshot.', 400);
    }
  }

  return snapshot.files;
}

export async function createVersion(request, response, next) {
  try {
    await findOwnedProject(request.params.projectId, request.auth.userId);
    const versionCount = await prisma.versionHistory.count({ where: { projectId: request.params.projectId } });
    if (versionCount >= limits.maxVersionsPerProject) throw new AppError('Version history limit reached.', 413);
    
    // Get all project files as snapshot
    const files = await prisma.projectFile.findMany({
      where: { projectId: request.params.projectId },
      select: { path: true, content: true, language: true }
    });

    const data = parse(createVersionSchema, request.body);
    
    const version = await prisma.versionHistory.create({
      data: {
        projectId: request.params.projectId,
        label: data.label,
        snapshot: { files }
      },
      select: versionSelect
    });

    response.status(201).json({ version });
  } catch (error) {
    next(error);
  }
}

export async function listVersions(request, response, next) {
  try {
    await findOwnedProject(request.params.projectId, request.auth.userId);
    
    const versions = await prisma.versionHistory.findMany({
      where: { projectId: request.params.projectId },
      select: versionSelect,
      orderBy: { createdAt: 'desc' }
    });

    response.status(200).json({ versions });
  } catch (error) {
    next(error);
  }
}

export async function getVersion(request, response, next) {
  try {
    await findOwnedProject(request.params.projectId, request.auth.userId);
    
    const version = await prisma.versionHistory.findFirst({
      where: { id: request.params.versionId, projectId: request.params.projectId },
      select: versionSelect
    });

    if (!version) throw new AppError('Version not found.', 404);
    
    response.status(200).json({ version });
  } catch (error) {
    next(error);
  }
}

export async function restoreVersion(request, response, next) {
  try {
    await findOwnedProject(request.params.projectId, request.auth.userId);
    
    const version = await prisma.versionHistory.findFirst({
      where: { id: request.params.versionId, projectId: request.params.projectId }
    });

    if (!version) throw new AppError('Version not found.', 404);

    const files = parseSnapshot(version.snapshot);
    const restoredFiles = await prisma.$transaction(async (transaction) => {
      await transaction.projectFile.deleteMany({
        where: { projectId: request.params.projectId }
      });

      if (files.length) {
        await transaction.projectFile.createMany({
          data: files.map((file) => ({
            projectId: request.params.projectId,
            path: file.path,
            content: file.content,
            language: file.language || null
          }))
        });
      }

      return transaction.projectFile.findMany({
        where: { projectId: request.params.projectId },
        select: { id: true, path: true, content: true, language: true, createdAt: true, updatedAt: true },
        orderBy: { path: 'asc' }
      });
    });

    response.status(200).json({ files: restoredFiles });
  } catch (error) {
    next(error);
  }
}

export async function deleteVersion(request, response, next) {
  try {
    await findOwnedProject(request.params.projectId, request.auth.userId);
    
    const result = await prisma.versionHistory.deleteMany({
      where: { id: request.params.versionId, projectId: request.params.projectId }
    });

    if (!result.count) throw new AppError('Version not found.', 404);

    response.status(204).send();
  } catch (error) {
    next(error);
  }
}
