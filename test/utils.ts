import type EventEmitter from 'node:events';
import type { Category, RawDomainData, RawURLData } from '../dist/index.js';

function createRandomUnixTimestamp(): number {
	return Math.floor(Math.random() * 1_000_000_000);
}

function randint(min: number, max: number): number {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomId(): string {
	return Math.random().toString(36).slice(7);
}

export function createRandomRawData(category: Category, type: 'domain'): RawDomainData;
export function createRandomRawData(category: Category, type: 'url'): RawURLData;
export function createRandomRawData(category: Category, type: 'domain' | 'url'): RawDomainData | RawURLData;
export function createRandomRawData(category: Category, type: 'domain' | 'url'): RawDomainData | RawURLData {
	const data = {
		category,
		added: createRandomUnixTimestamp(),
		checked: createRandomUnixTimestamp(),
		description: `This is a random description: ${randomId()}`,
		target: `Target enterprize: ${randomId()}`,
	};

	if (type === 'domain') {
		return {
			...data,
			domain: `test.${randomId()}.com`,
		};
	}

	return {
		...data,
		url: `https://test.${randomId()}.com/${randomId()}`,
	};
}

export function createBulkRandomRawData(category: Category, type: 'domain'): RawDomainData[];
export function createBulkRandomRawData(category: Category, type: 'url'): RawURLData[];
export function createBulkRandomRawData(category: Category, type: 'domain' | 'url'): (RawDomainData | RawURLData)[] {
	const data: (RawDomainData | RawURLData)[] = [];

	for (let idx = 0; idx < randint(500, 1_000); idx++) {
		data.push(createRandomRawData(category, type));
	}

	return data;
}

export function createRandomStringData(category: Category, type: 'domain' | 'url'): RawDomainData[] {
	// @ts-expect-error: This is a test file, so we don't care about the type.
	return createBulkRandomRawData(category, type).map((data) => data.url ?? data.domain);
}

export async function promisifyEvent<T>(emitter: EventEmitter, event: string): Promise<T> {
	// eslint-disable-next-line no-promise-executor-return
	return new Promise((resolve) => emitter.once(event, resolve));
}
