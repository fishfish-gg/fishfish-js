import type { Interceptable } from 'undici';
import { MockAgent, setGlobalDispatcher } from 'undici';
import type { MockInterceptor } from 'undici/types/mock-interceptor.js';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { FishFishApi, Permission } from '../dist/index.js';

let mockAgent: MockAgent;
let mockPool: Interceptable;

const ScamDomains = [
	'scam-domain.com',
	'bad-domain.com',
	'horrible-domain.com',
	'awful-domain.com',
	'evil-domain.com',
	'very-bad-domain.com',
	'very-evil-domain.com',
	'very-awful-domain.com',
];

const ScamUrls = [
	'https://scam-url.com/bad-path',
	'https://bad-url.com/bad-path',
	'https://horrible-url.com/bad-path',
	'https://awful-url.com/bad-path',
	'https://evil-url.com/bad-path',
	'https://very-bad-url.com/bad-path',
	'https://very-evil-url.com/bad-path',
];

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
	expect(() => new FishFishApi()).toThrowError('Expected a string but received: undefined');
	// @ts-expect-error: Invalid options test
	expect(() => new FishFishApi('super-valid-api-key')).toThrowError(
		'You need to provide at least one permission for the session token.',
	);
});

test('Test: Create token validation', async () => {
	const api = new FishFishApi('super-valid-api-key', { defaultPermissions: [Permission.Domains] });

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

	expect(await api.getSessionToken()).toStrictEqual({
		expires: new Date(expires * 1_000),
		token: 'super-valid-session-token',
	});
});
