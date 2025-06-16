import cacheableManager, { CacheClient, CacheManagerOptions } from '@type-cacheable/core';
import { createCache } from 'cache-manager';
import { Keyv } from 'keyv';
import wcmatch from 'wildcard-match';

/**
 * cache-manager
 *    -> Keyv (store)
 *    -> KeyvStoreAdapter (store.store)
 *    -> real store (memory, redis, mongo, etc) (store.store.x)
 */
export class CacheManagerAdapter implements CacheClient {
  private client: ReturnType<typeof createCache>;
  private stores: Keyv[];

  constructor(client: ReturnType<typeof createCache>, stores: Keyv[]) {
    this.client = client;
    this.stores = stores;

    this.get = this.get.bind(this);
    this.del = this.del.bind(this);
    this.delHash = this.delHash.bind(this);
    this.getClientTTL = this.getClientTTL.bind(this);
    this.keys = this.keys.bind(this);
    this.set = this.set.bind(this);
  }

  public async get<T>(cacheKey: string): Promise<T | undefined> {
    const value = await this.client.get<T>(cacheKey)
    return value || undefined;
  }

  public async set<T>(cacheKey: string, value: T, ttl?: number): Promise<T> {
    await this.client.set(cacheKey, value, ttl ?? undefined);
    return value;
  }

  public async del(cacheKey: string | string[]): Promise<void> {
    if (!Array.isArray(cacheKey)) cacheKey = [cacheKey];
    await this.client.mdel(cacheKey);
  }

  public async keys(pattern: string): Promise<string[]> {
    const keysPromises = this.stores.map(async (store): Promise<string[]> => {
      // pattern.
      let realPattern: string;

      if (!store.useKeyPrefix) {
        realPattern = pattern;
      } else if (store.namespace && !pattern.startsWith(store.namespace)) {
        realPattern = `${store.namespace}:${pattern}`;
      } else {
        realPattern = pattern;
      }

      // original store.
      let orgStore: any

      if (store.store.store?.keys) {
        orgStore = store.store.store;
      } else if (store.store.keys) {
        orgStore = store.store;
      }

      const dialect = store.store?.opts?.dialect

      const keysFnTag = orgStore?.keys?.[Symbol.toStringTag]

      const orgStoreTag = orgStore?.[Symbol.toStringTag];

      // pattern fix.
      if (dialect === 'postgres') {
        realPattern = realPattern.replaceAll('*', '%');
      } else if (dialect === 'sqlite') {
        realPattern = realPattern.replaceAll('*', '%');
      }

      // ######################################
      // Get keys.
      let keys = [] as string[];

      // Map Iterator
      if (keysFnTag === 'Map Iterator') {
        keys.push(...Array.from<string>(orgStore?.keys))
      }
      // AsyncGeneratorFunction
      else if (keysFnTag === 'AsyncGeneratorFunction') {
        for await (const key of orgStore?.keys(realPattern)) {
          keys.push(key);
        }
      }
      // GeneratorFunction
      else if (keysFnTag === 'GeneratorFunction') {
        keys.push(...Array.from<string>(orgStore?.keys(realPattern)))
      }
      // AsyncFunction
      else if (keysFnTag === 'AsyncFunction') {
        keys.push(...(await orgStore?.keys(realPattern)))
      }
      // Array Iterator
      else if (keysFnTag === 'Array Iterator') {
        for (const key of orgStore?.keys) {
          keys.push(key);
        }
      }
      // postgres
      else if (dialect === 'postgres') {
        const select = `SELECT key FROM ${store.store.opts.schema!}.${store.store.opts.table!} WHERE key LIKE $1`;
        const rows = await store.store.query(select, [realPattern ? `%${realPattern}%` : '%']);
        keys.push(...rows.map((row: any) => row.key));
      }
      // keyv
      else if (store.iterator) {
        for await (const [key, value] of store.iterator(realPattern)) {
          keys.push(key);
        }
      }
      else {
        throw new Error('Not implemented');
      }

      // ######################################
      // filter keys by pattern.
      keys = keys.filter(key => this.keyMatch(pattern, key))

      if (store.useKeyPrefix && store.namespace) {
        const reg = new RegExp(`^${store.namespace}:`);
        keys = keys.map(key => key.replace(reg, ''));
      }

      return keys;
    })

    return (await Promise.all(keysPromises)).flat();
  }

  async delHash(hashKeyOrKeys: string | string[]): Promise<void> {
    const hashKeys = Array.isArray(hashKeyOrKeys) ? hashKeyOrKeys : [hashKeyOrKeys];
    const delPromises = hashKeys.map((hashKey) => this.keys(hashKey).then(this.del));
    await Promise.all(delPromises);
  }

  public getClientTTL(): number {
    return 0;
  }

  protected keyMatch(pattern: string, key: string): boolean {
    if (pattern === key) return true;

    pattern = pattern.replaceAll('%', '*');

    if (wcmatch(pattern)(key)) return true;

    try {
      const regExp = new RegExp(pattern, 'g');
      return regExp.test(key);
    } catch {
      return false;
    }
  }
}

export const useAdapter = (client: ReturnType<typeof createCache>, stores: Keyv[], asFallback?: boolean, options?: CacheManagerOptions): CacheManagerAdapter => {
  const adapter = new CacheManagerAdapter(client, stores);

  if (asFallback) {
    cacheableManager.setFallbackClient(adapter);
  } else {
    cacheableManager.setClient(adapter);
  }

  if (options) {
    cacheableManager.setOptions(options);
  }

  return adapter;
}
