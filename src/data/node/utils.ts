import fs from 'fs'

export async function ensureFileDoesntExist(filename: string) {
  if (fs.existsSync(filename)) await fs.promises.unlink(filename)
}

export async function ensureDatafileIntegrity(filename) {
  const tempFilename = filename + '~'

  // Write was successful
  if (fs.existsSync(filename)) {
    return null
  }

  // New database
  if (!fs.existsSync(tempFilename)) {
    return await fs.promises.writeFile(filename, '', 'utf8')
  }

  // Write failed, use old version
  await fs.promises.rename(tempFilename, filename)
}

export async function flushToStorage(options) {
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

  const fd = fs.openSync(filename, flags)
  fs.fsyncSync(fd)
  fs.closeSync(fd)
}
