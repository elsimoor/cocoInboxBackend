"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const db_1 = require("../db");
const User_1 = __importDefault(require("../models/User"));
async function makeAdmin() {
    const email = process.argv[2];
    if (!email) {
        console.error('Usage: ts-node src/scripts/makeAdmin.ts <email>');
        process.exit(1);
    }
    try {
        await (0, db_1.connectToDatabase)();
        const user = await User_1.default.findOne({ email });
        if (!user) {
            console.error(`User with email ${email} not found`);
            process.exit(1);
        }
        if (!user.roles.includes('admin')) {
            user.roles.push('admin');
            await user.save();
            console.log(`Successfully added admin role to ${email}`);
            console.log(`Current roles:`, user.roles);
        }
        else {
            console.log(`User ${email} already has admin role`);
            console.log(`Current roles:`, user.roles);
        }
        process.exit(0);
    }
    catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}
makeAdmin();
