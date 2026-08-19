import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
import { buildProjectZip, findDownloadProject, getSafeDownloadFilename } from '../services/projectDownloadService.js';

function readZipEntries(buffer) {
  const entries = [];
  const endOffset = buffer.lastIndexOf(Buffer.from('PK\x05\x06'));
  const centralDirectoryOffset = buffer.readUInt32LE(endOffset + 16);
  const entryCount = buffer.readUInt16LE(endOffset + 10);
  let offset = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    assert.equal(buffer.toString('ascii', offset, offset + 4), 'PK\x01\x02');
    const compression = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    entries.push({ name, content: compression === 8 ? inflateRawSync(compressed).toString() : compressed.toString() });
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

const project = {
  id: 'project-1',
  title: 'My Website: Demo',
  userId: 'user-1',
  files: [
    { path: 'index.html', content: '<h1>Hello</h1>' },
    { path: 'src/components/App.jsx', content: 'export default function App() {}' },
    { path: 'src/assets/data.json', content: '{"ok":true}' }
  ]
};

const prisma = { project: { findUnique: async () => project } };
const owned = await findDownloadProject(prisma, 'project-1', 'user-1');
const zip = await buildProjectZip(owned.files);
const entries = readZipEntries(zip);
assert.deepEqual(entries, project.files.map((file) => ({ name: file.path, content: file.content })));
console.log('TEST 1 PASS: ZIP preserves nested paths and exact file contents');

await assert.rejects(() => findDownloadProject({ project: { findUnique: async () => project } }, 'project-1', 'other-user'), { statusCode: 403 });
await assert.rejects(() => findDownloadProject({ project: { findUnique: async () => null } }, 'missing', 'user-1'), { statusCode: 404 });
console.log('TEST 2 PASS: Ownership and missing-project errors');

await assert.rejects(() => buildProjectZip([{ path: '../secret.txt', content: 'secret' }]), { statusCode: 400 });
await assert.rejects(() => buildProjectZip([{ path: '/absolute.txt', content: 'secret' }]), { statusCode: 400 });
console.log('TEST 3 PASS: Malicious archive paths are rejected');

const emptyEntries = readZipEntries(await buildProjectZip([]));
assert.deepEqual(emptyEntries, []);
assert.equal(getSafeDownloadFilename('  My Website: Demo  '), 'My-Website-Demo.zip');
assert.equal(getSafeDownloadFilename('***'), 'craftai-project.zip');
console.log('TEST 4 PASS: Empty projects and safe filenames');

console.log('Project download service tests passed.');