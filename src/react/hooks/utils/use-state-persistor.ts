import { debounce, isString } from 'lodash'
import { useCallback, useEffect, useRef } from 'react'
import { SecurePersistentStorage } from '../../../persistence/secure-persistent-storage'
import { getPersistorSingleton } from '../../../persistence/get-persistor-singleton'

export function useStatePersistor(
  encryptionNamespace: string,
  encryptionSecret: string,
  key: string,
  defaultData?: any,
) {
  const compositeKeyRef = useRef(null)
  const persistorRef = useRef<SecurePersistentStorage>(
    getPersistorSingleton(encryptionNamespace, encryptionSecret),
  )

  const updaterRef = useCallback(
    debounce(
      (data: any) => {
        return isString(key) ? persistorRef.current?.setItem(key, data) : null
      },
      100,
      { maxWait: 5000 },
    ),
    [persistorRef.current],
  )

  useEffect(() => {
    const compositeKey = `${encryptionNamespace}:${encryptionSecret}`

    if (compositeKeyRef.current !== compositeKey) {
      persistorRef.current = getPersistorSingleton(
        encryptionNamespace,
        encryptionSecret,
      )

      compositeKeyRef.current = compositeKey
    }
  }, [encryptionNamespace, encryptionSecret, key])

  const currentData = isString(key)
    ? persistorRef.current?.getItem(key) || null // SecureLS can return an empty string.
    : null

  return [currentData ?? defaultData, updaterRef]
}
