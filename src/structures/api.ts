import { URLSearchParams } from 'node:url';
import { request } from 'undici';
import { type Category, Permission, API_BASE_URL } from '../constants.js';
import { ErrorsMessages } from '../errors.js';
import type {
	ApiStatusResponse,
	CreateDomainRequest,
	CreateURLRequest,
	RawDomainData,
	RawURLData,
	UpdateDomainRequest,
	UpdateURLRequest,
} from '../types.js';
import { assertString, transformData, validateResponse } from '../utils.js';
import { FishFishAuth } from './auth.js';

/**
 * The formatted data for a Domain sent by the API.
 */
export interface FishFishDomain extends Omit<RawDomainData, 'added' | 'checked'> {
	/**
	 * The date this domain was added to the API.
	 */
	added: Date;
	/**
	 * The date this domain was last checked.
	 */
	checked: Date;
}

/**
 * The formatted data for a URL sent by the API.
 */
export interface FishFishURL extends Omit<RawURLData, 'added' | 'checked'> {
	/**
	 * The date this URL was added to the API.
	 */
	added: Date;
	/**
	 * The date this URL was last checked.
	 */
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
	 * Enable debug mode.
	 */
	debug?: boolean;
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
	private readonly _cache: {
		domains: Map<string, FishFishDomain>;
		urls: Map<string, FishFishURL>;
	};

	/**
	 * The auth instance.
	 *
	 * @see FishFishAuth
	 */
	public readonly auth: FishFishAuth;

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

		await validateResponse(response);

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

		await validateResponse(response);

