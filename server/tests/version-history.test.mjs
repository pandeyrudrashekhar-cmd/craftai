import assert from 'node:assert/strict';
import {
  createVersion,
  deleteVersion,
  getVersion,
  listVersions,
  restoreVersion
} from '../controllers/versionController.js';
import { prisma } from '../config/prisma.js';

function clone(value) {
  return structuredClone(value);
}

function makeDatabase({ files = [], versions = [], failRestore = false } = {}) {
  const state = {
    projects: new Map([
      ['project-1', { id: 'project-1', userId: 'user-1', title: 'Project One' }],
      ['project-2', { id: 'project-2', userId: 'user-2', title: 'Project Two' }]
    ]),
    files: new Map([
      ['project-1', clone(files)],
      ['project-2', []]
    ]),
    versions: new Map(versions.map((version) => [version.id, clone(version)])),
    nextVersionId: versions.length + 1,
    transactionCalls: 0,
    failRestore
  };

  const getFiles = (database, projectId) => (database.files.get(projectId) || []).map((file) => ({ ...file }));
  const orderedFiles = (database, projectId) => getFiles(database, projectId).sort((left, right) => left.path.localeCompare(right.path));
  const stampFiles = (items) => items.map((file, index) => ({
    id: file.id || `file-${index + 1}`,
    path: file.path,
    content: file.content,
    language: file.language || null,
    createdAt: new Date(0),
    updatedAt: new Date(0)
  }));

  const makeClient = (database) => ({
    project: {
      findFirst: async ({ where }) => {
        const project = database.projects.get(where.id);
        return project?.userId === where.userId ? { ...project } : null;
      }
    },
    projectFile: {
      findMany: async ({ where }) => stampFiles(orderedFiles(database, where.projectId)),
      deleteMany: async ({ where }) => {
        const current = database.files.get(where.projectId) || [];
        database.files.set(where.projectId, []);
        return { count: current.length };
      },
      createMany: async ({ data }) => {
        if (database.failRestore) throw new Error('forced restore failure');
        database.files.set(data[0]?.projectId || 'project-1', data.map((file, index) => ({ id: `restored-${index + 1}`, ...file })));
        return { count: data.length };
      }
    },
    versionHistory: {
      create: async ({ data }) => {
        const version = { id: `version-${database.nextVersionId++}`, ...data, createdAt: new Date() };
        database.versions.set(version.id, version);
        return clone(version);
      },
      findMany: async ({ where }) => [...database.versions.values()]
        .filter((version) => version.projectId === where.projectId)
        .sort((left, right) => right.createdAt - left.createdAt)
        .map(clone),
      findFirst: async ({ where }) => [...database.versions.values()]
        .find((version) => version.id === where.id && version.projectId === where.projectId) || null,
      deleteMany: async ({ where }) => {
        const version = database.versions.get(where.id);
        if (!version || version.projectId !== where.projectId) return { count: 0 };
        database.versions.delete(where.id);
        return { count: 1 };
      }
    },
    $transaction: async (callback) => {
      database.transactionCalls += 1;
      const transactionState = { ...database, files: new Map([...database.files].map(([id, items]) => [id, clone(items)])) };
      const result = await callback(makeClient(transactionState));
      database.files = transactionState.files;
      return result;
    }
  });

  return { state, client: makeClient(state) };
}

async function invoke(handler, database, { projectId = 'project-1', versionId, userId = 'user-1', body = {} } = {}) {
  const originalMethods = {
    projectFindFirst: prisma.project.findFirst,
    projectFileFindMany: prisma.projectFile.findMany,
    projectFileDeleteMany: prisma.projectFile.deleteMany,
    projectFileCreateMany: prisma.projectFile.createMany,
    versionCreate: prisma.versionHistory.create,
    versionFindMany: prisma.versionHistory.findMany,
    versionFindFirst: prisma.versionHistory.findFirst,
    versionDeleteMany: prisma.versionHistory.deleteMany,
    transaction: prisma.$transaction
  };
  prisma.project.findFirst = database.client.project.findFirst;
  prisma.projectFile.findMany = database.client.projectFile.findMany;
  prisma.projectFile.deleteMany = database.client.projectFile.deleteMany;
  prisma.projectFile.createMany = database.client.projectFile.createMany;
  prisma.versionHistory.create = database.client.versionHistory.create;
  prisma.versionHistory.findMany = database.client.versionHistory.findMany;
  prisma.versionHistory.findFirst = database.client.versionHistory.findFirst;
  prisma.versionHistory.deleteMany = database.client.versionHistory.deleteMany;
  prisma.$transaction = database.client.$transaction;

  const response = {
    statusCode: null,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    send(payload) { this.payload = payload; return this; }
  };
  let error = null;
  await handler(
    { params: { projectId, versionId }, auth: { userId }, body },
    response,
    (nextError) => { error = nextError; }
  );
  prisma.project.findFirst = originalMethods.projectFindFirst;
  prisma.projectFile.findMany = originalMethods.projectFileFindMany;
  prisma.projectFile.deleteMany = originalMethods.projectFileDeleteMany;
  prisma.projectFile.createMany = originalMethods.projectFileCreateMany;
  prisma.versionHistory.create = originalMethods.versionCreate;
  prisma.versionHistory.findMany = originalMethods.versionFindMany;
  prisma.versionHistory.findFirst = originalMethods.versionFindFirst;
  prisma.versionHistory.deleteMany = originalMethods.versionDeleteMany;
  prisma.$transaction = originalMethods.transaction;
  return { response, error };
}

