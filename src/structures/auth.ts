import { setTimeout } from 'node:timers';
import { request } from 'undici';
import type { Permission } from '../constants.js';
import { API_BASE_URL } from '../constants.js';
import { ErrorsMessages } from '../errors.js';
import { assertString, validateResponse } from '../utils.js';

export interface CreateTokenResponseBody {
	/**
	 * The date this token expires.
	 */
	expires: number;
	/**
	 * The session token.
	 */
	token: string;
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

export class FishFishAuth {
	/**
	 * The API key used to authenticate requests.
	 */
	private readonly apiKey: string;

	private readonly _permissions: Permission[];

	private _sessionToken: (Omit<FishFishSessionToken, 'expires'> & { expires: number }) | null;

	public constructor(apiKey: string, permissions: Permission[]) {
		assertString(apiKey);

		if (!permissions?.length) {
			throw new Error(ErrorsMessages.MISSING_DEFAULT_PERMISSIONS);
		}

		this.apiKey = apiKey;
		this._sessionToken = null;
		this._permissions = permissions;
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
	public async getSessionToken(permissions: Permission[] = this._permissions): Promise<FishFishSessionToken> {
		if (this._sessionToken) {
			return this._transformSessionToken(this._sessionToken);
		}

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

		return this._transformSessionToken(this._sessionToken);
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
}
