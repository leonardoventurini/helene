export interface IStorage {
  read(name): Promise<string>

  write(name, data): Promise<void>

  append(name, data): Promise<void>
}
