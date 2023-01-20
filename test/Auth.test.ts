import process from 'node:process';
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
	expect(() => new FishFishAuth()).toThrowError(ErrorsMessages.MISSING_API_KEY);

	expect(
		() =>
			new FishFishAuth({
				apiKey: 'super-valid-api-key',
				permissions: [Permission.Domains],
			}),
	).not.toThrowError();

	process.env.FISHFISH_API_KEY = 'super-valid-api-key';

	expect(() => new FishFishAuth()).not.toThrowError();
});

test('Test: Create token validation', async () => {
	const auth = new FishFishAuth({
		apiKey: 'super-valid-api-key',
		permissions: [Permission.Domains],
	});

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

	expect(await auth.createSessionToken()).toStrictEqual({
		expires: new Date(expires * 1_000),
		token: 'super-valid-session-token',
		permissions: [Permission.Domains],
	});
});

test('Test: validateResponse', async () => {
	const api = new FishFishAuth({
		apiKey: 'super-valid-api-key',
		permissions: [Permission.Domains],
	});

	mockPool
		.intercept({
			path: '/v1/users/@me/tokens',
			method: 'POST',
		})
		.reply(() => ({
			statusCode: 401,
		}))
		.times(1);

	await expect(async () => api.createSessionToken()).rejects.toThrowError(ErrorsMessages.API_KEY_UNAUTHORIZED);

	mockPool
		.intercept({
			path: '/v1/users/@me/tokens',
			method: 'POST',
		})
		.reply(() => ({
			statusCode: 429,
		}))
		.times(1);

	await expect(async () => api.createSessionToken()).rejects.toThrowError(ErrorsMessages.RATE_LIMITED);

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

	await expect(async () => api.createSessionToken()).rejects.toThrowError('Unexpected status code 404: Not found');

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

	await expect(api.createSessionToken()).resolves.not.toThrowError();
});

test('Test: Expire token', async () => {
	const auth = new FishFishAuth({
		apiKey: 'super-valid-api-key',
		permissions: [Permission.Domains],
	});

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

	await expect(auth.createSessionToken()).resolves.toStrictEqual({
		expires: expect.any(Date),
		token: 'super-valid-session-token',
		permissions: [Permission.Domains],
	});
	expect(auth.hasSessionToken).toBe(true);

	await wait(10);

	expect(auth.hasSessionToken).toBe(false);
});
