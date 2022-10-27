import { setTimeout } from 'node:timers';
import { URLSearchParams } from 'node:url';
import { type Dispatcher, request } from 'undici';
import { type Category, Permission, API_BASE_URL } from './constants.js';
import { ErrorsMessages } from './errors.js';
import type {
	ApiStatusResponse,
	CreateRequest,
	RawCreateTokenResponseBody,
	RawDomainData,
	RawUrlData,
	UpdateRequest,
} from './types.js';

interface CreateTokenResponseBody {
	/**
	 * The date this token expires.
	 *
	 * @throws Error if the status code is not 200.
	 */
	expires: Date;
	/**
	 * The session token.
	 *
	 * @throws Error if the status code is not 200.
	 */
	token: string;
}

interface Domain extends Omit<RawDomainData, 'added' | 'checked'> {
	added: Date;
	checked: Date;
}

interface URL extends Omit<RawUrlData, 'added' | 'checked'> {
	added: Date;
	checked: Date;
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
	/**
	 * Enables the webSocket connection.
	 *
	 * **Default:** `true`
	 */
	webSocket?: boolean;
}

export class FishFishApi {
	private readonly apiKey: string;

	private sessionToken: {
		instantiatedPermissions: Permission[];
		token: string;
	} | null;

	private sessionTokenExpireTimestamp: number | null;

	private readonly _cache: {
		domains: Map<string, Domain>;
		urls: Map<string, URL>;
	};

	private readonly _options: FishFishApiOptions;

	/**
	 * Get a list of all domains in the database.
	 *
	 * @param category - category The category to filter by.
	 * @throws Error if the status code is not 200.
	 */
	public static async getAllDomains(category: Category): Promise<string[]> {
		const params = new URLSearchParams();
		params.append('category', category);
		params.append('full', String(false));
		const response = await request(`${API_BASE_URL}/domains?${params.toString()}`);

		await FishFishApi._validateResponse(response);

		return response.body.json();
	}

	/**
	 * Get a list of all URLs in the database.
	 *
	 * @param category - category The category to filter by.
	 * @throws Error if the status code is not 200.
	 */
	public static async getAllUrls(category: Category): Promise<string[]> {
		const params = new URLSearchParams();
		params.append('category', category);
		params.append('full', String(false));
		const response = await request(`${API_BASE_URL}/urls?${params.toString()}`);

		await FishFishApi._validateResponse(response);

		return response.body.json();
	}

	/**
	 * Get a single domain from the database.
	 *
	 * @param domain - The domain to get the data from.
	 * @throws Error if the status code is not 200.
	 */
	public static async getDomain(domain: string): Promise<Domain> {
		FishFishApi._assertString(domain);

		const response = await request(`${API_BASE_URL}/domains/${domain}`, {
			method: 'GET',
		});

		await FishFishApi._validateResponse(response);

		return response.body.json() as Promise<Domain>;
	}

	/**
	 * Get a single URL from the database.
	 *
	 * @param url - The URL to get.
	 * @throws Error if the status code is not 200.
	 */
	public static async getUrl(url: string): Promise<URL> {
		FishFishApi._assertString(url);

		const response = await request(`${API_BASE_URL}/urls/${url}`, {
			method: 'GET',
		});

		await FishFishApi._validateResponse(response);

		return response.body.json() as Promise<URL>;
	}

