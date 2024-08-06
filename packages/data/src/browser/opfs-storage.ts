import { IStorage } from '../types'

const ns = 'helene:data:'

export class OPFSStorage implements IStorage {
  private async getFileHandle(name: string, create: boolean = false) {
    const opts = create ? { create: true } : {}
    const dirHandle = await navigator.storage.getDirectory()
    return await dirHandle.getFileHandle(`${ns}${name}`, opts)
  }

  async read(name: string) {
    const fileHandle = await this.getFileHandle(name)
    const file = await fileHandle.getFile()
    return await file.text()
  }

  async write(name: string, data: string) {
    const finalFileHandle = await this.getFileHandle(name, true)
    const finalWritable = await finalFileHandle.createWritable()
    await finalWritable.write(data)
    await finalWritable.close()
  }

  async append(name: string, data: string) {
    const fileHandle = await this.getFileHandle(name, true)
    const file = await fileHandle.getFile()
    const existingData = await file.text()

    const writable = await fileHandle.createWritable()
    await writable.write(existingData + data)
    await writable.close()
  }
}
