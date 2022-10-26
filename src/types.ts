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

export enum BaseMethod {
	Create,
	Update,
}

export interface BaseRequest<T extends BaseMethod> {
	category: T extends BaseMethod.Create ? Category : Category | undefined;
	description: T extends BaseMethod.Create ? Category : Category | undefined;
	target?: string;
}

export interface RawData {
	added: number;
	category: Category;
	checked: number;
	description: string;
	name: string;
	target: string;
}

export interface RawURL {
	added: number;
	category: Category;
	checked: number;
	description: string;
	name: string;
	target: string;
}