	public constructor(apiKey: string, options: FishFishApiOptions) {
		FishFishApi._assertString(apiKey);

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
	 *
	 * @throws Error if the cache is disabled.
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
	 * @throws Error if the status code is not 200.
	 */
	public async getSessionToken(
		permissions: Permission[] = this._options.defaultPermissions,
	): Promise<CreateTokenResponseBody> {
		if (this.sessionToken) {
			return {
				expires: new Date(this.sessionTokenExpireTimestamp!),
				token: this.sessionToken.token,
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

		await FishFishApi._validateResponse(response, this.hasSessionToken);

		const { token, expires } = (await response.body.json()) as RawCreateTokenResponseBody;

		this.sessionTokenExpireTimestamp = expires * 1_000;

		this.sessionToken = {
			instantiatedPermissions: permissions,
			token,
		};
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
	 * @throws Error if the status code is not 200.
	 */
	public async getApiStatus(): Promise<ApiStatusResponse> {
		const response = await request(`${API_BASE_URL}/status`);

		await FishFishApi._validateResponse(response, this.hasSessionToken);

		return response.body.json();
	}

	/**
	 * Insert a new domain into the database.
	 *
	 * @param domain - The domain to insert.
	 * @param data - The data to send.
	 * @returns The domain that was inserted.
	 * @throws Error if the status code is not 200.
	 */
	public async insertDomain(domain: string, data: CreateRequest): Promise<Domain> {
		await this._assertToken(Permission.Domains);
		FishFishApi._assertString(domain);
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

		await FishFishApi._validateResponse(response, this.hasSessionToken);

		const insertedData = this._transformData<Domain>(await response.body.json());

		if (this._options.cache) {
			this._cache.domains.set(domain, insertedData);
		}

		return insertedData;
	}

	/**
	 * Get a single domain from the database.
	 *
	 * Different from the static method, this method will cache the domain.
	 *
	 * @param domain - The domain to get.
	 * @param options - The options to use.
	 * @returns The full domain information.
	 * @throws Error if the status code is not 200.
	 */
	public async getDomain(domain: string, options?: GetOptions): Promise<Domain> {
		FishFishApi._assertString(domain);
		const cached = this.cache.domains.get(domain);

		const _options = {
			cache: options?.cache ?? true,
			force: options?.force ?? true,
		};

		if (cached && !_options.force) {
			return cached;
		}

		const data = await FishFishApi.getDomain(domain);

		if (this._options.cache && _options.cache) {
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
	 * @throws Error if the status code is not 200.
	 */
	public async patchDomain(domain: string, data: UpdateRequest): Promise<Domain> {
		await this._assertToken(Permission.Domains);
		FishFishApi._assertString(domain);
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

		await FishFishApi._validateResponse(response, this.hasSessionToken);

		const patchedData = this._transformData<Domain>(await response.body.json());

		if (this._options.cache) {
			this._cache.domains.set(domain, patchedData);
		}

		return patchedData;
	}

	/**
	 * Delete a domain from the database.
	 *
	 * @param domain - The domain to delete.
	 * @returns `true` on success.
	 * @throws Error if the status code is not 200.
	 */
	public async deleteDomain(domain: string) {
		await this._assertToken(Permission.Domains);
		FishFishApi._assertString(domain);
		const response = await request(`${API_BASE_URL}/domains/${domain}`, {
			method: 'DELETE',
			headers: {
				Authorization: (await this.getSessionToken()).token,
			},
		});

		await FishFishApi._validateResponse(response, this.hasSessionToken);

		if (this._options.cache) {
			this._cache.domains.delete(domain);
		}

		return true;
	}

	/**
	 * Get all domains from the database.
	 *
	 * @param options - The options to use.
	 * @throws Error if the status code is not 200.
	 */
	public async getAllDomains(options: GetAllOptions & { full: true }): Promise<Domain[]>;
	public async getAllDomains(options: GetAllOptions & { full?: false }): Promise<string[]>;
	public async getAllDomains(options: GetAllOptions): Promise<Domain[] | string[]> {
		if (!options || !options.category) {
			throw new Error(ErrorsMessages.MISSING_CATEGORY);
		}

		const _options = {
			cache: true,
			full: false,
			...options,
		} as GetAllOptions;

		if (options.full) {
			await this._assertToken(Permission.Domains);
		}

		const params = new URLSearchParams();
		params.append('category', _options.category);
		params.append('full', _options.full!.toString());

		const response = await request(`${API_BASE_URL}/domains?${params.toString()}`, {
			method: 'GET',
			headers: {
				Authorization: (await this.getSessionToken()).token,
			},
		});

		await FishFishApi._validateResponse(response, this.hasSessionToken);

		const data = (await response.body.json()) as Domain[];

		if (this._options.cache && _options.cache && (_options.full || !this._options.doNotCachePartial)) {
			for (const domain of data) {
				this.cache.domains.set(domain.domain, domain);
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
	 * @throws Error if the status code is not 200.
	 */
	public async insertURL(url: string, data: CreateRequest): Promise<URL> {
		await this._assertToken(Permission.Urls);
		FishFishApi._assertString(url);
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

		await FishFishApi._validateResponse(response, this.hasSessionToken);

		const insertedData = this._transformData<URL>(await response.body.json());

		if (this._options.cache) {
			this._cache.urls.set(url, insertedData);
		}

		return insertedData;
	}

	/**
	 * Get a single URL from the database.
	 *
	 * Different from the static method, this method will cache the URL.
	 *
	 * @param url - The URL to get.
	 * @param options - The options to use.
	 * @returns The full URL information.
	 * @throws Error if the status code is not 200.
	 */
	public async getURL(url: string, options?: GetOptions): Promise<URL> {
		FishFishApi._assertString(url);
		const cached = this.cache.urls.get(url);

		const _options = {
			cache: options?.cache ?? true,
			force: options?.force ?? true,
		};

		if (cached && !_options.force) {
			return cached;
		}

		const data = await FishFishApi.getUrl(url);

		if (this._options.cache && _options.cache) {
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
	 * @throws Error if the status code is not 200.
	 */
	public async patchURL(url: string, data: UpdateRequest): Promise<URL> {
		await this._assertToken(Permission.Urls);
		FishFishApi._assertString(url);
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

		await FishFishApi._validateResponse(response, this.hasSessionToken);

		const patchedData = this._transformData<URL>(await response.body.json());

		if (this._options.cache) {
			this._cache.urls.set(url, patchedData);
		}

		return patchedData;
	}

	/**
	 * Get all URLs from the database.
	 *
	 * @param options - The options to use.
	 * @throws Error if the status code is not 200.
	 */
	public async getAllUrls(_options: GetAllOptions & { full: true }): Promise<URL[]>;
	public async getAllUrls(_options: GetAllOptions & { full?: false }): Promise<string[]>;
	public async getAllUrls(_options: GetAllOptions): Promise<string[] | URL[]> {
		if (!_options || !_options.category) {
			throw new Error(ErrorsMessages.MISSING_CATEGORY);
		}

		const options = {
			cache: true,
			full: false,
			..._options,
		} as GetAllOptions;

		if (options.full) {
			await this._assertToken(Permission.Urls);
		}

		const params = new URLSearchParams();
		params.append('category', options.category);
		params.append('full', options.full!.toString());

		const response = await request(`${API_BASE_URL}/urls?${params.toString()}`, {
			method: 'GET',
			headers: {
				Authorization: (await this.getSessionToken()).token,
			},
		});

		await FishFishApi._validateResponse(response, this.hasSessionToken);

		const data = (await response.body.json()) as URL[];

		if (this._options.cache && options.cache && (options.full || !this._options.doNotCachePartial)) {
			for (const url of data) {
				this.cache.urls.set(url.url, url);
			}
		}

		return data;
	}

	/**
	 * Delete a URL from the database.
	 *
	 * @param url - The URL to delete.
	 * @returns `true` on success.
	 * @throws Error if the status code is not 200.
	 */
	public async deleteURL(url: string) {
		await this._assertToken(Permission.Urls);
		FishFishApi._assertString(url);
		const response = await request(`${API_BASE_URL}/urls/${encodeURI(url)}`, {
			method: 'DELETE',
			headers: {
				Authorization: (await this.getSessionToken()).token,
			},
		});

		await FishFishApi._validateResponse(response, this.hasSessionToken);

		if (this._options.cache) {
			this._cache.urls.delete(url);
		}

		return true;
	}

	private async _assertToken(permission: Permission) {
		await this.getSessionToken();

		if (!this.sessionToken!.instantiatedPermissions.includes(permission)) {
			throw new Error(ErrorsMessages.SESSION_TOKEN_NO_PERMISSION);
		}
	}

	private static _assertString(value: string) {
		if (typeof value !== 'string') {
			throw new TypeError(ErrorsMessages.INVALID_TYPE + typeof value);
		}
	}

	private _transformData<T = Domain | URL>(data: RawDomainData | RawUrlData): T {
		return {
			...data,
			added: new Date(data.added * 1_000),
			checked: new Date(data.checked * 1_000),
		} as unknown as T;
	}

	private static async _validateResponse(response: Dispatcher.ResponseData, hasSessionToken = false) {
		if (response.statusCode === 401) {
			throw new Error(
				hasSessionToken ? ErrorsMessages.SESSION_TOKEN_UNAUTHORIZED : ErrorsMessages.API_KEY_UNAUTHORIZED,
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

export const getAllDomains = FishFishApi.getAllDomains;
export const getAllUrls = FishFishApi.getAllUrls;
