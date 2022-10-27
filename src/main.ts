import { setTimeout } from 'node:timers';
import { URLSearchParams } from 'node:url';
import { type Dispatcher, request } from 'undici';
import type { Category, Permission } from './constants.js';
import { API_BASE_URL } from './constants.js';
import { ErrorsMessages } from './errors.js';
import type { ApiStatusResponse, BaseMethod, BaseRequest, RawCreateTokenResponseBody, RawData } from './types.js';

interface CreateTokenResponseBody {
	/**
	 * The date this token expires.
	 */
	expires: Date;
	/**
	 * The session token.
	 */
	token: string;
}

interface Domain extends Partial<Omit<RawData, 'added'>> {
	added?: Date;
	name: string;
}

interface URL extends Partial<Omit<RawData, 'added'>> {
	added?: Date;
	name: string;
}

interface GetOptions {
	/**
	 * Whether to to cache the response.
	 *
	 * **Default:** `true`
	 */
	cache?: boolean;
	/**
	 * Whether to return skip the cache.
	 *
	 * **Default:** `false`
	 */
	force?: boolean;
}

interface GetAllOptions {
	/**
	 * Whether to to cache the responses.
	 *
	 * **Default:** `true`
	 */
	cache?: boolean;
	/**
	 * The category to filter by.
	 */
	category: Category;
	/**
	 * Whether to return the full information or only the domain name.
	 *
	 * **Default:** `false`
	 */
	full?: boolean;
}

interface FishFishApiOptions {
	/**
	 * Enable the cache.
	 *
	 * **Default:** `true`
	 */
	cache?: boolean;
	/**
	 * Default permissions for the session token.
	 */
	defaultPermissions: Permission[];
	/**
	 * Only caches full responses.
	 *
	 * **Default:** `false`
	 */
	doNotCachePartial?: boolean;
}

export class FishFishApi {
	private readonly apiKey: string;

	private sessionToken: string | null;

	private sessionTokenExpireTimestamp: number | null;

	private readonly _cache: {
		domains: Map<string, Domain>;
		urls: Map<string, URL>;
	};

	private readonly _options: FishFishApiOptions;

	public constructor(apiKey: string, options: FishFishApiOptions) {
		this._assertString(apiKey);

		if (!Reflect.has(options ?? {}, 'defaultPermissions') || !options.defaultPermissions?.length) {
			throw new Error(ErrorsMessages.MISSING_DEFAULT_PERMISSIONS);
		}

		this.apiKey = apiKey;
		this.sessionToken = null;

		this.sessionTokenExpireTimestamp = null;

		this._options = {
			cache: options.cache ?? true,
			doNotCachePartial: options.doNotCachePartial ?? false,
			defaultPermissions: options.defaultPermissions,
		};

		this._cache = {
			domains: new Map(),
			urls: new Map(),
		};
	}

	/**
	 * Returns the cache.
	 */
	public get cache() {
		if (!this._options.cache) {
			throw new Error(ErrorsMessages.CACHE_DISABLED);
		}

		return this._cache;
	}

	/**
	 * Returns the initial options.
	 */
	public get options() {
		return this._options;
	}

	/**
	 * Returns true if the session token is valid.
	 */
	public get hasSessionToken(): boolean {
		return Boolean(this.sessionToken);
	}

	/**
	 * Converts your API key into a session token and store it for later use.
	 *
	 * @param permissions - The permissions to request for the token.
	 * @returns The session token.
	 */
	public async getSessionToken(
		permissions: Permission[] = this._options.defaultPermissions,
	): Promise<CreateTokenResponseBody> {
		if (this.sessionToken) {
			return {
				expires: new Date(this.sessionTokenExpireTimestamp!),
				token: this.sessionToken,
			};
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

		await this._validateResponse(response);

		const { token, expires } = (await response.body.json()) as RawCreateTokenResponseBody;

		this.sessionTokenExpireTimestamp = expires * 1_000;

		this.sessionToken = token;
		this._createExpireTimeout();

		return {
			token,
			expires: new Date(this.sessionTokenExpireTimestamp),
		};
	}

	/**
	 * Returns the status and metrics of the API.
	 *
	 * @returns The status of the API.
	 */
	public async getApiStatus(): Promise<ApiStatusResponse> {
		const response = await request(`${API_BASE_URL}/status`);

		await this._validateResponse(response);

		return response.body.json();
	}

	/**
	 * Insert a new domain into the database.
	 *
	 * @param domain - The domain to insert.
	 * @param data - The data to send.
	 * @returns The domain that was inserted.
	 */
	public async insertDomain(domain: string, data: BaseRequest<BaseMethod.Create>): Promise<Domain> {
		this._assertString(domain);
		if (!Reflect.has(data ?? {}, 'category') || !Reflect.has(data ?? {}, 'description')) {
			throw new Error(ErrorsMessages.MISSING_FIELD_CREATE);
		}

		const response = await request(`${API_BASE_URL}/domains/${domain}`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: (await this.getSessionToken()).token,
			},
			body: JSON.stringify(data),
		});

