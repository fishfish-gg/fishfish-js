import type { Buffer } from 'node:buffer';
import EventEmitter from 'node:events';
import { setTimeout, setInterval, clearInterval } from 'node:timers';
import WebSocket from 'ws';
import { DEFAULT_IDENTITY, WEBSOCKET_BASE_URL } from '../constants.js';
import { WebSocketDataTypes } from '../enums.js';
import { ErrorsMessages } from '../errors.js';
import type { RawWebSocketData } from '../types.js';
import { transformData } from '../utils.js';
import type { FishFishDomain, FishFishURL } from './api.js';
import { FishFishApi } from './api.js';
import type { FishFishAuthOptions } from './auth.js';
import { FishFishAuth } from './auth.js';

/**
 * The data received from the WebSocket.
 */
export interface FishFishWebSocketData<T extends WebSocketDataTypes> extends RawWebSocketData<T> {
	/**
	 * The data of the event with dates parsed.
	 */
	data: RawWebSocketData<T>['data'] & {
		/**
		 * The date this URL/Domain was added to the API.
		 */
		added: Date;
		/**
		 * The date this URL/Domain was last checked.
		 *
		 * **Note**: This will be always the same as `added` for if the event is `domain_create` or `url_create`.
		 *
		 * @see WebSocketDataTypes
		 */
		checked: Date;
	};
}

/**
 * The options for the FishFish WebSocket.
 */
export interface FishFishWebSocketOptions {
	/**
	 * Authentication options.
	 *
	 * **Note**: If manager is provided, the auth will be taken from it and it will be preferred over this option.
	 *
	 * @defaultValue If manager is provided, the auth will be taken from it.
	 */
	auth?: FishFishAuth | FishFishAuthOptions;
	/**
	 * The callback to be called when a websocket receives a message.
	 *
	 * @param data - The data received from the WebSocket.
	 * @defaultValue If manager is provided, it will be used to populate the cache.
	 */
	callback?(data: FishFishWebSocketData<any>): void;
	/**
	 * Enables debug logging.
	 */
	debug?: boolean;
	/**
	 * Whether to fetch the data periodically to avoid missing data.
	 */
	fetchPeriodically?: boolean;
	/**
	 * The identity to identify your application to the WebSocket.
	 */
	identity?: string;
	/**
	 * The Fish.Fish API instance tied to this WebSocket.
	 */
	manager?: FishFishApi;
}

interface FishFishWebSocketEvents {
	data: [RawWebSocketData<any>];
	error: [Error];
	open: [WebSocket];
	[WebSocketDataTypes.DomainCreate]: [FishFishWebSocketData<WebSocketDataTypes.DomainCreate>['data']];
	[WebSocketDataTypes.DomainDelete]: [FishFishWebSocketData<WebSocketDataTypes.DomainDelete>['data']];
	[WebSocketDataTypes.DomainUpdate]: [FishFishWebSocketData<WebSocketDataTypes.DomainUpdate>['data']];
	[WebSocketDataTypes.UrlCreate]: [FishFishWebSocketData<WebSocketDataTypes.UrlCreate>['data']];
	[WebSocketDataTypes.UrlDelete]: [FishFishWebSocketData<WebSocketDataTypes.UrlDelete>['data']];
	[WebSocketDataTypes.UrlUpdate]: [FishFishWebSocketData<WebSocketDataTypes.UrlUpdate>['data']];
	close: [{ attemptReconnectAfterMilliseconds: number; code: number; reason: Buffer; tries: number }];
	debug: [string, ...unknown[]];
}

export class FishFishWebSocket {
	private readonly emitter = new EventEmitter();

	private connection: WebSocket | null;

	private readonly auth: FishFishAuth;

	private readonly debug: boolean;

	private readonly manager: FishFishApi | null;

	private readonly fetchPeriodically: boolean;

	private readonly identity: string;

	private readonly WebSocketUrl = WEBSOCKET_BASE_URL;

