import { expect, test } from 'vitest';
import { ErrorsMessages, FishFishWebSocket, Permission } from '../dist/index.js';

test('Test: Constructor validation', async () => {
	// @ts-expect-error: Invalid API key test
	expect(() => new FishFishWebSocket()).toThrowError((ErrorsMessages.INVALID_TYPE_STRING as string) + 'undefined');
	// @ts-expect-error: Invalid options test
	expect(() => new FishFishWebSocket('super-valid-api-key')).toThrowError(ErrorsMessages.MISSING_DEFAULT_PERMISSIONS);
	// @ts-expect-error: Invalid options test (callback)
	expect(() => new FishFishWebSocket('super-valid-api-key', { callback: 'not-a-function' })).toThrowError(
		(ErrorsMessages.INVALID_TYPE_FUNCTION as string) + 'string',
	);

	expect(() => new FishFishWebSocket('super-valid-api-key', { permissions: [Permission.Urls] })).not.toThrowError();
});
