import process from 'node:process';
import { setTimeout, setInterval, clearInterval } from 'node:timers';
import { request } from 'undici';
import { API_BASE_URL } from '../constants.js';
import type { Permission } from '../enums.js';
import { ErrorsMessages } from '../errors.js';
import { assertString, validateResponse } from '../utils.js';

export interface CreateTokenResponseBody {
	/**
	 * The date this token expires.
	 */
	expires: number;
	/**
	 * The id of the main token.
	 */
	id: string;
	/**
	 * The session token.
	 */
	token: string;
}

export interface PartialMainToken {
	/**
	 * The id of the main token.
	 */
	id: string;
	/**
	 * The permissions of the main token.
	 */
	permissions: Permission[];
}

export interface FishFishSessionToken {
	/**
	 * The date this token expires.
	 */
	expires: Date;
	/**
	 * The permissions this token was instantiated with.
	 */
	permissions: Permission[];
	/**
	 * The session token.
	 */
	token: string;
}

export interface FishFishAuthOptions {
	/**
	 * The API key used to authenticate requests.
	 *
	 * @defaultValue process.env.FISHFISH_API_KEY
	 */
	apiKey?: string;
	/**
	 * Enables debug logging.
	 *
	 * @defaultValue false
	 */
	debug?: boolean;
	/**
	 * The permissions to use when creating a session token.
	 *
	 * @defaultValue `[]`
	 * @see https://api.fishfish.gg/v1/docs#enum-permission
	 */
	permissions?: Permission[];
}

export class FishFishAuth {
	/**
	 * The API key used to authenticate requests.
	 */
	private readonly apiKey: string;

	private readonly _permissions: Permission[];

	private readonly debug: boolean;

	private _processing: boolean = false;

	private _sessionToken: (Omit<FishFishSessionToken, 'expires'> & { expires: number }) | null;

	public constructor({ apiKey, debug = false, permissions }: FishFishAuthOptions = {}) {
		assertString(apiKey ?? process.env.FISHFISH_API_KEY, ErrorsMessages.MISSING_API_KEY);

		this.apiKey = apiKey ?? process.env.FISHFISH_API_KEY!;
		this.debug = debug;
		this._sessionToken = null;
		this._permissions = permissions ?? [];
	}

	/**
	 * Return the session token object or null if non existent.
	 */
	public get sessionToken() {
		return this._sessionToken ? this._transformSessionToken(this._sessionToken) : null;
	}

	/**
	 * Returns true if a session token exist.
	 */
	public get hasSessionToken() {
		return Boolean(this._sessionToken);
	}

	/**
	 * Check if a session token has the required permission.
	 *
	 * @param permission - The permission to check.
	 * @returns True if the session token has the permission or false if not or if no session token exist.
	 */
	public checkTokenPermissions(permission: Permission) {
		return Boolean(this._sessionToken?.permissions.includes(permission));
	}

	/**
	 * Converts your API key into a session token and store it for later use.
	 *
	 * @param permissions - The permissions to request for the token.
	 * @returns The session token.
	 * @throws Error if the status code is not 200.
	 */
	public async createSessionToken(permissions: Permission[] = this._permissions): Promise<FishFishSessionToken> {
		if (this._sessionToken) {
			this.debugLogger('Session token already exist, returning it.');
			return this._transformSessionToken(this._sessionToken);
		}

		if (this._processing) {
			return new Promise((resolve) => {
				const interval = setInterval(() => {
					if (this._sessionToken) {
						clearInterval(interval);
						resolve(this._transformSessionToken(this._sessionToken));
					}
				}, 10);
			});
		}

		this._processing = true;
		try {
			const response = await request(`${API_BASE_URL}/users/@me/tokens`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: this.apiKey,
				},
				body: JSON.stringify({
					permissions,
				}),
			});

			await validateResponse(response, this.hasSessionToken);

			const token = (await response.body.json()) as CreateTokenResponseBody;

			this._sessionToken = {
				...token,
				permissions,
			};

			this._createExpireTimeout();

			this.debugLogger('Created session token.', { expire: this._sessionToken.expires * 1_000 });

			return this._transformSessionToken(this._sessionToken);
		} finally {
			this._processing = false;
		}
	}

	private _createExpireTimeout() {
		setTimeout(() => {
			this._sessionToken = null;
		}, (this._sessionToken?.expires ?? 0) * 1_000 - Date.now());
	}

	private _transformSessionToken(token: typeof this._sessionToken): FishFishSessionToken {
		if (!token) {
			throw new Error(ErrorsMessages.NO_SESSION_TOKEN);
		}

		return {
			token: token.token,
			expires: new Date(token.expires * 1_000),
			permissions: token.permissions,
		};
	}

	private debugLogger(message: string, ...args: unknown[]) {
		if (this.debug) {
			console.log(`[Auth: debug]: ${message}`, ...args);
		}
	}
}
