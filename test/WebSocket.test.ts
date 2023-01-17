import { expect, test } from 'vitest';
import { ErrorsMessages, FishFishWebSocket, Permission } from '../dist/index.js';

test('Test: Constructor validation', async () => {
	expect(
		() =>
			new FishFishWebSocket({
				auth: {
					apiKey: 'super-valid-api-key',
				},
			}),
	).not.toThrowError();

	expect(() => new FishFishWebSocket()).toThrowError(ErrorsMessages.MISSING_API_KEY);

	// @ts-expect-error: Invalid options test (callback)
	expect(() => new FishFishWebSocket({ callback: 'not-a-function' })).toThrowError(
		(ErrorsMessages.INVALID_CALLBACK as string) + 'string',
	);

	expect(
		() =>
			new FishFishWebSocket({
				// @ts-expect-error: Invalid options test (manager)
				manager: 'totally-valid-manager',
			}),
	).toThrowError(ErrorsMessages.INVALID_MANAGER);
});
