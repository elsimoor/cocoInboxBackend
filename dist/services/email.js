"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMessages = exports.getToken = exports.createAccount = exports.getDomains = void 0;
const axios_1 = __importDefault(require("axios"));
const API_BASE_URL = 'https://api.mail.tm';
/**
 * Fetches the available domains from Mail.tm.
 */
const getDomains = async () => {
    try {
        const response = await axios_1.default.get(`${API_BASE_URL}/domains`);
        return response.data['hydra:member'];
    }
    catch (error) {
        console.error('Error fetching domains:', error);
        throw error;
    }
};
exports.getDomains = getDomains;
/**
 * Creates a new temporary email account.
 * @param address The email address to create.
 * @param password The password for the account.
 */
const createAccount = async (address, password) => {
    try {
        const response = await axios_1.default.post(`${API_BASE_URL}/accounts`, {
            address,
            password,
        });
        return response.data;
    }
    catch (error) {
        console.error('Error creating account:', error);
        throw error;
    }
};
exports.createAccount = createAccount;
/**
 * Retrieves a token for an existing account.
 * @param address The email address.
 * @param password The password for the account.
 */
const getToken = async (address, password) => {
    try {
        const response = await axios_1.default.post(`${API_BASE_URL}/token`, {
            address,
            password,
        });
        return response.data.token;
    }
    catch (error) {
        console.error('Error getting token:', error);
        throw error;
    }
};
exports.getToken = getToken;
/**
 * Fetches messages for a given account.
 * @param token The authentication token for the account.
 */
const getMessages = async (token) => {
    try {
        const response = await axios_1.default.get(`${API_BASE_URL}/messages`, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });
        return response.data['hydra:member'];
    }
    catch (error) {
        console.error('Error fetching messages:', error);
        throw error;
    }
};
exports.getMessages = getMessages;
