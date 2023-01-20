import { request } from 'undici';
import { API_BASE_URL } from '../constants.js';
import type { Permission } from '../enums.js';
import type { FishFishUser } from '../types.js';
import { validateResponse } from '../utils.js';
import type { CreateTokenResponseBody, FishFishAuthOptions, PartialMainToken } from './auth.js';
import { FishFishAuth } from './auth.js';

export class FishFishAdmin {
	private readonly auth: FishFishAuth;

	/**
	 * @param auth - The authentication options or instance.
	 */
	public constructor(auth: FishFishAuth | FishFishAuthOptions) {
		this.auth = auth instanceof FishFishAuth ? auth : new FishFishAuth(auth);
	}

	public async getSessionToken(): Promise<string> {
		return (await this.auth.createSessionToken()).token;
	}

	public async getUserMainToken(uid: string, tid: string): Promise<PartialMainToken> {
		const response = await request(`${API_BASE_URL}/users/${uid}/tokens/${tid}`, {
			method: 'GET',
			headers: {
				Authorization: await this.getSessionToken(),
			},
		});

		await validateResponse(response, this.auth.hasSessionToken);

		return response.body.json() as Promise<PartialMainToken>;
	}

	public async createUserMainToken(uid: string, permissions: Permission[]): Promise<CreateTokenResponseBody> {
		const response = await request(`${API_BASE_URL}/users/${uid}/tokens`, {
			method: 'POST',
			headers: {
				Authorization: await this.getSessionToken(),
			},
			body: JSON.stringify({
				permissions,
			}),
		});

		await validateResponse(response, this.auth.hasSessionToken);

		return response.body.json() as Promise<CreateTokenResponseBody>;
	}

	public async deleteUserMainToken(uid: string, tid: string) {
		const response = await request(`${API_BASE_URL}/users/${uid}/tokens/${tid}`, {
			method: 'DELETE',
			headers: {
				Authorization: await this.getSessionToken(),
			},
		});

		await validateResponse(response, this.auth.hasSessionToken);
	}

	public async getUser(id: string): Promise<FishFishUser> {
		const response = await request(`${API_BASE_URL}/users/${id}`, {
			method: 'GET',
			headers: {
				Authorization: await this.getSessionToken(),
			},
		});

		await validateResponse(response, this.auth.hasSessionToken);

		return response.body.json();
	}

	public async createUser() {
		const response = await request(`${API_BASE_URL}/users`, {
			method: 'POST',
			headers: {
				Authorization: await this.getSessionToken(),
			},
		});

		await validateResponse(response, this.auth.hasSessionToken);

		return response.body.json();
	}

	public async updateUser(id: string) {
		const response = await request(`${API_BASE_URL}/users/${id}`, {
			method: 'PATCH',
			headers: {
				Authorization: await this.getSessionToken(),
			},
		});

		await validateResponse(response, this.auth.hasSessionToken);

		return response.body.json();
	}

	public async deleteUser(id: string) {
		const response = await request(`${API_BASE_URL}/users/${id}`, {
			method: 'DELETE',
			headers: {
				Authorization: await this.getSessionToken(),
			},
		});

		await validateResponse(response, this.auth.hasSessionToken);
	}
}
