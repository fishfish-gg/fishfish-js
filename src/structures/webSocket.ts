import type { Buffer } from 'node:buffer';
import { setTimeout, setInterval } from 'node:timers';
import WebSocket from 'ws';
import { DEFAULT_IDENTITY, WEBSOCKET_BASE_URL } from '../constants.js';
import { WebSocketDataTypes } from '../enums.js';
import { ErrorsMessages } from '../errors.js';
import type { FishFishWebSocketData } from '../types.js';
import { assertString, transformData } from '../utils.js';
import type { FishFishApi, FishFishDomain, FishFishURL } from './api.js';
import type { FishFishAuthOptions } from './auth.js';
import { FishFishAuth } from './auth.js';

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

export class FishFishWebSocket {
	private connection: WebSocket | null;

	private readonly auth: FishFishAuth;

	private readonly debug: boolean;

	private readonly manager: FishFishApi | null;

	private readonly fetchPeriodically: boolean;

	private readonly identity: string;

	private readonly callback: (data: FishFishWebSocketData<any>) => Promise<void> | void;

	private tries = 0;

	public constructor(options: FishFishWebSocketOptions) {
		assertString(options.identity, 'identity');

		if (options?.callback && typeof options.callback !== 'function') {
			throw new Error(ErrorsMessages.INVALID_CALLBACK + typeof options.callback);
		}

		this.fetchPeriodically = options.fetchPeriodically ?? true;

		this.manager = options.manager ?? null;
		this.auth =
			this.manager?.auth ??
			(options.auth instanceof FishFishAuth ? options.auth : new FishFishAuth(options.auth ?? {}));
		this.debug = options.debug ?? false;
		this.callback = options.callback?.bind(this) ?? this.defaultCallback.bind(this);
		this.connection = null;

		this.identity = this.manager?.options.identity ?? options.identity ?? DEFAULT_IDENTITY;

		void this.connect();

		if (this.fetchPeriodically) {
			void this.fetch();
		}
	}

	public async connect(reconnect = false) {
		this.debugLogger('Attempting to connect to WebSocket...');

		this.connection = new WebSocket(WEBSOCKET_BASE_URL, {
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

		if (this.fetchPeriodically && reconnect) {
			this.debugLogger('Creating fetch interval...');
			setInterval(this.fetch.bind(this), 60 * 60 * 1_000);
		}
	}

	private onOpen() {
		this.debugLogger(`WebSocket connected to ${WEBSOCKET_BASE_URL}`, {
			tries: this.tries,
		});
		this.tries = 0;
	}

	private onError(error: Error) {
		this.debugLogger('Unknown error received', error);
	}

	private onMessage(data: Buffer) {
		const objData = JSON.parse(data.toString());
		void this.callback(objData);
	}

	private onClose(code: number, reason: string) {
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

		setTimeout(() => {
			void this.connect(true);
		}, this.backOff());
	}

	private backOff() {
		return Math.min(Math.floor(Math.exp(this.tries)), 10 * 60) * 1_000;
	}

	private defaultCallback(rawData: FishFishWebSocketData<any>) {
		this.debugLogger('Received data from WebSocket', rawData);

		if (!this.manager) return;

		const { data } = rawData;

		if (this.manager) {
			switch (rawData.type) {
				case WebSocketDataTypes.DomainCreate:
					this.manager.cache.domains.set(data.domain!, transformData<FishFishDomain>(data));

					break;
				case WebSocketDataTypes.DomainDelete:
					this.manager.cache.domains.delete(data.domain!);

					break;

				case WebSocketDataTypes.DomainUpdate:
					// eslint-disable-next-line no-case-declarations
					const domain = this.manager.cache.domains.get(data.domain!) ?? {};

					this.manager.cache.domains.set(data.domain!, transformData<FishFishDomain>({ ...domain, ...data }));

					break;
				case WebSocketDataTypes.UrlCreate:
					this.manager.cache.urls.set(data.url!, transformData<FishFishURL>(data));

					break;
				case WebSocketDataTypes.UrlDelete:
					this.manager.cache.urls.delete(data.url!);

					break;
				case WebSocketDataTypes.UrlUpdate:
					// eslint-disable-next-line no-case-declarations
					const url = this.manager.cache.urls.get(data.url!) ?? {};

					this.manager.cache.urls.set(data.url!, transformData<FishFishURL>({ ...url, ...data }));

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
	}
}
