import assert from 'node:assert/strict';
import * as deploymentController from '../controllers/deploymentController.js';
import deploymentRoutes from '../routes/deploymentRoutes.js';
assert.equal(deploymentController.updateDeploymentStatus, undefined);
assert.equal(deploymentController.createDeployment, undefined);
assert.equal(deploymentRoutes.stack.some((layer) => layer.route?.path?.includes('/status')), false);

console.log('TEST 1 PASS: Unsupported generic deployment creation is removed');
console.log('TEST 2 PASS: Client-authored deployment status mutation is removed');

console.log('Deployment security tests passed.');
