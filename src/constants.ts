export const API_BASE_URL = 'https://api.fishfish.gg/v1';

/**
 * The categories of entries.
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
