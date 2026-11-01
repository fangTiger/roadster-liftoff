import test from 'node:test';
import assert from 'node:assert/strict';
import { roomsEnabledFor } from './rooms-flag.js';

test('开发环境开启多人房间', () => assert.equal(roomsEnabledFor({ DEV: true }), true));
test('生产环境默认隐藏多人房间', () => assert.equal(roomsEnabledFor({ DEV: false }), false));
test('生产环境显式开启', () => assert.equal(roomsEnabledFor({ DEV: false, VITE_ROOMS_ENABLED: '1' }), true));
