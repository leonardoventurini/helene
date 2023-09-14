"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisTestUtil = void 0;
const redis_1 = require("redis");
class RedisTestUtil {
    constructor(opts) {
        this.connect(opts).catch(console.error);
    }
    async connect(opts) {
        const defaultOptions = {
            url: 'redis://localhost:6379',
        };
        before(async () => {
            this.pub = (0, redis_1.createClient)({ ...defaultOptions, ...opts });
            this.sub = (0, redis_1.createClient)({ ...defaultOptions, ...opts });
            await this.pub.connect();
            await this.sub.connect();
        });
        // Need to quit otherwise it hangs the server.
        after(async () => {
            await this.pub.quit();
            await this.sub.quit();
            this.pub = undefined;
            this.sub = undefined;
        });
    }
    publishNextTick(channel, value) {
        process.nextTick(() => {
            this.pub.publish(channel, value).catch(console.error);
        });
    }
    wait(channel, callback) {
        return new Promise((resolve, reject) => {
            this.sub
                .pSubscribe(channel, function (message) {
                if (callback) {
                    resolve(callback(channel, message));
                }
                else {
                    resolve({ channel, message });
                }
            })
                .catch(reject);
        });
    }
}
exports.RedisTestUtil = RedisTestUtil;
//# sourceMappingURL=redis-test-util.js.map