	private fetchTimeout: NodeJS.Timeout | null = null;

	private tries = 0;

	public constructor(options: FishFishWebSocketOptions = {}) {
		if (typeof options !== 'object') {
			throw new TypeError(ErrorsMessages.INVALID_OPTIONS);
		}

		if (options?.callback && typeof options.callback !== 'function') {
			throw new Error(ErrorsMessages.INVALID_CALLBACK + typeof options.callback);
		}

		if (options.manager && !(options.manager instanceof FishFishApi)) {
			throw new Error(ErrorsMessages.INVALID_MANAGER);
		}

		if (options.identity && typeof options.identity !== 'string') {
			throw new Error(ErrorsMessages.INVALID_TYPE_STRING + typeof options.identity + ' for identity');
		}

		this.fetchPeriodically = options.fetchPeriodically ?? true;

		this.manager = options.manager ?? null;

		this.auth =
			this.manager?.auth ??
			(options.auth instanceof FishFishAuth ? options.auth : new FishFishAuth(options.auth ?? {}));

		this.debug = options.debug ?? false;

		this.connection = null;

		this.identity = this.manager?.options.identity ?? options.identity ?? DEFAULT_IDENTITY;

		void this.connect();

		if (this.manager) {
			this.on('data', this.onData.bind(this));
		}

		if (this.fetchPeriodically) {
			void this.fetch();
		}
	}

	public get webSocket() {
		return this.connection;
	}

	/**
	 *
	 */
	public async connect() {
		this.debugLogger('Attempting to connect to WebSocket...');

		this.connection = new WebSocket(this.WebSocketUrl, {
			auth: (await this.auth.createSessionToken()).token,
			headers: {
				Authorization: (await this.auth.createSessionToken()).token,
				'X-Identity': this.identity,
			},
		});

		this.connection.on('open', this.onOpen.bind(this));
		this.connection.on('message', this.onMessage.bind(this));
		this.connection.on('close', this.onClose.bind(this));
		this.connection.on('error', this.onError.bind(this));

		if (this.fetchPeriodically) {
			if (this.fetchTimeout) {
				clearInterval(this.fetchTimeout);
			}

			this.debugLogger('Creating fetch interval...');
			this.fetchTimeout = setInterval(this.fetch.bind(this), 60 * 60 * 1_000);
		}
	}

	private onOpen() {
		this.debugLogger(`WebSocket connected to ${this.WebSocketUrl}`, {
			tries: this.tries,
		});
		this.tries = 0;

		this.emit('open', this.connection!);
	}

	private onError(error: Error) {
		this.debugLogger(`Unknown error received (${this.WebSocketUrl});`, error);

		this.emit('error', error);
	}

	private onMessage(rawData: Buffer) {
		const objData = JSON.parse(rawData.toString());

		const { type } = objData;
		const data = transformData<RawWebSocketData<any>['data']>(objData.data);

		this.emit('data', {
			type,
			data,
		});

		this.emit(objData.type, data);
	}

	private onClose(code: number, reason: Buffer) {
		const backOff = this.backOff();
		this.tries += 1;

		this.debugLogger(
			`WebSocket closed with code ${code} and reason ${reason}. Attempting reconnect after ${String(
				Math.round(backOff / 1_000),
			)} seconds`,
			{
				code,
				reason,
				attemptReconnectAfterMilliseconds: backOff,
			},
		);

		this.emit('close', {
			code,
			tries: this.tries,
			reason,
			attemptReconnectAfterMilliseconds: backOff,
		});

		setTimeout(() => {
			void this.connect();
		}, this.backOff());
	}

	private backOff() {
		return Math.min(Math.floor(Math.exp(this.tries)), 10 * 60) * 1_000;
	}

