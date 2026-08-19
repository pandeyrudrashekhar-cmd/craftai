import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { AppError } from '../utils/appError.js';
import { buildPublishedDocument, readPublishedDocument, removePublishedDocument, writePublishedDocument } from '../services/publishService.js';
import { buildCustomDomainInstructions, isValidCustomDomain, normalizeCustomDomain, verifyCustomDomainRecord } from '../services/customDomainService.js';
import { assertVercelConfigured, createVercelDeployment, getVercelDeployment, waitForVercelDeployment } from '../services/vercelService.js';
import { assertNetlifyConfigured, createNetlifyDeployment, getNetlifyDeployment, waitForNetlifyDeployment } from '../services/netlifyService.js';
import { limits } from '../config/limits.js';

const publishProvider = 'OTHER';
const providerStartLocks = new Set();
const recoveryInFlight = new Set();

const deploymentSelect = { id: true, projectId: true, provider: true, status: true, url: true, externalId: true, errorMessage: true, attemptCount: true, lastAttemptAt: true, startedAt: true, completedAt: true, createdAt: true, updatedAt: true };

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


export async function publishProject(request, response, next) {
  try {
    const project = await findOwnedProject(request.params.projectId, request.auth.userId);
    const files = await prisma.projectFile.findMany({
      where: { projectId: project.id },
      select: { path: true, content: true, language: true },
      orderBy: { path: 'asc' }
    });

    if (!files.length) throw new AppError('Add at least one project file before publishing.', 400);

    const document = buildPublishedDocument(files);
    const existing = await prisma.deployment.findFirst({
      where: { projectId: project.id, provider: publishProvider },
      orderBy: { updatedAt: 'desc' },
      select: { id: true }
    });

    const deployment = existing
      ? await prisma.deployment.update({
          where: { id: existing.id },
          data: { status: 'BUILDING', url: null, attemptCount: { increment: 1 }, lastAttemptAt: new Date(), startedAt: new Date(), completedAt: null, errorMessage: null },
          select: deploymentSelect
        })
      : await prisma.deployment.create({
          data: { projectId: project.id, provider: publishProvider, status: 'BUILDING', attemptCount: 1, lastAttemptAt: new Date(), startedAt: new Date(), completedAt: null, errorMessage: null },
          select: deploymentSelect
        });

    try {
      await writePublishedDocument(deployment.id, document);
      const baseUrl = process.env.PUBLIC_URL?.replace(/\/$/, '') || `${request.protocol}://${request.get('host')}`;
      const url = `${baseUrl}/published/${deployment.id}`;
      const ready = await prisma.deployment.update({
        where: { id: deployment.id },
        data: { status: 'READY', url, completedAt: new Date(), lastAttemptAt: new Date() },
        select: deploymentSelect
      });
      response.status(200).json({ deployment: ready });
    } catch (error) {
      await prisma.deployment.update({ where: { id: deployment.id }, data: { status: 'FAILED', url: null, completedAt: new Date(), lastAttemptAt: new Date() } }).catch(() => {});
      throw error;
    }
  } catch (error) {
    next(error);
  }
}

export async function getPublishedProject(request, response, next) {
  try {
    const document = await readPublishedDocument(request.params.deploymentId);
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Security-Policy', [
      "default-src 'none'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "img-src data: blob: https:",
      "font-src data: https:",
      "style-src 'unsafe-inline' https:",
      "script-src 'unsafe-inline' https://unpkg.com https://esm.sh blob:",
      "connect-src https://unpkg.com https://esm.sh",
      "form-action 'none'",
      "sandbox allow-scripts allow-forms allow-modals allow-popups"
    ].join('; '));
    response.send(document);
  } catch (error) {
    if (error.code === 'ENOENT') return next(new AppError('Published website not found.', 404));
    next(error);
  }
}

