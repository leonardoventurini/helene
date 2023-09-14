import React from 'react';
import { EventOptions, Server, ServerOptions } from '../../server';
import { Client, ClientOptions } from '../../client';
export declare class TestUtility {
    server: Server;
    client: Client;
    host: string;
    port: number;
    constructor({ debug, globalInstance, redis, }?: {
        debug?: boolean;
        globalInstance?: boolean;
        redis?: any;
    });
    get address(): string;
    get randomPort(): number;
    createSrv(opts?: ServerOptions): Promise<Server>;
    createRandomSrv(opts?: ServerOptions): Promise<Server>;
    createClient(opts?: ClientOptions): Promise<Client>;
    createHttpClient(opts?: ClientOptions): Promise<Client>;
    createEvent(event: string, channel?: string, opts?: EventOptions): Promise<void>;
    catchError(callback: Promise<any> | (() => Promise<any>)): Promise<any>;
    sleep(timeout?: number): Promise<void>;
    get wrapper(): ({ children }: {
        children: any;
    }) => React.JSX.Element;
}
