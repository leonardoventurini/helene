/**
 * Way data is stored for this database
 * For a Node.js/Node Webkit database it's the file system
 * For a browser-side database it's localforage which chooses the best option depending on user browser (IndexedDB then WebSQL then localStorage)
 *
 * This version is the Node.js/Node Webkit version
 * It's essentially fs, mkdirp and crash safe write and read functions
 */
import fs from 'fs'
import mkdirp from 'mkdirp'
import path from 'path'
import { IStorage } from './types'
import { ensureDatafileIntegrity, flushToStorage } from './utils'

export class NodeStorage implements IStorage {
  async read(name: string) {
    await mkdirp(path.dirname(name))

    await ensureDatafileIntegrity(name)

    return await fs.promises.readFile(name, 'utf8')
  }

  /**
   * Fully write or rewrite the datafile, immune to crashes during the write operation (data will not be lost)
   */
  async write(name, data) {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    const tempFilename = name + '~'

    await flushToStorage({
      filename: path.dirname(name),
      isDir: true,
    })

    const exists = fs.existsSync(name)

    if (exists) {
      await flushToStorage(name)
    }

    fs.writeFileSync(tempFilename, data)

    await flushToStorage(tempFilename)

    await fs.promises.rename(tempFilename, name)

    await flushToStorage({
      filename: path.dirname(name),
      isDir: true,
    })
  }

  async append(name, data) {
    await fs.promises.appendFile(name, data, 'utf8')
  }
}
