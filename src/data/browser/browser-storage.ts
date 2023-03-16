/**
 * Way data is stored for this database
 * For a Node.js/Node Webkit database it's the file system
 * For a browser-side database it's localforage which chooses the best option depending on user browser (IndexedDB then WebSQL then localStorage)
 *
 * This version is the Node.js/Node Webkit version
 * It's essentially fs, mkdirp and crash safe write and read functions
 */
import { IStorage } from '../types'

export class BrowserStorage implements IStorage {
  async read(name: string) {
    return localStorage.getItem(name)
  }

  /**
   * Fully write or rewrite the datafile, immune to crashes during the write operation (data will not be lost)
   */
  async write(name, data) {
    localStorage.setItem(name, data)
  }

  async append(name, data) {
    const existingData = localStorage.getItem(name)

    localStorage.setItem(name, existingData + data)
  }
}
