"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = __importDefault(require("chai"));
const chai_as_promised_1 = __importDefault(require("chai-as-promised"));
const sinon_chai_1 = __importDefault(require("sinon-chai"));
const chai_subset_1 = __importDefault(require("chai-subset"));
chai_1.default.use(chai_as_promised_1.default);
chai_1.default.use(sinon_chai_1.default);
chai_1.default.use(chai_subset_1.default);
chai_1.default.should();
// Needed for Bun as mocha --exit does not work
after(() => {
    setTimeout(() => {
        process.exit(0);
    }, 5000);
});
//# sourceMappingURL=setup-tests.js.map