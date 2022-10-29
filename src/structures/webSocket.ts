import type { Buffer } from 'node:buffer';
import { setTimeout } from 'node:timers';
import WebSocket from 'ws';
import type { Permission } from '../constants.js';
import { WEBSOCKET_BASE_URL } from '../constants.js';
import { ErrorsMessages } from '../errors.js';
import type { RawDomainData, RawURLData } from '../types.js';
import { transformData } from '../utils.js';
import type { FishFishApi, FishFishDomain, FishFishURL } from './api.js';
import { FishFishAuth } from './auth.js';

/**
 * The options for the FishFish WebSocket.
 */
export interface FishFishWebSocketOptions {
	/**
	 * The callback to be called when a websocket receives a message.
	 *
	 * @param data - The data received from the WebSocket.
	 */
	callback?(data: FishFishWebSocketData): void;
	/**
	 * Enables debug logging.
	 */
	debug?: boolean;
	/**
	 * The Fish.Fish API instance tied to this WebSocket.
	 */
	manager?: FishFishApi;
	/**
	 * The permissions to use when creating a session token.
	 */
	permissions: Permission[];
}

/**
 * The data received from the WebSocket.
 */
export interface FishFishWebSocketData {
	/**
	 * The domains to be processed.
	 */
	domains: RawDomainData[];
	/**
	 * The type of data received.
	 *
	 * - `add` - Added to the database.
	 * - `delete` - Deleted from the database.
	 */
	type: 'add' | 'delete';
	/**
	 * The URLs to be processed.
	 */
	urls: RawURLData[];
}

export class FishFishWebSocket {
	private connection: WebSocket | null;

	private readonly auth: FishFishAuth;

	private readonly debug: boolean;

	private readonly manager: FishFishApi | null;

	private readonly callback: (data: FishFishWebSocketData) => void;

	private tries = 0;

	public constructor(apiKey: string, options: FishFishWebSocketOptions) {
		if (!apiKey || typeof apiKey !== 'string') {
			throw new Error(ErrorsMessages.INVALID_TYPE_STRING + typeof apiKey);
		}

		if (options?.callback && typeof options.callback !== 'function') {
			throw new Error(ErrorsMessages.INVALID_TYPE_FUNCTION + typeof options.callback);
		}

		if (!options?.permissions?.length) {
			throw new Error(ErrorsMessages.MISSING_DEFAULT_PERMISSIONS);
		}

		this.manager = options.manager ?? null;
		this.auth = this.manager?.auth ?? new FishFishAuth(apiKey, options.permissions);
		this.debug = options.debug ?? false;
		this.callback = options.callback?.bind(this) ?? this.defaultCallback.bind(this);
		this.connection = null;
		void this.connect();
	}

	public async connect() {
		this.connection = new WebSocket(WEBSOCKET_BASE_URL, {
			headers: {
				Authorization: (await this.auth.getSessionToken()).token,
			},
		});

		this.connection.on('open', this.onOpen.bind(this));
		this.connection.on('message', this.onMessage.bind(this));
		this.connection.on('close', this.onClose.bind(this));
		this.connection.on('error', this.onError.bind(this));
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
		this.callback(objData);
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
			void this.connect();
		}, this.backOff());
	}

	private backOff() {
		return Math.min(Math.floor(Math.exp(this.tries)), 10 * 60) * 1_000;
	}

	private defaultCallback(data: FishFishWebSocketData) {
		this.debugLogger('Received data from WebSocket', data);

		if (this.manager) {
			switch (data.type) {
				case 'add':
					for (const url of data.urls) {
						this.manager.cache.urls.set(url.url, transformData<FishFishURL>(url));
					}

					for (const domain of data.domains) {
						this.manager.cache.domains.set(domain.domain, transformData<FishFishDomain>(domain));
					}

					break;
				case 'delete':
					for (const url of data.urls) {
						this.manager.cache.urls.delete(url.url);
					}

					for (const domain of data.domains) {
						this.manager.cache.domains.delete(domain.domain);
					}

					break;
				default:
					this.debugLogger(`Unknown data type received ${data.type}`);
			}
		}
	}

	private debugLogger(message: string, ...args: unknown[]) {
		if (this.debug) {
			console.log(`[WebSocket: debug]: ${message}`, ...args);
		}
	}
}