		await this._validateResponse(response);

		const insertedData = this._transformData<Domain>(await response.body.json());

		if (this._options.cache) {
			this._cache.domains.set(domain, insertedData);
		}

		return insertedData;
	}

	/**
	 * Get a single domain from the database.
	 *
	 * @param domain - The domain to get.
	 * @param options - The options to use.
	 * @returns The full domain information.
	 */
	public async getDomain(domain: string, options: GetOptions): Promise<Domain> {
		this._assertString(domain);
		const cached = this.cache.domains.get(domain);

		if (cached && !options.force) {
			return cached;
		}

		const response = await request(`${API_BASE_URL}/domains/${domain}`, {
			method: 'GET',
			headers: {
				Authorization: (await this.getSessionToken()).token,
			},
		});

		await this._validateResponse(response);

		const data = this._transformData<Domain>(await response.body.json());

		if (this._options.cache && options.cache) {
			this.cache.domains.set(domain, data);
		}

		return data;
	}

	/**
	 * Update a domain in the database.
	 *
	 * @param domain - The domain to patch.
	 * @param data - The data to patch.
	 * @returns The patched domain.
	 */
	public async patchDomain(domain: string, data: BaseRequest<BaseMethod.Update>): Promise<Domain> {
		this._assertString(domain);
		if (Object.keys(data).length === 0) {
			throw new Error(ErrorsMessages.MISSING_FIELD_UPDATE);
		}

		const response = await request(`${API_BASE_URL}/domains/${domain}`, {
			method: 'PATCH',
			headers: {
				'Content-Type': 'application/json',
				Authorization: (await this.getSessionToken()).token,
			},
			body: JSON.stringify(data),
		});

		await this._validateResponse(response);

		return this._transformData<Domain>(await response.body.json());
	}

	/**
	 * Delete a domain from the database.
	 *
	 * @param domain - The domain to delete.
	 * @returns `true` on success.
	 */
	public async deleteDomain(domain: string) {
		this._assertString(domain);
		const response = await request(`${API_BASE_URL}/domains/${domain}`, {
			method: 'DELETE',
			headers: {
				Authorization: (await this.getSessionToken()).token,
			},
		});

		await this._validateResponse(response);

		return true;
	}

	/**
	 * Get all domains from the database.
	 *
	 * @param _options - The options to use.
	 */
	public async getAllDomains(_options: GetAllOptions & { full: true }): Promise<Domain[]>;
	public async getAllDomains(_options: GetAllOptions & { full?: false }): Promise<string[]>;
	public async getAllDomains(_options: GetAllOptions): Promise<Domain[] | string[]> {
		if (!_options || !_options.category) {
			throw new Error(ErrorsMessages.MISSING_CATEGORY);
		}

		const options = {
			cache: true,
			full: false,
			..._options,
		} as GetAllOptions;

		const params = new URLSearchParams();
		params.append('category', options.category);
		params.append('full', options.full!.toString());

		const response = await request(`${API_BASE_URL}/domains?${params.toString()}`, {
			method: 'GET',
			headers: {
				Authorization: (await this.getSessionToken()).token,
			},
		});

		await this._validateResponse(response);

		const data = (await response.body.json()) as Domain[];

		if (this._options.cache && options.cache && (options.full || !this._options.doNotCachePartial)) {
			for (const domain of data) {
				this.cache.domains.set(domain.name, domain);
			}
		}

		return data;
	}

	/**
	 * Create a new URL in the database.
	 *
	 * @param url - The URL to insert.
	 * @param data - The data to insert.
	 * @returns
	 */
	public async insertURL(url: string, data: BaseRequest<BaseMethod.Create>): Promise<URL> {
		this._assertString(url);
		if (!Reflect.has(data ?? {}, 'category') || !Reflect.has(data ?? {}, 'description')) {
			throw new Error(ErrorsMessages.MISSING_FIELD_CREATE);
		}

		const response = await request(`${API_BASE_URL}/urls/${encodeURI(url)}`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: (await this.getSessionToken()).token,
			},
			body: JSON.stringify(data),
		});

		await this._validateResponse(response);

		return this._transformData<URL>(await response.body.json());
	}

	/**
	 * Get a single URL from the database.
	 *
	 * @param url - The URL to get.
	 * @param options - The options to use.
	 * @returns The full URL information.
	 */
	public async getURL(url: string, options: GetOptions): Promise<URL> {
		this._assertString(url);
		const cached = this.cache.urls.get(url);

		if (cached && !options.force) {
			return cached;
		}

		const response = await request(`${API_BASE_URL}/urls/${encodeURI(url)}`, {
			method: 'GET',
			headers: {
				Authorization: (await this.getSessionToken()).token,
			},
		});

		await this._validateResponse(response);

		const data = this._transformData<URL>(await response.body.json());

		if (options.cache) {
			this.cache.urls.set(url, data);
		}

		return data;
	}

	/**
	 * Update a URL in the database.
	 *
	 * @param url - The URL to patch.
	 * @param data - The data to patch.
	 * @returns The patched URL.
	 */
	public async patchURL(url: string, data: BaseRequest<BaseMethod.Update>): Promise<URL> {
		this._assertString(url);
		if (Object.keys(data).length === 0) {
			throw new Error(ErrorsMessages.MISSING_FIELD_UPDATE);
		}

		const response = await request(`${API_BASE_URL}/urls/${encodeURI(url)}`, {
			method: 'PATCH',
			headers: {
				'Content-Type': 'application/json',
				Authorization: (await this.getSessionToken()).token,
			},
			body: JSON.stringify(data),
		});

		await this._validateResponse(response);

		return this._transformData<URL>(await response.body.json());
	}

	/**
	 * Get all URLs from the database.
	 *
	 * @param _options - The options to use.
	 */
	public async getAllUrls(_options: GetAllOptions & { full: true }): Promise<Domain[]>;
	public async getAllUrls(_options: GetAllOptions & { full?: false }): Promise<string[]>;
	public async getAllUrls(_options: GetAllOptions): Promise<Domain[] | string[]> {
		if (!_options || !_options.category) {
			throw new Error(ErrorsMessages.MISSING_CATEGORY);
		}

		const options = {
			cache: true,
			full: false,
			..._options,
		} as GetAllOptions;

		const params = new URLSearchParams();
		params.append('category', options.category);
		params.append('full', options.full!.toString());

		const response = await request(`${API_BASE_URL}/urls?${params.toString()}`, {
			method: 'GET',
			headers: {
				Authorization: (await this.getSessionToken()).token,
			},
		});

		await this._validateResponse(response);

		const data = (await response.body.json()) as Domain[];

		if (this._options.cache && options.cache && (options.full || !this._options.doNotCachePartial)) {
			for (const domain of data) {
				this.cache.urls.set(domain.name, domain);
			}
		}

		return data;
	}

	/**
	 * Delete a URL from the database.
	 *
	 * @param url - The URL to delete.
	 * @returns `true` on success.
	 */
	public async deleteURL(url: string) {
		this._assertString(url);
		const response = await request(`${API_BASE_URL}/urls/${encodeURI(url)}`, {
			method: 'DELETE',
			headers: {
				Authorization: (await this.getSessionToken()).token,
			},
		});

		await this._validateResponse(response);

		return true;
	}

	private _assertString(value: string) {
		if (typeof value !== 'string') {
			throw new TypeError(ErrorsMessages.INVALID_TYPE + typeof value);
		}
	}

	private _transformData<T = Domain | URL>(data: RawData): T {
		return {
			...data,
			added: new Date(data.added * 1_000),
		} as unknown as T;
	}

	private async _validateResponse(response: Dispatcher.ResponseData) {
		if (response.statusCode === 401) {
			throw new Error(
				this.sessionToken ? ErrorsMessages.SESSION_TOKEN_UNAUTHORIZED : ErrorsMessages.API_KEY_UNAUTHORIZED,
			);
		}

		if (response.statusCode === 429) {
			throw new Error(ErrorsMessages.RATE_LIMITED);
		}

		if (response.statusCode < 200 || response.statusCode > 299) {
			throw new Error(`Unexpected status code ${response.statusCode}: ${await response.body.text()}`);
		}
	}

	private _createExpireTimeout() {
		setTimeout(() => {
			this.sessionToken = null;
			this.sessionTokenExpireTimestamp = null;
		}, this.sessionTokenExpireTimestamp! - Date.now());
	}
}
