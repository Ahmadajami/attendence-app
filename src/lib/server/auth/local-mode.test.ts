import { describe, expect, it } from 'vitest';
import { isLoopbackAddress, isLoopbackBindHost, localModeStartupProblem } from './local-mode.js';

describe('isLoopbackAddress', () => {
	it('accepts loopback addresses', () => {
		for (const address of ['127.0.0.1', '127.1.2.3', '::1', '::ffff:127.0.0.1', ' 127.0.0.1 ']) {
			expect(isLoopbackAddress(address), address).toBe(true);
		}
	});

	it('refuses everything else', () => {
		for (const address of [
			'10.0.0.5',
			'192.168.1.20',
			'0.0.0.0',
			'::',
			'::ffff:10.0.0.5',
			'128.0.0.1',
			'127.0.0',
			'127.0.0.256',
			'localhost',
			''
		]) {
			expect(isLoopbackAddress(address), address).toBe(false);
		}
	});
});

describe('isLoopbackBindHost', () => {
	it('only trusts explicit loopback hosts', () => {
		expect(isLoopbackBindHost('127.0.0.1')).toBe(true);
		expect(isLoopbackBindHost('::1')).toBe(true);
		expect(isLoopbackBindHost('0.0.0.0')).toBe(false);
		expect(isLoopbackBindHost('localhost')).toBe(false);
		expect(isLoopbackBindHost(undefined)).toBe(false);
	});
});

describe('localModeStartupProblem', () => {
	it('is safe on 127.0.0.1 without forwarded addresses', () => {
		expect(localModeStartupProblem({ HOST: '127.0.0.1' })).toBeNull();
	});

	it('refuses the adapter default (0.0.0.0) and a missing HOST', () => {
		expect(localModeStartupProblem({ HOST: '0.0.0.0' })).toMatch(/HOST=127\.0\.0\.1/);
		expect(localModeStartupProblem({})).toMatch(/HOST=127\.0\.0\.1/);
	});

	it('refuses client addresses taken from headers', () => {
		expect(
			localModeStartupProblem({ HOST: '127.0.0.1', ADDRESS_HEADER: 'x-forwarded-for' })
		).toMatch(/ADDRESS_HEADER/);
		expect(localModeStartupProblem({ HOST: '127.0.0.1', XFF_DEPTH: '1' })).toMatch(/XFF_DEPTH/);
	});
});
