import { singletonHook } from 'react-singleton-hook'
import { useCallback, useState } from 'react'
import { useStatePersistor } from './use-state-persistor'
import { cloneDeep, merge } from 'lodash'

export const getMergerFunction =
  (state, setState, statePersistor) => updatedState => {
    // Needs to clone deeply so the hook updates for every ref change.
    const nextState = cloneDeep(merge(state, updatedState))
    setState(nextState)
    statePersistor(nextState)
  }

export const persistedStateHook = (
  encryptionNamespace: string,
  encryptionSecret: string,
  key: string,
  defaultValues?: any,
) =>
  singletonHook([defaultValues, () => null], () => {
    const [state, setState] = useState(null)

    const [persistedState, statePersistor] = useStatePersistor(
      encryptionNamespace,
      encryptionSecret,
      key,
      defaultValues,
    )

    const mergeState = useCallback(
      getMergerFunction(state ?? defaultValues, setState, statePersistor),
      [persistedState, statePersistor],
    )

    return [state ?? persistedState ?? defaultValues, mergeState]
  })
