import { RedisClientOptions } from 'redis';
export declare class RedisTestUtil {
    pub: any;
    sub: any;
    constructor(opts?: RedisClientOptions);
    connect(opts: RedisClientOptions): Promise<void>;
    publishNextTick(channel: string, value: string): void;
    wait(channel: string, callback?: any): Promise<unknown>;
}
