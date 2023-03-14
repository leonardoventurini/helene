/**
 * Way data is stored for this database
 * For a Node.js/Node Webkit database it's the file system
 * For a browser-side database it's localforage which chooses the best option depending on user browser (IndexedDB then WebSQL then localStorage)
 *
 * This version is the Node.js/Node Webkit version
 * It's essentially fs, mkdirp and crash safe write and read functions
 */

import fs from 'fs'
import { appendFile } from 'fs/promises'
import mkdirp from 'mkdirp'
import async from 'async'
import path from 'path'
import { noop } from 'lodash'

export const Storage = {
  exists: fs.exists,
  rename: fs.rename,
  writeFile: fs.writeFile,
  unlink: fs.unlink,
  appendFile,
  readFile: fs.readFile,
  mkdirp: mkdirp,
  /**
   * Explicit name ...
   */
  ensureFileDoesntExist: function (file, callback) {
    Storage.exists(file, function (exists) {
      if (!exists) {
        return callback(null)
      }

      Storage.unlink(file, function (err) {
        return callback(err)
      })
    })
  },

  /**
   * Flush data in OS buffer to storage if corresponding option is set
   * @param {String} options.filename
   * @param {Boolean} options.isDir Optional, defaults to false
   * If options is a string, it is assumed that the flush of the file (not dir) called options was requested
   */
  flushToStorage: function (options, callback) {
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
      return callback(null)
    }

    fs.open(filename, flags, function (err, fd) {
      if (err) {
        return callback(err)
      }
      fs.fsync(fd, function (errFS) {
        fs.close(fd, function (errC) {
          if (errFS || errC) {
            const e = new Error('Failed to flush to storage')
            // @ts-ignore
            e.errorOnFsync = errFS
            // @ts-ignore
            e.errorOnClose = errC
            return callback(e)
          } else {
            return callback(null)
          }
        })
      })
    })
  },

  /**
   * Fully write or rewrite the datafile, immune to crashes during the write operation (data will not be lost)
   * @param {String} filename
   * @param {String} data
   * @param {Function} cb Optional callback, signature: err
   */
  crashSafeWriteFile: function (filename, data, cb) {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    const callback = cb || noop,
      tempFilename = filename + '~'

    async.waterfall(
      [
        async.apply(Storage.flushToStorage, {
          filename: path.dirname(filename),
          isDir: true,
        }),
        function (cb) {
          Storage.exists(filename, function (exists) {
            if (exists) {
              Storage.flushToStorage(filename, function (err) {
                return cb(err)
              })
            } else {
              return cb()
            }
          })
        },
        function (cb) {
          Storage.writeFile(tempFilename, data, function (err) {
            return cb(err)
          })
        },
        async.apply(Storage.flushToStorage, tempFilename),
        function (cb) {
          Storage.rename(tempFilename, filename, function (err) {
            return cb(err)
          })
        },
        async.apply(Storage.flushToStorage, {
          filename: path.dirname(filename),
          isDir: true,
        }),
      ],
      function (err) {
        return callback(err)
      },
    )
  },

  /**
   * Ensure the datafile contains all the data, even if there was a crash during a full file write
   * @param {String} filename
   * @param {Function} callback signature: err
   */
  ensureDatafileIntegrity: function (filename, callback) {
    const tempFilename = filename + '~'

    Storage.exists(filename, function (filenameExists) {
      // Write was successful
      if (filenameExists) {
        return callback(null)
      }

      Storage.exists(tempFilename, function (oldFilenameExists) {
        // New database
        if (!oldFilenameExists) {
          return Storage.writeFile(filename, '', 'utf8', function (err) {
            callback(err)
          })
        }

        // Write failed, use old version
        Storage.rename(tempFilename, filename, function (err) {
          return callback(err)
        })
      })
    })
  },
}