async function finishVercelDeployment(deploymentId, projectId, files, existingExternalId = null) {
  try {
    const created = existingExternalId
      ? await getVercelDeployment(existingExternalId)
      : await createVercelDeployment({ projectId, files });
    if (!existingExternalId) {
      await prisma.deployment.update({
        where: { id: deploymentId },
        data: { externalId: created.externalId, url: created.url }
      });
    }

    const completed = created.readyState === 'READY'
      ? created
      : await waitForVercelDeployment(created.externalId);

    if (completed.readyState !== 'READY') {
      throw new AppError(completed.errorMessage || `Vercel deployment ended in ${completed.readyState}.`, 502);
    }

    await prisma.deployment.update({
      where: { id: deploymentId },
      data: { status: 'READY', url: completed.url || created.url, errorMessage: null, completedAt: new Date(), lastAttemptAt: new Date() }
    });
  } catch (error) {
    await prisma.deployment.update({
      where: { id: deploymentId },
      data: {
        status: 'FAILED',
        url: null,
        completedAt: new Date(),
        lastAttemptAt: new Date(),
        errorMessage: error.isOperational ? error.message : 'Vercel deployment failed.'
      }
    }).catch(() => {});
  }
}

export async function deployToVercel(request, response, next) {
  try {
    const project = await findOwnedProject(request.params.projectId, request.auth.userId);
    assertVercelConfigured();
    if (providerStartLocks.has(project.id)) throw new AppError('A deployment is already being started for this project.', 409);
    providerStartLocks.add(project.id);

    let deployment;
    let files;
    try {
      files = await prisma.projectFile.findMany({
        where: { projectId: project.id },
        select: { path: true, content: true },
        orderBy: { path: 'asc' }
      });

      if (!files.length) throw new AppError('Add at least one project file before deploying to Vercel.', 400);
      const activeCount = await prisma.deployment.count({ where: { projectId: project.id, status: 'BUILDING' } });
      if (activeCount >= limits.maxActiveDeploymentsPerProject) throw new AppError('Deployment limit reached. Wait for the current deployment to finish.', 409);

      deployment = await prisma.deployment.create({
        data: { projectId: project.id, provider: 'VERCEL', status: 'BUILDING', errorMessage: null, attemptCount: 1, lastAttemptAt: new Date(), startedAt: new Date() },
        select: deploymentSelect
      });
    } finally {
      providerStartLocks.delete(project.id);
    }

    void finishVercelDeployment(deployment.id, project.id, files);
    response.status(202).json({ deployment });
  } catch (error) {
    next(error);
  }
}

async function finishNetlifyDeployment(deploymentId, projectId, files, existingExternalId = null) {
  try {
    const created = existingExternalId
      ? await getNetlifyDeployment(existingExternalId)
      : await createNetlifyDeployment({ projectId, files });
    if (!existingExternalId) {
      await prisma.deployment.update({
        where: { id: deploymentId },
        data: { externalId: created.externalId, url: created.url }
      });
    }

    const completed = created.state === 'ready'
      ? created
      : await waitForNetlifyDeployment(created.externalId);

    if (completed.state !== 'ready') {
      throw new AppError(completed.errorMessage || `Netlify deployment ended in ${completed.state}.`, 502);
    }

    await prisma.deployment.update({
      where: { id: deploymentId },
      data: { status: 'READY', url: completed.url || created.url, errorMessage: null, completedAt: new Date(), lastAttemptAt: new Date() }
    });
  } catch (error) {
    await prisma.deployment.update({
      where: { id: deploymentId },
      data: {
        status: 'FAILED',
        url: null,
        completedAt: new Date(),
        lastAttemptAt: new Date(),
        errorMessage: error.isOperational ? error.message : 'Netlify deployment failed.'
      }
    }).catch(() => {});
  }
}

