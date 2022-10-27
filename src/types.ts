import type { Category } from './constants.js';

export interface RawCreateTokenResponseBody {
	expires: number;
	token: string;
}

export interface ApiStatusResponse {
	/**
	 * The number of domains in the database.
	 */
	domains: number;
	/**
	 * The number of requests made to the API.
	 */
	requests: number;
	/**
	 * The uptime of the API.
	 */
	uptime: number;
	/**
	 * The number of URLs in the database.
	 */
	urls: number;
	/**
	 * The id of the worker.
	 */
	worker: number;
}

interface BaseRequest {
	/**
	 * The target of the domain.
	 */
	target?: string;
}

export interface CreateRequest extends BaseRequest {
	/**
	 * The category of the domain.
	 */
	category: Category;
	/**
	 * The category of the domain.
	 */
	description: string;
}

export interface UpdateRequest extends BaseRequest {
	/**
	 * The category of the domain.
	 */
	category?: Category;
	/**
	 * The category of the domain.
	 */
	description?: string;
}

export interface RawDomainData {
	/**
	 * The time the domain was added.
	 */
	added: number;
	/**
	 * The category of the domain.
	 */
	category: Category;
	/**
	 * The time the domain was last checked.
	 */
	checked: number;
	/**
	 * The description of the domain.
	 */
	description: string;
	/**
	 * The domain.
	 */
	domain: string;
	/**
	 * The target of the domain.
	 */
	target?: string;
}

export interface RawUrlData {
	/**
	 * The time the URL was added.
	 */
	added: number;
	/**
	 * The category of the URL.
	 */
	category: Category;
	/**
	 * The time the URL was last checked.
	 */
	checked: number;
	/**
	 * The description of the URL.
	 */
	description: string;
	/**
	 * The target of the URL.
	 */
	target?: string;
	/**
	 * The URL.
	 */
	url: string;
}
