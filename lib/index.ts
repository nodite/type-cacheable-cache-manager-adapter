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
    await Promise.all(cacheKey.map(async (key) => await this.client.del(key)));
  }

  public async keys(pattern: string): Promise<string[]> {
    /**
     * isMatch.
     */
    const isMatch = (ptn: string, key: string) => {
      if (ptn === key)  return true;

      if (ptn.includes('%')) {
        ptn = ptn.replaceAll('%', '*');
      }

      if (wcmatch(ptn)(key)) return true;

      try {
        const regExp = new RegExp(ptn, 'g');
        return regExp.test(key);
      } catch {
        return false;
      }
    };

    const keysPromises = this.stores.map(async (store): Promise<string[]> => {
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

      const dialect = store.store.opts.dialect

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
      // AsyncFunction
      else if (keyFnTag === 'AsyncFunction') {
        keys.push(...(await orgStore?.keys(_pattern)))
      }
      // postgres
      else if (dialect === 'postgres') {
        const select = `SELECT key FROM ${store.store.opts.schema!}.${store.store.opts.table!} WHERE key LIKE $1`;
        const ptn = _pattern?.replaceAll('*', '%') ?? "";
        const rows = await store.store.query(select, [ptn ? `%${ptn}%` : '%']);
        keys.push(...rows.map((row: any) => row.key));
      }
      // keyv
      else if (store.iterator) {
        for await (const [key, value] of store.iterator(_pattern)) {
          keys.push(key);
        }
      }
      else {
        throw new Error('Not implemented');
      }

      return keys.filter(key => isMatch(_pattern, key));
    })

    const keys = [] as string[];

    for (const keysPromise of keysPromises) {
      keys.push(...await keysPromise);
    }

    return keys;
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
