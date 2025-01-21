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
    const isMatch = (key: string) => {
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
        const keys = [] as string[];

        // keyv
        if (store.iterator) {
          for await (const [key, value] of store.iterator(undefined)) {
            if (!isMatch(key)) continue;
            keys.push(key);
          }
        }
        // cacheable
        else if (typeof store.store.store?.keys?.[Symbol.iterator] === 'function') {
          for await (const key of store.store.store.keys) {
            if (!isMatch(key)) continue;
            keys.push(key);
          }
        }
        // lru-cache
        else if (typeof store.store.keys === 'function') {
          for (const key of store.store.keys()) {
            if (!isMatch(key)) continue;
            keys.push(key);
          }
        }
        else {
          throw new Error('Not implemented');
        }

        return keys;
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
