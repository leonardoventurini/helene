/**
 * Way data is stored for this database
 * For a Node.js/Node Webkit database it's the file system
 * For a browser-side database it's localforage which chooses the best option depending on user browser (IndexedDB then WebSQL then localStorage)
 *
 * This version is the Node.js/Node Webkit version
 * It's essentially fs, mkdirp and crash safe write and read functions
 */

import fs, { closeSync, fsyncSync, openSync } from 'fs'
import { appendFile, readFile, rename, unlink, writeFile } from 'fs/promises'
import mkdirp from 'mkdirp'
import path from 'path'

export const Storage = {
  exists: fs.existsSync,
  rename,
  writeFile,
  unlink,
  appendFile,
  readFile,
  mkdirp,

  async ensureFileDoesntExist(file) {
    const exists = Storage.exists(file)

    if (!exists) {
      return null
    }

    await Storage.unlink(file)
  },

  /**
   * Flush data in OS buffer to storage if corresponding option is set
   * @param {String} options.filename
   * @param {Boolean} options.isDir Optional, defaults to false
   * If options is a string, it is assumed that the flush of the file (not dir) called options was requested
   */
  async flushToStorage(options) {
    let filename, flags
    if (typeof options === 'string') {
      filename = options
      flags = 'r+'
    } else {
      filename = options.filename
      flags = options.isDir ? 'r' : 'r+'
    }

    // Windows can't fsync (FlushFileBuffers) directories. We can live with this as it cannot cause 100% dataloss
    // except in the very rare event of the first time database is loaded and a crash happens
    if (flags === 'r' && ['win32', 'win64'].includes(process.platform)) {
      return null
    }

    const fd = openSync(filename, flags)
    fsyncSync(fd)
    closeSync(fd)
  },

  /**
   * Fully write or rewrite the datafile, immune to crashes during the write operation (data will not be lost)
   * @param {String} filename
   * @param {String} data
   */
  async crashSafeWriteFile(filename, data) {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    const tempFilename = filename + '~'

    await Storage.flushToStorage({
      filename: path.dirname(filename),
      isDir: true,
    })

    const exists = Storage.exists(filename)

    if (exists) {
      await Storage.flushToStorage(filename)
    }

    await Storage.writeFile(tempFilename, data)

    await Storage.flushToStorage(tempFilename)

    await Storage.rename(tempFilename, filename)

    await Storage.flushToStorage({
      filename: path.dirname(filename),
      isDir: true,
    })
  },

  /**
   * Ensure the datafile contains all the data, even if there was a crash during a full file write
   * @param {String} filename
   */
  async ensureDatafileIntegrity(filename) {
    const tempFilename = filename + '~'

    const filenameExists = Storage.exists(filename)
    // Write was successful
    if (filenameExists) {
      return null
    }

    const oldFilenameExists = Storage.exists(tempFilename)

    // New database
    if (!oldFilenameExists) {
      return await Storage.writeFile(filename, '', 'utf8')
    }

    // Write failed, use old version
    await Storage.rename(tempFilename, filename)
  },
}
