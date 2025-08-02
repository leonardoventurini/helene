export interface IStorage {
  read(name: string): Promise<string>

  write(name: string, data: string): Promise<void>

  append(name: string, data: string): Promise<void>
}
