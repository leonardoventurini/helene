import {
  Collection as MongoCollection,
  CollectionOptions,
  Db,
  Document,
  Filter,
  FindOptions,
} from 'mongodb'

/**
 * Need to take into account `skip` and `limit` so documents which are not in the range are not propagated.
 *
 * Need to apply projection before sending the documents.
 *
 * Keep the query documents in memory for better diffing and performance.
 */
export class Collection extends MongoCollection {
  constructor(db: Db, name: string, options?: CollectionOptions) {
    // @ts-ignore
    // For some reason, the constructor is not listed on the type definition
    super(db, name, options)
  }
}

export const LiveQueryMap = new Map<string, LiveQuery>()

export class LiveQuery<TSchema extends Document = Document>
  implements PromiseLike<any[]>
{
  collection: Collection
  filter: Filter<TSchema>
  options: FindOptions

  // @todo This cache should an instance of Helene Data Collection so we can simulate `skip` and `limit`
  // We should add comprehensive test cases for this feature,
  // test if the initial query fetch is the same as the simulated query fetch.
  // https://chat.openai.com/share/24917b3f-91e3-4f07-94be-4822398e75c8
  cache: Document[] = []

  static create<TSchema extends Document = Document>(
    collection: Collection,
    filter: Filter<TSchema>,
    options?: FindOptions,
  ) {
    const key = JSON.stringify({
      collectionName: collection.collectionName,
      filter,
      options,
    })

    if (LiveQueryMap.has(key)) {
      return LiveQueryMap.get(key) as LiveQuery<TSchema>
    }

    return new LiveQuery<TSchema>(key, collection, filter, options)
  }

  constructor(
    key: string,
    collection: Collection,
    filter: Filter<TSchema>,
    options?: FindOptions,
  ) {
    this.collection = collection
    this.filter = filter
    this.options = options

    LiveQueryMap.set(key, this)

    this.load().catch(console.error)
  }

  async load() {
    const cursor = this.collection.find(this.filter, this.options)
    this.cache = await cursor.toArray()
  }

  async fetch() {
    return this.cache
  }

  then<TResult1 = any[], TResult2 = never>(
    onfulfilled?:
      | ((value: any) => PromiseLike<TResult1> | TResult1)
      | undefined
      | null,
    onrejected?:
      | ((reason: any) => PromiseLike<TResult2> | TResult2)
      | undefined
      | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.fetch().then(onfulfilled, onrejected)
  }
}
