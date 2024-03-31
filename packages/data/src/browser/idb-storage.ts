import { IStorage } from '../types'
import { get, set } from 'idb-keyval'

export class IDBStorage implements IStorage {
  async read(name: string): Promise<string> {
    name = `helene:data:${name}`
    const value = await get(name)
    return value || ''
  }

  async write(name: string, data: string): Promise<void> {
    name = `helene:data:${name}`
    await set(name, data)
  }

  async append(name: string, data: string): Promise<void> {
    name = `helene:data:${name}`
    const existingData = await get(name)
    const newData = existingData ? existingData + data : data
    await set(name, newData)
  }
}
