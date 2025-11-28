"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bcrypt_1 = __importDefault(require("bcrypt"));
const crypto_1 = require("crypto");
const graphql_1 = require("graphql");
const email_1 = require("./services/email");
const crypto_2 = require("crypto");
const dotenv_1 = __importDefault(require("dotenv"));
const User_1 = __importDefault(require("./models/User"));
const db_1 = require("./db");
// Ensure environment variables (such as JWT_SECRET) are loaded before
// accessing them. Without this call, JWT_SECRET may be undefined
// because dotenv.config() is invoked after imports in index.ts.
dotenv_1.default.config();
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    throw new Error('JWT_SECRET must be defined');
}
const resolvers = {
    Query: {
        me: (_, __, context) => {
            if (!context.user) {
                throw new graphql_1.GraphQLError("You must be logged in to perform this action.", {
                    extensions: { code: 'UNAUTHENTICATED' },
                });
            }
            return {
                ...context.user._doc,
                id: context.user.id,
            };
        },
        users: (_, __, context) => {
            if (!context.user) {
                throw new graphql_1.GraphQLError("You must be logged in to perform this action.", {
                    extensions: { code: 'UNAUTHENTICATED' },
                });
            }
            return [];
        },
        messagesWith: (_, __, context) => {
            if (!context.user) {
                throw new graphql_1.GraphQLError("You must be logged in to perform this action.", {
                    extensions: { code: 'UNAUTHENTICATED' },
                });
            }
            return [];
        },
        getEphemeralMessages: async (_, { address, password }) => {
            try {
                const token = await (0, email_1.getToken)(address, password);
                const messages = await (0, email_1.getMessages)(token);
                return messages;
            }
            catch (error) {
                console.error('Error fetching ephemeral messages:', error);
                throw new graphql_1.GraphQLError('Could not fetch messages', { extensions: { code: 'INTERNAL_SERVER_ERROR' } });
            }
        }
    },
    Mutation: {
        register: async (_, args) => {
            const { email, password, name } = args;
            await (0, db_1.connectToDatabase)();
            const existingUser = await User_1.default.findOne({ email });
            if (existingUser) {
                throw new graphql_1.GraphQLError("User with this email already exists", {
                    extensions: { code: 'BAD_USER_INPUT' },
                });
            }
            const hashedPassword = await bcrypt_1.default.hash(password, 10);
            const newUser = {
                email,
                password: hashedPassword,
                name,
            };
            const user = await User_1.default.create(newUser);
            const plain = typeof user.toObject === 'function' ? user.toObject() : user;
            return {
                id: user.id,
                ...plain,
            };
        },
        login: async (_, args) => {
            const { email, password } = args;
            await (0, db_1.connectToDatabase)();
            const user = await User_1.default.findOne({ email }).select('+password');
            if (!user || !user.password) {
                throw new graphql_1.GraphQLError("Invalid email or password", {
                    extensions: { code: 'BAD_USER_INPUT' },
                });
            }
            const isValidPassword = await bcrypt_1.default.compare(password, user.password);
            if (!isValidPassword) {
                throw new graphql_1.GraphQLError("Invalid email or password", {
                    extensions: { code: 'BAD_USER_INPUT' },
                });
            }
            // Create a simple JWT-like token using HMAC SHA256. This avoids reliance on
            // external dependencies such as jsonwebtoken. The token consists of a
            // base64url-encoded header, payload, and signature.
            const header = { alg: 'HS256', typ: 'JWT' };
            const payload = { userId: user._id, roles: user.roles, exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60 };
            const base64url = (input) => {
                return Buffer.from(typeof input === 'string' ? input : input.toString())
                    .toString('base64')
                    .replace(/=/g, '')
                    .replace(/\+/g, '-')
                    .replace(/\//g, '_');
            };
            const headerEncoded = base64url(JSON.stringify(header));
            const payloadEncoded = base64url(JSON.stringify(payload));
            const dataToSign = `${headerEncoded}.${payloadEncoded}`;
            const signature = (0, crypto_1.createHmac)('sha256', JWT_SECRET)
                .update(dataToSign)
                .digest('base64')
                .replace(/=/g, '')
                .replace(/\+/g, '-')
                .replace(/\//g, '_');
            const token = `${headerEncoded}.${payloadEncoded}.${signature}`;
            return token;
        },
        sendMessage: (_, args, context) => {
            if (!context.user) {
                throw new graphql_1.GraphQLError("You must be logged in to perform this action.", {
                    extensions: { code: 'UNAUTHENTICATED' },
                });
            }
            return { id: "m1", senderId: context.user._id, receiverId: args.receiverId, ciphertext: args.ciphertext, createdAt: new Date().toISOString() };
        },
        createEphemeralEmail: async (_, __, context) => {
            if (!context.user) {
                throw new graphql_1.GraphQLError("You must be logged in to perform this action.", {
                    extensions: { code: 'UNAUTHENTICATED' },
                });
            }
            try {
                const domains = await (0, email_1.getDomains)();
                if (!domains || domains.length === 0) {
                    throw new graphql_1.GraphQLError('No domains available', { extensions: { code: 'INTERNAL_SERVER_ERROR' } });
                }
                const domain = domains[0].domain;
                const username = (0, crypto_2.randomBytes)(8).toString('hex');
                const address = `${username}@${domain}`;
                const password = (0, crypto_2.randomBytes)(12).toString('hex');
                await (0, email_1.createAccount)(address, password);
                return {
                    address,
                    password,
                };
            }
            catch (error) {
                console.error('Error creating ephemeral email:', error);
                throw new graphql_1.GraphQLError('Could not create ephemeral email', { extensions: { code: 'INTERNAL_SERVER_ERROR' } });
            }
        },
    }
};
exports.default = resolvers;
