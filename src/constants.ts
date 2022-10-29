export const API_BASE_URL = 'https://api.fishfish.gg/v1';
export const WEBSOCKET_BASE_URL = 'wss://api.fishfish.gg/v1';

/**
 * The categories of entries.
 *
 * @see https://api.fishfish.gg/v1/docs#enum-domain_category
 * @see https://api.fishfish.gg/v1/docs#enum-url_category
 */
export enum Category {
	Malware = 'malware',
	Phishing = 'phishing',
	Safe = 'safe',
}

/**
 * The permissions for the session token.
 */
export enum Permission {
	Domains = 'domains',
	Urls = 'urls',
}
