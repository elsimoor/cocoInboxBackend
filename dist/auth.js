"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUser = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const dotenv_1 = __importDefault(require("dotenv"));
const User_1 = __importDefault(require("./models/User"));
const db_1 = require("./db");
// Load environment variables before accessing them. Without this call,
// process.env.JWT_SECRET may be undefined because dotenv.config() was
// previously invoked too late in index.ts. By calling it here, we
// ensure JWT_SECRET is available when this module is evaluated.
dotenv_1.default.config();
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    throw new Error("JWT_SECRET is not defined in the environment variables.");
}
const getUser = async (req) => {
    const header = req.headers.authorization;
    if (!header) {
        return null;
    }
    const token = header.replace("Bearer ", "");
    if (!token) {
        return null;
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        if (!decoded || !decoded.userId) {
            return null;
        }
        await (0, db_1.connectToDatabase)();
        const user = await User_1.default.findById(decoded.userId);
        return user;
    }
    catch (err) {
        // Invalid token, expired token, etc.
        return null;
    }
};
exports.getUser = getUser;
