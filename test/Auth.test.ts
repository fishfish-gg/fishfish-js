import { setTimeout as wait } from 'node:timers/promises';
import type { Interceptable } from 'undici';
import { MockAgent, setGlobalDispatcher } from 'undici';
import type { MockInterceptor } from 'undici/types/mock-interceptor.js';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { ErrorsMessages, FishFishAuth, Permission } from '../dist/index.js';

let mockAgent: MockAgent;
let mockPool: Interceptable;

const responseOptions: MockInterceptor.MockResponseOptions = {
	headers: {
		'content-type': 'application/json',
	},
};

beforeEach(() => {
	mockAgent = new MockAgent();
	mockAgent.disableNetConnect();
	setGlobalDispatcher(mockAgent);

	mockPool = mockAgent.get('https://api.fishfish.gg');
});

afterEach(async () => {
	await mockAgent.close();
});

test('Test: Constructor validation', async () => {
	// @ts-expect-error: Invalid API key test
	expect(() => new FishFishAuth()).toThrowError((ErrorsMessages.INVALID_TYPE_STRING as string) + 'undefined');
	// @ts-expect-error: Invalid options test
	expect(() => new FishFishAuth('super-valid-api-key')).toThrowError(ErrorsMessages.MISSING_DEFAULT_PERMISSIONS);

	expect(() => new FishFishAuth('super-valid-api-key', [Permission.Urls])).not.toThrowError();
});

test('Test: Create token validation', async () => {
	const auth = new FishFishAuth('super-valid-api-key', [Permission.Domains]);

	const expires = Math.floor(Date.now() / 1_000) + 1_000;

	mockPool
		.intercept({
			path: '/v1/users/@me/tokens',
			method: 'POST',
		})
		.reply(() => ({
			statusCode: 200,
			data: {
				token: 'super-valid-session-token',
				expires,
			},
			...responseOptions,
		}));

	expect(await auth.getSessionToken()).toStrictEqual({
		expires: new Date(expires * 1_000),
		token: 'super-valid-session-token',
		permissions: [Permission.Domains],
	});
});

test('Test: validateResponse', async () => {
	const api = new FishFishAuth('super-valid-api-key', [Permission.Domains]);

	mockPool
		.intercept({
			path: '/v1/users/@me/tokens',
			method: 'POST',
		})
		.reply(() => ({
			statusCode: 401,
		}))
		.times(1);

	await expect(async () => api.getSessionToken()).rejects.toThrowError(ErrorsMessages.API_KEY_UNAUTHORIZED);

	mockPool
		.intercept({
			path: '/v1/users/@me/tokens',
			method: 'POST',
		})
		.reply(() => ({
			statusCode: 429,
		}))
		.times(1);

	await expect(async () => api.getSessionToken()).rejects.toThrowError(ErrorsMessages.RATE_LIMITED);

	mockPool
		.intercept({
			path: '/v1/users/@me/tokens',
			method: 'POST',
		})
		.reply(() => ({
			statusCode: 404,
			data: 'Not found',
		}))
		.times(1);

	await expect(async () => api.getSessionToken()).rejects.toThrowError('Unexpected status code 404: Not found');

	mockPool
		.intercept({
			path: '/v1/users/@me/tokens',
			method: 'POST',
		})
		.reply(() => ({
			statusCode: 200,
			data: {
				token: 'super-valid-session-token',
				expires: Math.floor(Date.now() / 1_000) + 1_000,
			},
			...responseOptions,
		}))
		.times(1);

	await expect(api.getSessionToken()).resolves.not.toThrowError();
});

test('Test: Expire token', async () => {
	const auth = new FishFishAuth('super-valid-api-key', [Permission.Domains]);

	mockPool
		.intercept({
			path: '/v1/users/@me/tokens',
			method: 'POST',
		})
		.reply(() => ({
			statusCode: 200,
			data: {
				token: 'super-valid-session-token',
				expires: Math.floor(Date.now() / 1_000) + 0.01,
			},
			...responseOptions,
		}))
		.times(1);

	await expect(auth.getSessionToken()).resolves.toStrictEqual({
		expires: expect.any(Date),
		token: 'super-valid-session-token',
		permissions: [Permission.Domains],
	});
	expect(auth.hasSessionToken).toBe(true);

	await wait(10);

	expect(auth.hasSessionToken).toBe(false);
});
