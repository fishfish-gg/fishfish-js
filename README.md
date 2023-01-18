<div align="center">
	<img src="https://avatars.githubusercontent.com/u/91234733" width="200" alt="fishfish" />
</div>
 
 # fishfish-js 🐟

The fishfish-js is a simple and easy to use JavaScript wrapper for the fishfish API and WebSocket.

- Typed
- Objected oriented
- Cache

**Documentation:** [API Docs](https://api.fishfish.gg/v1/docs)

### Installation

```bash
npm install fishfish-js
# or
yarn add fishfish-js
```

# How to use?

## **Static:**

```ts
import { getAllDomains, getAllUrls, Category } from 'fishfish-js';

const ScamDomains = await getAllDomains(Category.Phishing);
const ScamUrls = await getAllUrls(Category.Phishing);
```

## **FishFish Auth:**

It is recommended to have one `FishFishAuth` class and use it for all other classes to avoid unnecessary session tokens.

```ts
import { FishFishAuth, Permission } from 'fishfish-js';

const FishAuth = new FishFishAuth({
	apiKey: 'real-api-key',
});

// Infer the apiKey from the env FISHFISH_API_KEY
const FishAuth = new FishFishAuth();

console.log(await FishFish.getSessionToken());
```

## **FishFish API:**

```ts
import { FishFishAuth, FishFishApi, Permission } from 'fishfish-js';

const FishApi = new FishFishApi({
	auth: {
		apiKey: 'real-api-key',
	},
});

const FullScamDomains = await FishApi.getAllDomains(Category.Phishing, { full: true });
```

Or by using the `FishFishAuth` class:

```ts
import { FishFishAuth, FishFishApi } from 'fishfish-js';

const FishAuth = new FishFishAuth({
	apiKey: 'real-api-key',
});

const FishApi = new FishFishApi({
	auth: FishAuth,
});

const FullScamDomains = await FishApi.getAllUrls(Category.Phishing, { full: true });
```

## **FishFish WebSocket:**

Receive real-time updates from the fishfish WebSocket.

Pass your own callback function to the `FishFishWebSocket` class:

```ts
import { FishFishWebSocket } from 'fishfish-js';

const FishWebSocket = new FishFishWebSocket({
	auth: {
		apiKey: 'real-api-key',
	},
	callback: (data) => console.log(data),
});
```

Or use the `FishFishApi` class to receive the data and cache it:

```ts
import { FishFishWebSocket, FishFishApi } from 'fishfish-js';

const manager = new FishFishApi({
	auth: {
		apiKey: 'real-api-key',
	},
});

const FishWebSocket = new FishFishWebSocket({
	manager,
});

// or

const FishWebApi = new FishFishApi({
	auth: {
		apiKey: 'real-api-key',
	},
	webSocket: true,
});
```
