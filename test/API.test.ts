import type { Interceptable } from 'undici';
import { MockAgent, setGlobalDispatcher } from 'undici';
import type { MockInterceptor } from 'undici/types/mock-interceptor.js';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { Category, ErrorsMessages, FishFishApi, Permission } from '../dist/index.js';
import { createRandomRawData, createRandomStringData } from './data.js';

const ScamDomains = createRandomStringData(Category.Phishing, 'domain');
const ScamUrls = createRandomStringData(Category.Phishing, 'url');

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
	expect(() => new FishFishApi()).toThrowError((ErrorsMessages.INVALID_TYPE_STRING as string) + 'undefined');
	// @ts-expect-error: Invalid options test
	expect(() => new FishFishApi('super-valid-api-key')).toThrowError(ErrorsMessages.MISSING_DEFAULT_PERMISSIONS);

	expect(() => new FishFishApi('super-valid-api-key', { defaultPermissions: [Permission.Urls] })).not.toThrowError();
});

test('Test: Static properties', async () => {
	mockPool
		.intercept({
			path: '/v1/domains?category=phishing&full=false',
			method: 'GET',
		})
		.reply(() => ({
			statusCode: 200,
			data: ScamDomains,
			...responseOptions,
		}))
		.times(1);

	expect(await FishFishApi.getAllDomains(Category.Phishing)).toStrictEqual(ScamDomains);

	mockPool
		.intercept({
			path: '/v1/urls?category=phishing&full=false',
			method: 'GET',
		})
		.reply(() => ({
			statusCode: 200,
			data: ScamUrls,
			...responseOptions,
		}))
		.times(1);

	expect(await FishFishApi.getAllUrls(Category.Phishing)).toStrictEqual(ScamUrls);

	const domain = createRandomRawData(Category.Phishing, 'domain');

	mockPool
		.intercept({
			path: `/v1/domains/${domain.domain}`,
			method: 'GET',
		})
		.reply(() => ({
			statusCode: 200,
			data: domain,
			...responseOptions,
		}))
		.times(1);

	expect(await FishFishApi.getDomain(domain.domain)).toStrictEqual(domain);

	const url = createRandomRawData(Category.Phishing, 'url');

	mockPool
		.intercept({
			path: `/v1/urls/${url.url}`,
			method: 'GET',
		})
		.reply(() => ({
			statusCode: 200,
			data: url,
			...responseOptions,
		}))
		.times(1);

	expect(await FishFishApi.getUrl(url.url)).toStrictEqual(url);
});

test('Test: Missing permissions error', async () => {
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
		.times(2);

	mockPool
		.intercept({
			path: '/v1/urls/test-url-get',
			method: 'GET',
		})
		.reply(() => ({
			statusCode: 200,
			data: createRandomRawData(Category.Phishing, 'url'),
			...responseOptions,
		}))
		.times(1);

	mockPool
		.intercept({
			path: '/v1/domains/test-domain-get',
			method: 'GET',
		})
		.reply(() => ({
			statusCode: 200,
			data: createRandomRawData(Category.Phishing, 'domain'),
			...responseOptions,
		}))
		.times(1);

	const domainApi = new FishFishApi('super-valid-api-key', { defaultPermissions: [Permission.Domains] });
	await expect(async () => domainApi.deleteURL('test-url-delete')).rejects.toThrowError(
		ErrorsMessages.SESSION_TOKEN_NO_PERMISSION,
	);
	await expect(domainApi.getURL('test-url-get')).resolves.not.toThrowError();
	await expect(async () =>
		domainApi.insertURL('test-url-insert', { category: Category.Malware, description: 'Bad url' }),
	).rejects.toThrowError(ErrorsMessages.SESSION_TOKEN_NO_PERMISSION);
	await expect(async () => domainApi.patchURL('test-url-patch', { category: Category.Malware })).rejects.toThrowError(
		ErrorsMessages.SESSION_TOKEN_NO_PERMISSION,
	);

	const urlApi = new FishFishApi('super-valid-api-key', { defaultPermissions: [Permission.Urls] });
	await expect(async () => urlApi.deleteDomain('test-domain-delete')).rejects.toThrowError(
		ErrorsMessages.SESSION_TOKEN_NO_PERMISSION,
	);
	await expect(urlApi.getDomain('test-domain-get')).resolves.not.toThrowError();
	await expect(async () =>
		urlApi.insertDomain('test-domain-insert', { category: Category.Malware, description: 'Bad domain' }),
	).rejects.toThrowError(ErrorsMessages.SESSION_TOKEN_NO_PERMISSION);
	await expect(async () =>
		urlApi.patchDomain('test-domain-patch', { category: Category.Malware }),
	).rejects.toThrowError(ErrorsMessages.SESSION_TOKEN_NO_PERMISSION);
});

test('Test: Unauthorized session token', async () => {
	const api = new FishFishApi('super-valid-api-key', { defaultPermissions: [Permission.Domains] });

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

	mockPool
		.intercept({
			path: '/v1/domains/test-domain-insert',
			method: 'POST',
		})
		.reply(() => ({
			statusCode: 401,
		}))
		.times(1);

	await expect(async () =>
		api.insertDomain('test-domain-insert', {
			category: Category.Malware,
			description: 'Bad domain',
		}),
	).rejects.toThrowError(ErrorsMessages.SESSION_TOKEN_UNAUTHORIZED);
});
