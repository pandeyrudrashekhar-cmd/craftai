import archiver from 'archiver';
import { PassThrough } from 'node:stream';
import { AppError } from '../utils/appError.js';

export async function findDownloadProject(prismaClient, projectId, userId) {
  const project = await prismaClient.project.findUnique({
    where: { id: projectId },
    select: { id: true, title: true, userId: true, files: { select: { path: true, content: true }, orderBy: { path: 'asc' } } }
  });
  if (!project) throw new AppError('Project not found.', 404);
  if (project.userId !== userId) throw new AppError('You do not have access to this project.', 403);
  return project;
}

function isSafeArchivePath(path) {
  return typeof path === 'string'
    && path.length > 0
    && !path.startsWith('/')
    && !path.includes('\\')
    && !path.split('/').some((segment) => !segment || segment === '.' || segment === '..');
}

export function getSafeDownloadFilename(title) {
  const safeTitle = String(title || '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  return `${safeTitle || 'craftai-project'}.zip`;
}

export async function buildProjectZip(files) {
  for (const file of files) {
    if (!isSafeArchivePath(file.path)) {
      throw new AppError(`Cannot include unsafe project file path: ${file.path}`, 400);
    }
  }

  const output = new PassThrough();
  const chunks = [];
  output.on('data', (chunk) => chunks.push(chunk));

  const archive = archiver('zip', { zlib: { level: 9 } });
  const archiveError = new Promise((_, reject) => archive.on('error', reject));
  const outputEnd = new Promise((resolve) => output.on('end', resolve));
  archive.pipe(output);

  for (const file of files) {
    archive.append(file.content, { name: file.path });
  }

  await archive.finalize();
  await Promise.race([outputEnd, archiveError]);
  return Buffer.concat(chunks);
}