		return response.body.json();
	}

	/**
	 * Get a single domain from the database.
	 *
	 * @param domain - The domain to get the data from.
	 * @throws Error if the status code is not 200.
	 */
	public static async getDomain(domain: string): Promise<FishFishDomain> {
		assertString(domain);

		const response = await request(`${API_BASE_URL}/domains/${domain}`, {
			method: 'GET',
		});

		await validateResponse(response);

		return response.body.json() as Promise<FishFishDomain>;
	}

	/**
	 * Get a single URL from the database.
	 *
	 * @param url - The URL to get.
	 * @throws Error if the status code is not 200.
	 */
	public static async getUrl(url: string): Promise<FishFishURL> {
		assertString(url);

		const response = await request(`${API_BASE_URL}/urls/${url}`, {
			method: 'GET',
		});

		await validateResponse(response);

		return response.body.json() as Promise<FishFishURL>;
	}

	public constructor(apiKey: string, options: FishFishApiOptions) {
		assertString(apiKey);

		if (!Reflect.has(options ?? {}, 'defaultPermissions') || !options.defaultPermissions?.length) {
			throw new Error(ErrorsMessages.MISSING_DEFAULT_PERMISSIONS);
		}

		this.auth = new FishFishAuth(apiKey, options.defaultPermissions);

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
		return this.auth.hasSessionToken;
	}

	/**
	 * Returns the status and metrics of the API.
	 *
	 * @returns The status of the API.
	 * @throws Error if the status code is not 200.
	 */
	public async getApiStatus(): Promise<ApiStatusResponse> {
		const response = await request(`${API_BASE_URL}/status`);

		await validateResponse(response, this.hasSessionToken);

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
	public async insertDomain(domain: string, data: CreateDomainRequest): Promise<FishFishDomain> {
		await this._assertToken(Permission.Domains);
		assertString(domain);
		if (!Reflect.has(data ?? {}, 'category') || !Reflect.has(data ?? {}, 'description')) {
			throw new Error(ErrorsMessages.MISSING_FIELD_CREATE);
		}

		const response = await request(`${API_BASE_URL}/domains/${domain}`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: (await this.auth.getSessionToken()).token,
			},
			body: JSON.stringify(data),
		});

		await validateResponse(response, this.hasSessionToken);

		const insertedData = transformData<FishFishDomain>(await response.body.json());

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
	public async getDomain(domain: string, options?: GetOptions): Promise<FishFishDomain> {
		assertString(domain);
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
	public async patchDomain(domain: string, data: UpdateDomainRequest): Promise<FishFishDomain> {
		await this._assertToken(Permission.Domains);
		assertString(domain);
		if (Object.keys(data).length === 0) {
			throw new Error(ErrorsMessages.MISSING_FIELD_UPDATE);
		}

		const response = await request(`${API_BASE_URL}/domains/${domain}`, {
			method: 'PATCH',
			headers: {
				'Content-Type': 'application/json',
				Authorization: (await this.auth.getSessionToken()).token,
			},
			body: JSON.stringify(data),
		});

		await validateResponse(response, this.hasSessionToken);

		const patchedData = transformData<FishFishDomain>(await response.body.json());

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
		assertString(domain);
		const response = await request(`${API_BASE_URL}/domains/${domain}`, {
			method: 'DELETE',
			headers: {
				Authorization: (await this.auth.getSessionToken()).token,
			},
		});

		await validateResponse(response, this.hasSessionToken);

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
	public async getAllDomains(options: GetAllOptions & { full: true }): Promise<FishFishDomain[]>;
	public async getAllDomains(options: GetAllOptions & { full?: false }): Promise<string[]>;
	public async getAllDomains(options: GetAllOptions): Promise<FishFishDomain[] | string[]> {
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
				Authorization: (await this.auth.getSessionToken()).token,
			},
		});

		await validateResponse(response, this.hasSessionToken);

		const data = (await response.body.json()) as FishFishDomain[];

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
	public async insertURL(url: string, data: CreateURLRequest): Promise<FishFishURL> {
		await this._assertToken(Permission.Urls);
		assertString(url);
		if (!Reflect.has(data ?? {}, 'category') || !Reflect.has(data ?? {}, 'description')) {
			throw new Error(ErrorsMessages.MISSING_FIELD_CREATE);
		}

		const response = await request(`${API_BASE_URL}/urls/${encodeURI(url)}`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: (await this.auth.getSessionToken()).token,
			},
			body: JSON.stringify(data),
		});

		await validateResponse(response, this.hasSessionToken);

		const insertedData = transformData<FishFishURL>(await response.body.json());

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
	public async getURL(url: string, options?: GetOptions): Promise<FishFishURL> {
		assertString(url);
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
	public async patchURL(url: string, data: UpdateURLRequest): Promise<FishFishURL> {
		await this._assertToken(Permission.Urls);
		assertString(url);
		if (Object.keys(data).length === 0) {
			throw new Error(ErrorsMessages.MISSING_FIELD_UPDATE);
		}

		const response = await request(`${API_BASE_URL}/urls/${encodeURI(url)}`, {
			method: 'PATCH',
			headers: {
				'Content-Type': 'application/json',
				Authorization: (await this.auth.getSessionToken()).token,
			},
			body: JSON.stringify(data),
		});

		await validateResponse(response, this.hasSessionToken);

		const patchedData = transformData<FishFishURL>(await response.body.json());

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
	public async getAllUrls(_options: GetAllOptions & { full: true }): Promise<FishFishURL[]>;
	public async getAllUrls(_options: GetAllOptions & { full?: false }): Promise<string[]>;
	public async getAllUrls(_options: GetAllOptions): Promise<FishFishURL[] | string[]> {
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
				Authorization: (await this.auth.getSessionToken()).token,
			},
		});

		await validateResponse(response, this.hasSessionToken);

		const data = (await response.body.json()) as FishFishURL[];

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
		assertString(url);
		const response = await request(`${API_BASE_URL}/urls/${encodeURI(url)}`, {
			method: 'DELETE',
			headers: {
				Authorization: (await this.auth.getSessionToken()).token,
			},
		});

		await validateResponse(response, this.hasSessionToken);

		if (this._options.cache) {
			this._cache.urls.delete(url);
		}

		return true;
	}

	private async _assertToken(permission: Permission) {
		await this.auth.getSessionToken();

		if (!this.auth.checkTokenPermissions(permission)) {
			throw new Error(ErrorsMessages.SESSION_TOKEN_NO_PERMISSION);
		}
	}
}

export const getAllDomains = FishFishApi.getAllDomains;
export const getAllUrls = FishFishApi.getAllUrls;
