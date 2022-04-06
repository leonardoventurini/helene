import { SecurePersistentStorage } from './secure-persistent-storage'

const persistorMap = new Map<string, SecurePersistentStorage>()

export function getPersistorSingleton(
  encryptionNamespace: string,
  encryptionSecret: string,
): SecurePersistentStorage {
  const compositeKey = `${encryptionNamespace}:${encryptionSecret}`

  if (!persistorMap.get(compositeKey)) {
    persistorMap.set(
      compositeKey,
      new SecurePersistentStorage(encryptionNamespace, encryptionSecret),
    )
  }

  return persistorMap.get(compositeKey)
}