const initialFiles = [
  { path: 'src/App.jsx', content: 'original app', language: 'jsx' },
  { path: 'src/index.css', content: 'original css', language: 'css' }
];

{
  const database = makeDatabase({ files: initialFiles });
  const result = await invoke(createVersion, database, { body: { label: 'Initial version' } });
  assert.equal(result.response.statusCode, 201);
  assert.equal(result.response.payload.version.label, 'Initial version');
  assert.deepEqual(result.response.payload.version.snapshot.files.map(({ path, content, language }) => ({ path, content, language })), initialFiles);
  console.log('TEST 1 PASS: Create version with multiple files');
}

{
  const database = makeDatabase();
  const result = await invoke(createVersion, database);
  assert.equal(result.response.statusCode, 201);
  assert.deepEqual(result.response.payload.version.snapshot, { files: [] });
  console.log('TEST 2 PASS: Empty project snapshot');
}

{
  const createdAt = [new Date('2026-01-01'), new Date('2026-02-01')];
  const database = makeDatabase({ versions: [
    { id: 'old', projectId: 'project-1', label: 'Old', snapshot: { files: [] }, createdAt: createdAt[0] },
    { id: 'new', projectId: 'project-1', label: 'New', snapshot: { files: [] }, createdAt: createdAt[1] }
  ] });
  const result = await invoke(listVersions, database);
  assert.deepEqual(result.response.payload.versions.map((version) => version.id), ['new', 'old']);
  console.log('TEST 3 PASS: List versions newest first');
}

{
  const version = { id: 'version-1', projectId: 'project-1', label: 'Saved', snapshot: { files: initialFiles }, createdAt: new Date() };
  const database = makeDatabase({ versions: [version] });
  const result = await invoke(getVersion, database, { versionId: version.id });
  assert.equal(result.response.statusCode, 200);
  assert.equal(result.response.payload.version.id, version.id);
  console.log('TEST 4 PASS: Get version successfully');
}

{
  const database = makeDatabase({ versions: [{ id: 'other-version', projectId: 'project-2', label: 'Other', snapshot: { files: [] }, createdAt: new Date() }] });
  const result = await invoke(getVersion, database, { versionId: 'other-version' });
  assert.equal(result.error.statusCode, 404);
  console.log('TEST 5 PASS: Version belonging to another project is rejected');
}

{
  const database = makeDatabase();
  const missingProject = await invoke(listVersions, database, { projectId: 'missing' });
  const missingVersion = await invoke(getVersion, database, { versionId: 'missing-version' });
  assert.equal(missingProject.error.statusCode, 404);
  assert.equal(missingVersion.error.statusCode, 404);
  console.log('TEST 6 PASS: Missing project and version');
}

{
  const version = { id: 'restore-version', projectId: 'project-1', label: 'Restored', snapshot: { files: [{ path: 'README.md', content: 'restored', language: 'markdown' }] }, createdAt: new Date() };
  const database = makeDatabase({ files: initialFiles, versions: [version] });
  const result = await invoke(restoreVersion, database, { versionId: version.id });
  assert.equal(result.response.statusCode, 200);
  assert.deepEqual(database.state.files.get('project-1').map(({ path, content }) => ({ path, content })), [{ path: 'README.md', content: 'restored' }]);
  assert.equal(database.state.transactionCalls, 1);
  console.log('TEST 7 PASS: Successful restore is transactional');
}

{
  const version = { id: 'empty-version', projectId: 'project-1', label: 'Empty', snapshot: { files: [] }, createdAt: new Date() };
  const database = makeDatabase({ files: initialFiles, versions: [version] });
  const result = await invoke(restoreVersion, database, { versionId: version.id });
  assert.equal(result.response.statusCode, 200);
  assert.deepEqual(database.state.files.get('project-1'), []);
  console.log('TEST 8 PASS: Restore empty snapshot');
}

{
  const version = { id: 'unsafe-version', projectId: 'project-1', snapshot: { files: [{ path: '../file', content: 'unsafe' }] }, createdAt: new Date() };
  const database = makeDatabase({ files: initialFiles, versions: [version] });
  const result = await invoke(restoreVersion, database, { versionId: version.id });
  assert.equal(result.error.statusCode, 400);
  assert.deepEqual(database.state.files.get('project-1'), initialFiles);
  assert.equal(database.state.transactionCalls, 0);
  console.log('TEST 9 PASS: Traversal snapshot path is rejected');
}

{
  const version = { id: 'failing-version', projectId: 'project-1', snapshot: { files: [{ path: 'new.txt', content: 'new' }] }, createdAt: new Date() };
  const database = makeDatabase({ files: initialFiles, versions: [version], failRestore: true });
  const result = await invoke(restoreVersion, database, { versionId: version.id });
  assert.equal(result.error.message, 'forced restore failure');
  assert.deepEqual(database.state.files.get('project-1'), initialFiles);
  assert.equal(database.state.transactionCalls, 1);
  console.log('TEST 10 PASS: Restore failure rolls back original files');
}

{
  const database = makeDatabase({ versions: [{ id: 'owned-version', projectId: 'project-1', snapshot: { files: [] }, createdAt: new Date() }] });
  const unauthorized = await invoke(deleteVersion, database, { versionId: 'owned-version', userId: 'user-2' });
  assert.equal(unauthorized.error.statusCode, 404);
  assert.ok(database.state.versions.has('owned-version'));
  const deleted = await invoke(deleteVersion, database, { versionId: 'owned-version' });
  assert.equal(deleted.response.statusCode, 204);
  assert.equal(database.state.versions.has('owned-version'), false);
  console.log('TEST 11 PASS: Delete version ownership protection');
}

console.log('Version History tests passed.');
