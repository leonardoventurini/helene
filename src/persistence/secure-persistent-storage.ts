import SecureLS from 'secure-ls'

export class SecurePersistentStorage {
  private secureLocalStorage: SecureLS

  constructor(encryptionNamespace: string, encryptionSecret: string) {
    this.secureLocalStorage = new SecureLS({
      encodingType: 'aes',
      isCompression: false,
      encryptionNamespace,
      encryptionSecret,
    })
  }

  getItem(key: string) {
    return this.secureLocalStorage.get(key) ?? null
  }

  removeItem(key: string) {
    return this.secureLocalStorage.remove(key)
  }

  setItem(key: string, data: any) {
    return this.secureLocalStorage.set(key, data)
  }
}