export async function recoverBuildingDeployments() {
  const staleCutoff = new Date(Date.now() - limits.deploymentStartTimeoutMs);
  await prisma.deployment.updateMany({
    where: { status: { in: ['PENDING', 'BUILDING'] }, externalId: null, provider: { in: ['VERCEL', 'NETLIFY'] }, updatedAt: { lt: staleCutoff } },
    data: { status: 'FAILED', url: null, completedAt: new Date(), errorMessage: 'Deployment did not start before the recovery timeout.' }
  });
  const deployments = await prisma.deployment.findMany({
    where: { status: 'BUILDING', externalId: { not: null }, provider: { in: ['VERCEL', 'NETLIFY'] }, OR: [{ lastAttemptAt: null }, { lastAttemptAt: { lt: staleCutoff } }] },
    select: { id: true, projectId: true, provider: true, externalId: true, lastAttemptAt: true }
  });
  for (const deployment of deployments) {
    if (recoveryInFlight.has(deployment.id)) continue;
    const claimed = await prisma.deployment.updateMany({
      where: {
        id: deployment.id,
        status: 'BUILDING',
        ...(deployment.lastAttemptAt ? { lastAttemptAt: deployment.lastAttemptAt } : { lastAttemptAt: null })
      },
      data: { attemptCount: { increment: 1 }, lastAttemptAt: new Date() }
    });
    if (!claimed.count) continue;
    recoveryInFlight.add(deployment.id);
    const finish = deployment.provider === 'VERCEL' ? finishVercelDeployment : finishNetlifyDeployment;
    try {
      const files = await prisma.projectFile.findMany({ where: { projectId: deployment.projectId }, select: { path: true, content: true }, orderBy: { path: 'asc' } });
      void finish(deployment.id, deployment.projectId, files, deployment.externalId).finally(() => recoveryInFlight.delete(deployment.id));
    } catch (error) {
      recoveryInFlight.delete(deployment.id);
      await prisma.deployment.update({ where: { id: deployment.id }, data: { status: 'FAILED', url: null, errorMessage: error.isOperational ? error.message : 'Deployment recovery failed.' } }).catch(() => {});
    }
  }
}

export async function deployToNetlify(request, response, next) {
  try {
    const project = await findOwnedProject(request.params.projectId, request.auth.userId);
    assertNetlifyConfigured();
    if (providerStartLocks.has(project.id)) throw new AppError('A deployment is already being started for this project.', 409);
    providerStartLocks.add(project.id);

    let deployment;
    let files;
    try {
      files = await prisma.projectFile.findMany({
        where: { projectId: project.id },
        select: { path: true, content: true },
        orderBy: { path: 'asc' }
      });

      if (!files.length) throw new AppError('Add at least one project file before deploying to Netlify.', 400);
      const activeCount = await prisma.deployment.count({ where: { projectId: project.id, status: 'BUILDING' } });
      if (activeCount >= limits.maxActiveDeploymentsPerProject) throw new AppError('Deployment limit reached. Wait for the current deployment to finish.', 409);

      deployment = await prisma.deployment.create({
        data: { projectId: project.id, provider: 'NETLIFY', status: 'BUILDING', errorMessage: null, attemptCount: 1, lastAttemptAt: new Date(), startedAt: new Date() },
        select: deploymentSelect
      });
    } finally {
      providerStartLocks.delete(project.id);
    }

    void finishNetlifyDeployment(deployment.id, project.id, files);
    response.status(202).json({ deployment });
  } catch (error) {
    next(error);
  }
}

export async function listDeployments(request, response, next) {
  try {
    await findOwnedProject(request.params.projectId, request.auth.userId);
    
    const deployments = await prisma.deployment.findMany({
      where: { projectId: request.params.projectId },
      select: deploymentSelect,
      orderBy: { createdAt: 'desc' }
    });

    response.status(200).json({ deployments });
  } catch (error) {
    next(error);
  }
}

export async function getDeployment(request, response, next) {
  try {
    await findOwnedProject(request.params.projectId, request.auth.userId);
    
    const deployment = await prisma.deployment.findFirst({
      where: { id: request.params.deploymentId, projectId: request.params.projectId },
      select: deploymentSelect
    });

    if (!deployment) throw new AppError('Deployment not found.', 404);
    
    response.status(200).json({ deployment });
  } catch (error) {
    next(error);
  }
}

