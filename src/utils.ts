import type { Dispatcher } from 'undici';
import { ErrorsMessages } from './errors.js';
import type { FishFishDomain, FishFishURL } from './structures/api.js';
import type { RawDomainData, RawURLData } from './types.js';

export function assertString(value: unknown): asserts value is string {
	if (typeof value !== 'string') {
		throw new TypeError(ErrorsMessages.INVALID_TYPE_STRING + typeof value);
	}
}

export function transformData<T = FishFishDomain | FishFishURL>(data: RawDomainData | RawURLData): T {
	return {
		...data,
		added: new Date(data.added * 1_000),
		checked: new Date(data.checked * 1_000),
	} as unknown as T;
}

export async function validateResponse(response: Dispatcher.ResponseData, hasSessionToken = false) {
	if (response.statusCode === 401) {
		throw new Error(hasSessionToken ? ErrorsMessages.SESSION_TOKEN_UNAUTHORIZED : ErrorsMessages.API_KEY_UNAUTHORIZED);
	}

	if (response.statusCode === 429) {
		throw new Error(ErrorsMessages.RATE_LIMITED);
	}

	if (response.statusCode < 200 || response.statusCode > 299) {
		throw new Error(`Unexpected status code ${response.statusCode}: ${await response.body.text()}`);
	}
}
