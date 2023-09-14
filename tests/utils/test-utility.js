"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TestUtility = void 0;
// @ts-ignore
const react_1 = __importDefault(require("react"));
const server_1 = require("../../server");
const utils_1 = require("../../utils");
const client_1 = require("../../client");
const react_2 = require("../../react");
const mocha_1 = require("mocha");
class TestUtility {
    constructor({ debug = false, globalInstance = true, redis = undefined, } = {}) {
        this.host = '127.0.0.1';
        beforeEach(async () => {
            // Make sure we have a different server for each test
            this.port = this.randomPort;
            this.server = await this.createSrv({
                debug,
                globalInstance,
                origins: ['http://localhost'],
                redis,
            });
            this.client = await this.createClient({
                debug,
            });
        });
        (0, mocha_1.afterEach)(async () => {
            await this.client.close();
            await this.server.close();
        });
    }
    get address() {
        return `${this.host}:${this.port}`;
    }
    get randomPort() {
        return Math.floor(Math.random() * (65536 - 40001) + 40000);
    }
    async createSrv(opts) {
        return new Promise((resolve, reject) => {
            const server = new server_1.Server({
                host: this.host,
                port: opts?.port ?? this.port,
                rateLimit: true,
                ...opts,
            });
            (0, mocha_1.afterEach)(async () => {
                setTimeout(() => {
                    server.close();
                }, 200);
            });
            server.once(utils_1.ServerEvents.READY, () => resolve(server));
            server.once(server_1.Server.ERROR_EVENT, error => reject(error));
        });
    }
    async createRandomSrv(opts) {
        return this.createSrv({
            port: this.randomPort,
            ...opts,
        });
    }
    async createClient(opts) {
        return new Promise((resolve, reject) => {
            const port = opts?.port ?? this.port;
            const client = new client_1.Client({
                host: opts?.host ?? this.host,
                port,
                eventSource: false,
                ...opts,
                ws: {
                    reconnect: false,
                    reconnectRetries: 3,
                    ...opts?.ws,
                },
            });
            (0, mocha_1.afterEach)(async () => {
                if (client.connected)
                    await client.close();
            });
            client.once(utils_1.ClientEvents.INITIALIZED, () => {
                resolve(client);
            });
            client.once(utils_1.ClientEvents.ERROR, error => reject(error));
            if (this.server.port === port) {
                this.server.once(utils_1.ServerEvents.CLOSED, () => {
                    client.close();
                });
            }
        });
    }
    async createHttpClient(opts) {
        return this.createClient({
            ...opts,
            eventSource: true,
            ws: {
                autoConnect: false,
            },
        });
    }
    async createEvent(event, channel = utils_1.NO_CHANNEL, opts) {
        this.server.addEvent(event, opts);
        await this.client.channel(channel).subscribe(event);
    }
    async catchError(callback) {
        try {
            await (callback instanceof Promise ? callback : callback);
            return null;
        }
        catch (e) {
            return e;
        }
    }
    async sleep(timeout = 1000) {
        return new Promise(resolve => {
            setTimeout(() => resolve(), timeout);
        });
    }
    get wrapper() {
        const client = this.client;
        return function wrapper({ children }) {
            return react_1.default.createElement(react_2.ClientProvider, { clientInstance: client }, children);
        };
    }
}
exports.TestUtility = TestUtility;
//# sourceMappingURL=test-utility.js.map