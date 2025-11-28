import axios from 'axios';

const API_BASE_URL = 'https://api.mail.tm';

/**
 * Fetches the available domains from Mail.tm.
 */
export const getDomains = async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/domains`);
    return response.data['hydra:member'];
  } catch (error) {
    console.error('Error fetching domains:', error);
    throw error;
  }
};

/**
 * Creates a new temporary email account.
 * @param address The email address to create.
 * @param password The password for the account.
 */
export const createAccount = async (address: string, password: string) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/accounts`, {
      address,
      password,
    });
    return response.data;
  } catch (error) {
    console.error('Error creating account:', error);
    throw error;
  }
};

/**
 * Retrieves a token for an existing account.
 * @param address The email address.
 * @param password The password for the account.
 */
export const getToken = async (address: string, password: string) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/token`, {
      address,
      password,
    });
    return response.data.token;
  } catch (error) {
    console.error('Error getting token:', error);
    throw error;
  }
};

/**
 * Fetches messages for a given account.
 * @param token The authentication token for the account.
 */
export const getMessages = async (token: string) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/messages`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return response.data['hydra:member'];
  } catch (error) {
    console.error('Error fetching messages:', error);
    throw error;
  }
};