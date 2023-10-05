import { useRef } from 'react'

export function useDepsChange(deps, data = {}) {
  const prevDeps = useRef([])

  deps.forEach((value, index) => {
    if (prevDeps.current[index] !== value) {
      console.debug(
        'Dep Changed',
        index,
        { prev: prevDeps.current[index] },
        { next: value },
        data,
      )
    }
  })

  prevDeps.current = [...deps]
}
