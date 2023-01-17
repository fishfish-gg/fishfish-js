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
	Admin = 'admin',
	Domains = 'domains',
	Urls = 'urls',
}

export enum WebSocketDataTypes {
	DomainCreate = 'domain_create',
	DomainDelete = 'domain_delete',
	DomainUpdate = 'domain_update',
	UrlCreate = 'url_create',
	UrlDelete = 'url_delete',
	UrlUpdate = 'url_update',
}
