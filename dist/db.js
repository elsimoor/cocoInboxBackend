"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectToDatabase = connectToDatabase;
const mongoose_1 = __importDefault(require("mongoose"));
const dotenv_1 = __importDefault(require("dotenv"));
// Load environment variables as early as possible. Without calling dotenv.config()
// here, modules that rely on variables like MONGO_URI may see them as undefined
// because index.ts calls dotenv.config() after importing this module. By
// invoking dotenv.config() at the top of this file, we ensure that
// process.env is populated before accessing it below.
dotenv_1.default.config();
const MONGODB_URI = process.env.MONGO_URI || '';
if (!MONGODB_URI) {
    throw new Error("MONGO_URI is not defined in the environment variables.");
}
async function connectToDatabase() {
    // If connection is already established, do nothing.
    if (mongoose_1.default.connection.readyState >= 1) {
        return;
    }
    try {
        await mongoose_1.default.connect(MONGODB_URI);
        console.log("Connected to MongoDB with Mongoose");
    }
    catch (error) {
        console.error("Mongoose connection error:", error);
        throw new Error("Could not connect to MongoDB");
    }
}
