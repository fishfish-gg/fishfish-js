import type { Dispatcher } from 'undici';
import { ErrorsMessages } from './errors.js';
import type { FishFishDomain, FishFishURL } from './structures/api.js';
import type { FishFishWebSocketData } from './types.js';

export function assertString(value: unknown, errorMessage?: ErrorsMessages): asserts value is string {
	if (typeof value !== 'string') {
		throw new TypeError((errorMessage ?? ErrorsMessages.INVALID_TYPE_STRING) + typeof value);
	}
}

export function transformData<T = FishFishDomain | FishFishURL>(data: FishFishWebSocketData<any>['data']): T {
	return {
		...data,
		lastUpdated: new Date(),
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
