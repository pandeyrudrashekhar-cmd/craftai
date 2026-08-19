import assert from 'node:assert/strict';
import {
  normalizeCustomDomain,
  isValidCustomDomain,
  buildCustomDomainInstructions,
  verifyCustomDomainRecord
} from '../services/customDomainService.js';

assert.equal(normalizeCustomDomain('  HTTPS://WWW.Example.com/path?x=1  '), 'www.example.com');
assert.equal(normalizeCustomDomain('example.com/'), 'example.com');
assert.equal(normalizeCustomDomain('https://sub.example.com/abc'), 'sub.example.com');
assert.equal(normalizeCustomDomain('  http://   '), '');
assert.equal(isValidCustomDomain('example.com'), true);
assert.equal(isValidCustomDomain('www.example.com'), true);
assert.equal(isValidCustomDomain('sub.example.com'), true);
assert.equal(isValidCustomDomain('hello'), false);
assert.equal(isValidCustomDomain('abc'), false);
assert.equal(isValidCustomDomain('abc..com'), false);
assert.equal(isValidCustomDomain('http://example.com'), false);
assert.equal(isValidCustomDomain('example'), false);

const originalTarget = process.env.CUSTOM_DOMAIN_TARGET;
process.env.CUSTOM_DOMAIN_TARGET = 'craftai.example.net';
const instructions = buildCustomDomainInstructions('example.com');
assert.equal(instructions.type, 'CNAME');
assert.equal(instructions.name, 'www');
assert.ok(instructions.value.length > 0);

const verification = await verifyCustomDomainRecord('example.com');
assert.equal(typeof verification.verified, 'boolean');
assert.equal(typeof verification.target, 'string');
assert.ok(Array.isArray(verification.candidates));
if (originalTarget === undefined) delete process.env.CUSTOM_DOMAIN_TARGET;
else process.env.CUSTOM_DOMAIN_TARGET = originalTarget;

console.log('Custom domain service tests passed.');