	private onData(rawData: RawWebSocketData<any>) {
		this.debugLogger('Received data from WebSocket', rawData);

		if (!this.manager) return;

		const data = transformData<RawWebSocketData<any>['data']>(rawData.data) as FishFishWebSocketData<any>['data'];

		if (this.manager) {
			switch (rawData.type) {
				case WebSocketDataTypes.DomainCreate:
					this.manager.cache.domains.set(data.domain!, data as FishFishDomain);

					break;
				case WebSocketDataTypes.DomainDelete:
					this.manager.cache.domains.delete(data.domain!);

					break;
				case WebSocketDataTypes.DomainUpdate:
					// eslint-disable-next-line no-case-declarations
					const domain = this.manager.cache.domains.get(data.domain!) ?? {};

					this.manager.cache.domains.set(data.domain!, { ...domain, ...(data as FishFishDomain) });

					break;
				case WebSocketDataTypes.UrlCreate:
					this.manager.cache.urls.set(data.url!, data as FishFishURL);

					break;
				case WebSocketDataTypes.UrlDelete:
					this.manager.cache.urls.delete(data.url!);

					break;
				case WebSocketDataTypes.UrlUpdate:
					// eslint-disable-next-line no-case-declarations
					const url = this.manager.cache.urls.get(data.url!) ?? {};

					this.manager.cache.urls.set(data.url!, { ...url, ...(data as FishFishURL) });

					break;
				default:
					this.debugLogger(`Unknown data type received ${rawData.type}`);
			}
		}
	}

	private async fetch() {
		this.debugLogger('Fetching data from Fish.Fish API');

		if (this.manager) {
			await this.manager.getAllUrls({});
			await this.manager.getAllDomains({});
		}
	}

	private debugLogger(message: string, ...args: unknown[]) {
		if (this.debug) {
			console.log(`[WebSocket: debug]: ${message}`, ...args);
		}

		this.emit('debug', message, ...args);
	}

	/**
	 * Checks if the data is a url data type and narrows the type
	 *
	 * @param data - The websocket data to check
	 * @returns True if the data is a url data type
	 */
	public static isUrlData(
		data: FishFishWebSocketData<any>,
	): data is FishFishWebSocketData<
		WebSocketDataTypes.UrlCreate | WebSocketDataTypes.UrlDelete | WebSocketDataTypes.UrlUpdate
	> {
		return [WebSocketDataTypes.UrlCreate, WebSocketDataTypes.UrlUpdate, WebSocketDataTypes.UrlDelete].includes(
			data.type!,
		);
	}

	/**
	 * Checks if the data is a domain data type and narrows the type
	 *
	 * @param data - The websocket data to check
	 * @returns True if the data is a domain data type
	 */
	public static isDomainData(
		data: FishFishWebSocketData<any>,
	): data is FishFishWebSocketData<
		WebSocketDataTypes.DomainCreate | WebSocketDataTypes.DomainDelete | WebSocketDataTypes.DomainUpdate
	> {
		return [WebSocketDataTypes.DomainCreate, WebSocketDataTypes.DomainUpdate, WebSocketDataTypes.DomainDelete].includes(
			data.type!,
		);
	}

	public emit<TEventName extends string & keyof FishFishWebSocketEvents>(
		eventName: TEventName,
		...eventArg: FishFishWebSocketEvents[TEventName]
	) {
		this.emitter.emit(eventName, ...eventArg);
	}

	public on<TEventName extends string & keyof FishFishWebSocketEvents>(
		eventName: TEventName,
		handler: (...eventArg: FishFishWebSocketEvents[TEventName]) => void,
	) {
		this.emitter.on(eventName, handler as any);
	}

	public once<TEventName extends string & keyof FishFishWebSocketEvents>(
		eventName: TEventName,
		handler: (...eventArg: FishFishWebSocketEvents[TEventName]) => void,
	) {
		this.emitter.once(eventName, handler as any);
	}

	public off<TEventName extends string & keyof FishFishWebSocketEvents>(
		eventName: TEventName,
		handler: (...eventArg: FishFishWebSocketEvents[TEventName]) => void,
	) {
		this.emitter.off(eventName, handler as any);
	}
}