export async function deleteDeployment(request, response, next) {
  try {
    await findOwnedProject(request.params.projectId, request.auth.userId);
    
    const deployment = await prisma.deployment.findFirst({
      where: { id: request.params.deploymentId, projectId: request.params.projectId },
      select: { provider: true }
    });
    if (!deployment) throw new AppError('Deployment not found.', 404);

    const result = await prisma.deployment.deleteMany({
      where: { id: request.params.deploymentId, projectId: request.params.projectId }
    });

    if (!result.count) throw new AppError('Deployment not found.', 404);

    if (deployment?.provider === 'OTHER') {
      await removePublishedDocument(request.params.deploymentId).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
      });
    }

    response.status(204).send();
  } catch (error) {
    next(error);
  }
}

const customDomainSchema = z.object({
  domain: z.string().trim().min(3).max(255)
});

function normalizeDomain(domain) {
  return normalizeCustomDomain(domain);
}

function isValidDomain(domain) {
  return isValidCustomDomain(domain);
}

function buildDomainApiResponse(customDomain, verification) {
  return {
    customDomain: {
      ...customDomain,
      instructions: buildCustomDomainInstructions(customDomain.domain)
    },
    verification
  };
}

async function findDeploymentForProject(projectId, deploymentId, userId) {
  const project = await findOwnedProject(projectId, userId);
  const deployment = await prisma.deployment.findFirst({
    where: { id: deploymentId, projectId: project.id }
  });

  if (!deployment) {
    throw new AppError('Deployment not found.', 404);
  }

  return deployment;
}

export async function connectCustomDomain(request, response, next) {
  try {
    const deployment = await findDeploymentForProject(
      request.params.projectId,
      request.params.deploymentId,
      request.auth.userId
    );

    const data = parse(customDomainSchema, request.body);
    const domain = normalizeDomain(data.domain);

    if (!isValidDomain(domain)) {
      throw new AppError('Invalid domain name.', 400);
    }

    const existingDomain = await prisma.customDomain.findUnique({
      where: {
        domain
      }
    });

    if (existingDomain) {
      throw new AppError(
        'This domain is already connected to a deployment.',
        409
      );
    }

    const customDomain = await prisma.customDomain.create({
      data: {
        deploymentId: deployment.id,
        domain,
        status: 'PENDING'
      }
    });

    const verification = await verifyCustomDomainRecord(domain);

    response.status(201).json(buildDomainApiResponse(customDomain, verification));

  } catch (error) {
    next(error);
  }
}

export async function getCustomDomain(request, response, next) {
  try {
    await findDeploymentForProject(
      request.params.projectId,
      request.params.deploymentId,
      request.auth.userId
    );

    const customDomain = await prisma.customDomain.findUnique({
      where: { deploymentId: request.params.deploymentId }
    });

    if (!customDomain) {
      throw new AppError('Custom domain not found.', 404);
    }

    const verification = await verifyCustomDomainRecord(customDomain.domain);
    response.status(200).json(buildDomainApiResponse(customDomain, verification));
  } catch (error) {
    next(error);
  }
}

export async function verifyCustomDomain(request, response, next) {
  try {
    await findDeploymentForProject(
      request.params.projectId,
      request.params.deploymentId,
      request.auth.userId
    );

    const customDomain = await prisma.customDomain.findUnique({
      where: { deploymentId: request.params.deploymentId }
    });

    if (!customDomain) {
      throw new AppError('Custom domain not found.', 404);
    }

    const verification = await verifyCustomDomainRecord(customDomain.domain);
    const nextStatus = verification.verified ? 'VERIFIED' : 'VERIFYING';

    const updatedDomain = await prisma.customDomain.update({
      where: { id: customDomain.id },
      data: {
        status: nextStatus,
        verificationType: 'CNAME',
        verificationValue: verification.target
      }
    });

    response.status(200).json(buildDomainApiResponse(updatedDomain, verification));
  } catch (error) {
    next(error);
  }
}

export async function deleteCustomDomain(request, response, next) {
  try {
    await findDeploymentForProject(
      request.params.projectId,
      request.params.deploymentId,
      request.auth.userId
    );

    const result = await prisma.customDomain.deleteMany({
      where: {
        deploymentId: request.params.deploymentId
      }
    });

    if (!result.count) {
      throw new AppError('Custom domain not found.', 404);
    }

    response.status(204).send();
  } catch (error) {
    next(error);
  }
}
