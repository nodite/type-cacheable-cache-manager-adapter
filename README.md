# @oscaner/cache-manager-adapter

[![npm downloads](https://img.shields.io/npm/dm/@oscaner/cache-manager-adapter)](https://www.npmjs.com/package/@oscaner/cache-manager-adapter)

🎉 cache-manager V6 supported

TypeScript-based caching decorators to assist with caching (and clearing cache for) async methods. This package supports `keyv` store engines.

This adapter is a bit different from the others, because it's essentially just giving you the option to use `@type-cacheable/core` decorators with store engines (similar to `@type-cacheable`'s other adapters)
maintained by `@type-cacheable`'s maintainers and users.

[View full documentation](https://github.com/joshuaslate/type-cacheable)

## Usage

### Installation

```bash
# npm install --save @type-cacheable/core @oscaner/cache-manager-adapter
npm install --save @type-cacheable/core https://github.com/Oscaner/type-cacheable-cache-manager-adapter.git#main
```

### Using adapter

See the [cache-manager documentation](https://github.com/jaredwray/cacheable/tree/main/packages/cache-manager) for more information on available store engines.

```ts
import { useAdapter } from '@oscaner/cache-manager-adapter';
import { KeyvCacheableMemory } from 'cacheable';
import Keyv from 'keyv';

// An example using the @resolid/keyv-sqlite adapter
const keyv = new Keyv({
  store: new KeyvCacheableMemory(),
  useKeyPrefix: false,
  serialize: undefined,
  deserialize: undefined
});

const client = createCache({ stores: [keyv] });

const clientAdapter = useAdapter(client, [keyv]);
```

Then you can rely on the `@Cacheable`, `@CacheUpdate`, and `@CacheClear` decorators from `@type-cacheable/core`. [See core documentation](https://github.com/joshuaslate/type-cacheable/tree/main/packages/core)
