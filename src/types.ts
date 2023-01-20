import type { Category, Permission, WebSocketDataTypes } from './enums.js';

export type If<Generic, Condition, Then, Else = null> = Generic extends Condition ? Then : Else;

/**
 * The response body for the `GET /status` endpoint.
 */
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
	 * The target of the domain/url.
	 */
	target?: string;
}

/**
 * The request body for the `POST` endpoints.
 *
 * - `POST /domains/:domain`
 * - `POST /urls/:url`
 *
 * @see https://api.fishfish.gg/v1/docs#type-create_domain_request
 * @see https://api.fishfish.gg/v1/docs#type-create_url_request
 */
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

/**
 * The request body for the `POST /domains/:domain` endpoints.
 *
 * - `POST /domains/:domain`
 *
 * @see https://api.fishfish.gg/v1/docs#type-create_domain_request
 */
export type CreateDomainRequest = CreateRequest;
/**
 * The request body for the `POST /urls/:url` endpoints.
 *
 * - `POST /urls/:url`
 *
 * @see https://api.fishfish.gg/v1/docs#type-create_url_request
 */
export type CreateURLRequest = CreateRequest;

/**
 * The request body for the `PATCH` endpoints.
 *
 * - `PATCH /domains/:domain`
 * - `PATCH /urls/:url`
 *
 * @see https://api.fishfish.gg/v1/docs#type-create_domain_request
 * @see https://api.fishfish.gg/v1/docs#type-create_url_request
 */
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

/**
 * The request body for the `PATCH /domains/:domain` endpoint.
 *
 * - `PATCH /domains/:domain`
 *
 * @see https://api.fishfish.gg/v1/docs#type-create_domain_request
 */
export type UpdateDomainRequest = UpdateRequest;
/**
 * The request body for the `PATCH /urls/:url` endpoint.
 *
 * - `PATCH /urls/:url`
 *
 * @see https://api.fishfish.gg/v1/docs#type-create_url_request
 */
export type UpdateURLRequest = UpdateRequest;

/**
 * The raw domain data returned from the API.
 *
 * @see https://api.fishfish.gg/v1/docs#type-domain
 */
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

/**
 * The raw URL data returned from the API.
 *
 * @see https://api.fishfish.gg/v1/docs#type-url
 */
export interface RawURLData {
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

/**
 * FishFish user information
 */
export interface FishFishUser {
	/**
	 * External service connection information
	 */
	external_service_id?: string;

	/**
	 * FishFish user ID
	 */
	id: number;

	/**
	 * User's permissions
	 */
	permissions: Permission[];

	/**
	 * User's username
	 */
	username: string;
}

/**
 * The raw data of a WebSocket event.
 */
export interface RawWebSocketData<T extends WebSocketDataTypes> {
	/**
	 * The data of the event.
	 *
	 * If the event is related to a domain, the `domain` property will be set.
	 * If the event is related to a URL, the `url` property will be set.
	 */
	data: If<
		T,
		WebSocketDataTypes.DomainCreate | WebSocketDataTypes.DomainDelete | WebSocketDataTypes.DomainUpdate,
		{
			/**
			 * The domain.
			 *
			 * **Note:** This property is only set if the event is related to a domain.
			 */
			domain: string;
		},
		{
			/**
			 * The url.
			 *
			 * **Note:** This property is only set if the event is related to a URL.
			 */
			url: string;
		}
	> & {
		/**
		 * When this domain/Url was added.
		 */
		added: number;
		/**
		 * The category of the domain.
		 */
		category: Category;
		/**
		 * When the domain/Url was last checked.
		 */
		checked: number;
		/**
		 * The description of the domain.
		 */
		description: string;
	};
	/**
	 * The type of the event.
	 *
	 * @see WebSocketDataTypes
	 */
	type: T;
}
