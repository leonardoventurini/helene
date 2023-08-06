import { useRequest } from 'ahooks'

export function useGitHub() {
  const { data, loading, error } = useRequest(async () => {
    const response = await fetch(
      'https://api.github.com/repos/leonardoventurini/helene',
    )
    return await response.json()
  })

  return {
    data,
    loading,
    error,
  }
}
