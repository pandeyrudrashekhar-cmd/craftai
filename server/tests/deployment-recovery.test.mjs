import assert from 'node:assert/strict';
import { prisma } from '../config/prisma.js';
import { recoverBuildingDeployments } from '../controllers/deploymentController.js';

const originalDeploymentUpdateMany = prisma.deployment.updateMany;
const originalDeploymentFindMany = prisma.deployment.findMany;
const originalDeploymentUpdate = prisma.deployment.update;
const originalProjectFileFindMany = prisma.projectFile.findMany;
const originalVercelToken = process.env.VERCEL_TOKEN;

let releaseFiles;
let fileReads = 0;
try {
  delete process.env.VERCEL_TOKEN;
  prisma.deployment.updateMany = async () => ({ count: 1 });
  prisma.deployment.findMany = async () => ([{ id: 'deployment-1', projectId: 'project-1', provider: 'VERCEL', externalId: 'provider-1' }]);
  prisma.deployment.update = async () => ({ id: 'deployment-1' });
  prisma.projectFile.findMany = async () => {
    fileReads += 1;
    return new Promise((resolve) => { releaseFiles = resolve; });
  };

  const firstRecovery = recoverBuildingDeployments();
  await new Promise((resolve) => setImmediate(resolve));
  const secondRecovery = recoverBuildingDeployments();
  await new Promise((resolve) => setImmediate(resolve));
  releaseFiles([]);
  await Promise.all([firstRecovery, secondRecovery]);
  assert.equal(fileReads, 1);
  console.log('TEST 1 PASS: Concurrent recovery does not duplicate in-flight work');
} finally {
  prisma.deployment.updateMany = originalDeploymentUpdateMany;
  prisma.deployment.findMany = originalDeploymentFindMany;
  prisma.deployment.update = originalDeploymentUpdate;
  prisma.projectFile.findMany = originalProjectFileFindMany;
  if (originalVercelToken === undefined) delete process.env.VERCEL_TOKEN;
  else process.env.VERCEL_TOKEN = originalVercelToken;
}

console.log('Deployment recovery tests passed.');
