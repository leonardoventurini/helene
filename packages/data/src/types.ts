export interface IStorage {
  read(name: string): Promise<string>

  write(name: string, data: string): Promise<void>

  append(name: string, data: string): Promise<void>

  // Optional streaming methods for large datasets
  readStream?(name: string, chunkSize?: number): AsyncGenerator<string>

  writeStream?(name: string): WritableStream<string>
}
