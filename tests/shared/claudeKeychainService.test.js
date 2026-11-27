'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const { claudeKeychainServices, readClaudeCredentials } = require('../../src/shared/providers/claude/limits');

// Claude Code keeps the login of a custom CLAUDE_CONFIG_DIR under its own keychain
// service: "Claude Code-credentials-" plus the first 8 hex digits of sha256(dir).
const CONFIG_DIR = '/opt/example/claude-config';
const SUFFIXED = 'Claude Code-credentials-089f91a8';

const login = (subscriptionType, rateLimitTier) => JSON.stringify({
  claudeAiOauth: {
    accessToken: 'access-token', refreshToken: 'refresh-token', expiresAt: Date.now() + 3_600_000,
    subscriptionType, rateLimitTier
  }
});

// A stand-in for `security find-generic-password -s <service> -w`.
function keychain(items) {
  const asked = [];
  const spawn = (_command, args) => {
    const service = args[args.indexOf('-s') + 1];
    asked.push(service);
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => {};
    process.nextTick(() => {
      if (Object.hasOwn(items, service)) {
        child.stdout.emit('data', items[service]);
        child.emit('close', 0);
      } else {
        child.stderr.emit('data', 'security: The specified item could not be found in the keychain.');
        child.emit('close', 44);
      }
    });
    return child;
  };
  return { spawn, asked };
}

const missingFile = async () => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }); };

test('claudeKeychainServices follows Claude Code for a custom config dir', () => {
  assert.deepEqual(claudeKeychainServices({}), ['Claude Code-credentials']);
  assert.deepEqual(claudeKeychainServices({ CLAUDE_CONFIG_DIR: '  ' }), ['Claude Code-credentials']);
  assert.deepEqual(claudeKeychainServices({ CLAUDE_CONFIG_DIR: CONFIG_DIR }), [SUFFIXED, 'Claude Code-credentials']);
});

test('reads the login Claude Code stored for CLAUDE_CONFIG_DIR, with its plan', async () => {
  const { spawn, asked } = keychain({
    [SUFFIXED]: login('max', 'default_claude_max_20x'),
    'Claude Code-credentials': login('pro', 'default_claude_pro')
  });
  const credentials = await readClaudeCredentials({
    env: { CLAUDE_CONFIG_DIR: CONFIG_DIR }, platform: 'darwin', spawn,
    readFile: missingFile, stat: missingFile, readWindowsCredential: false
  });
  assert.equal(asked[0], SUFFIXED);
  assert.equal(credentials.source, 'keychain');
  assert.equal(credentials.accountLabel, 'Ultra');
  assert.match(credentials.identity, new RegExp(`^keychain:${SUFFIXED}:`));
});

test('falls back to the default login when the custom dir has none', async () => {
  const { spawn, asked } = keychain({ 'Claude Code-credentials': login('pro', 'default_claude_pro') });
  const credentials = await readClaudeCredentials({
    env: { CLAUDE_CONFIG_DIR: CONFIG_DIR }, platform: 'darwin', spawn,
    readFile: missingFile, stat: missingFile, readWindowsCredential: false
  });
  assert.deepEqual(asked, [SUFFIXED, 'Claude Code-credentials']);
  assert.equal(credentials.accountLabel, 'Pro');
  assert.match(credentials.identity, /^keychain:Claude Code-credentials:/);
});

test('without CLAUDE_CONFIG_DIR only the default login is read', async () => {
  const { spawn, asked } = keychain({ 'Claude Code-credentials': login('pro', 'default_claude_pro') });
  await readClaudeCredentials({
    env: {}, platform: 'darwin', spawn, readFile: missingFile, stat: missingFile, readWindowsCredential: false
  });
  assert.deepEqual(asked, ['Claude Code-credentials']);
});
