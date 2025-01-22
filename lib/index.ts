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
    Array.isArray(cacheKey) ? await this.client.mdel(cacheKey) : await this.client.del(cacheKey)
  }

  public async keys(pattern: string): Promise<string[]> {
    /**
     * isMatch.
     */
    const isMatch = (pattern: string, key: string) => {
      if (pattern === key)  return true;

      if (pattern.includes('%')) {
        key = key.replace(/%/g, '*');
      }

      if (wcmatch(pattern)(key)) return true;

      try {
        const regExp = new RegExp(pattern, 'g');
        return regExp.test(key);
      } catch {
        return false;
      }
    };

    const keyss = await Promise.all(
      this.stores.map(async (store): Promise<string[]> => {
        // pattern.
        let _pattern: string;

        if (!store.useKeyPrefix) {
          _pattern = pattern;
        } else if (store.namespace && !pattern.startsWith(store.namespace)) {
          _pattern = `${store.namespace}:${pattern}`;
        } else {
          _pattern = pattern;
        }

        // original store.
        let orgStore: any

        if (store.store.store?.keys) {
          orgStore = store.store.store;
        } else if (store.store.keys) {
          orgStore = store.store;
        }

        const keyFnTag = orgStore?.keys?.[Symbol.toStringTag]

        const orgStoreTag = orgStore?.[Symbol.toStringTag];

        // keys.
        const keys = [] as string[];

        // Map Iterator
        if (keyFnTag === 'Map Iterator') {
          keys.push(...Array.from<string>(orgStore?.keys))
        }
        // AsyncGeneratorFunction
        else if (keyFnTag === 'AsyncGeneratorFunction') {
          for await (const key of orgStore?.keys(_pattern)) {
            keys.push(key);
          }
        }
        // GeneratorFunction
        else if (keyFnTag === 'GeneratorFunction') {
          keys.push(...Array.from<string>(orgStore?.keys(_pattern)))
        }
        // keyv
        else if (store.iterator) {
          for await (const [key, value] of store.iterator(store.namespace)) {
            keys.push(key);
          }
        }
        else {
          throw new Error('Not implemented');
        }

        return keys.filter(key => isMatch(_pattern, key));
      })
    )

    return keyss.flat();
  }

  async delHash(hashKeyOrKeys: string | string[]): Promise<void> {
    const keys = Array.isArray(hashKeyOrKeys) ? hashKeyOrKeys : [hashKeyOrKeys];
    const delPromises = keys.map((key) => this.keys(key).then(this.del));
    await Promise.all(delPromises);
  }

  public getClientTTL(): number {
    return 0;
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
