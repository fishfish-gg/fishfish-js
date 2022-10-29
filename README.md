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
```

## How to use?

- **Static:**

```ts
import { getAllDomains, getAllUrls, Category } from 'fishfish-js';

const ScamDomains = await getAllDomains(Category.Phishing);
const ScamUrls = await getAllUrls(Category.Phishing);
```

- **FishFish Auth:**

```ts
import { FishFishAuth, Permission } from 'fishfish-js';

const FishAuth = new FishFishAuth('real-api-key', [Permission.Domain, Permission.Urls]);

console.log(await FishFish.getSessionToken());
```

- **FishFish API:**

```ts
import { FishFishApi, Permission } from 'fishfish-js';

const FishApi = new FishFishApi('real-api-key', { permissions: [Permission.Domain] });

const FullScamDomains = await FishApi.getAllDomains(Category.Phishing, { full: true });
```

- **FishFish WebSocket:**

```ts
import { FishFishWebSocket, Permission } from 'fishfish-js';

const FishWebSocket = new FishFishWebSocket('real-api-key', {
	permissions: [Permission.Domain, Permission.Urls],
	callback: (data) => console.log(data),
});
```
