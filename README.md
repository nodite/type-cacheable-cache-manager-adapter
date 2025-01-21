# @type-cacheable/keyv-adapter

[![npm downloads](https://img.shields.io/npm/dm/@type-cacheable/keyv-adapter)](https://www.npmjs.com/package/@type-cacheable/keyv-adapter)

TypeScript-based caching decorators to assist with caching (and clearing cache for) async methods. This package supports `keyv` store engines.

This adapter is a bit different from the others, because it's essentially just giving you the option to use `@type-cacheable/core` decorators with store engines (similar to `@type-cacheable`'s other adapters)
maintained by `keyv` maintainers and users.

[View full documentation](https://github.com/joshuaslate/type-cacheable)

## Usage

### Installation

```bash
npm install --save @type-cacheable/core @type-cacheable/keyv-adapter
```

### Using adapter

See the [keyv documentation](https://github.com/jaredwray/cacheable/tree/main/packages/keyv#store-engines) for more information on available store engines.

```ts
import { sqliteStore } from '@resolid/keyv-sqlite';
import * as cacheManager from 'keyv';
import { join } from 'node:path';
import { useAdapter } from '@type-cacheable/keyv-adapter';

// An example using the @resolid/keyv-sqlite adapter
const store = sqliteStore({
  cacheTableName: 'cache',
  sqliteFile: join(process.cwd(), 'cache.sqlite3'),
});

const cacheManagerCache = cacheManager.createCache(store);

const clientAdapter = useAdapter(cacheManagerCache);
```

Then you can rely on the `@Cacheable`, `@CacheUpdate`, and `@CacheClear` decorators from `@type-cacheable/core`. [See core documentation](https://github.com/joshuaslate/type-cacheable/tree/main/packages/core)
