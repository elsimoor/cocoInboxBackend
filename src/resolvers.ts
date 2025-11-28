import bcrypt from "bcrypt";
import { createHmac } from 'crypto';
import { GraphQLError } from "graphql";
import { getDomains, createAccount, getToken, getMessages } from './services/email';
import { randomBytes } from 'crypto';
import dotenv from 'dotenv';
import User from './models/User';
import { connectToDatabase } from './db';

// Ensure environment variables (such as JWT_SECRET) are loaded before
// accessing them. Without this call, JWT_SECRET may be undefined
// because dotenv.config() is invoked after imports in index.ts.
dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET must be defined');
}

const resolvers = {
  Query: {
    me: (_: any, __: any, context: any) => {
      if (!context.user) {
        throw new GraphQLError("You must be logged in to perform this action.", {
          extensions: { code: 'UNAUTHENTICATED' },
        });
      }
      return {
        ...context.user._doc,
        id: context.user.id,
      };
    },
    users: (_: any, __: any, context: any) => {
      if (!context.user) {
        throw new GraphQLError("You must be logged in to perform this action.", {
          extensions: { code: 'UNAUTHENTICATED' },
        });
      }
      return [];
    },
    messagesWith: (_: any, __: any, context: any) => {
      if (!context.user) {
        throw new GraphQLError("You must be logged in to perform this action.", {
          extensions: { code: 'UNAUTHENTICATED' },
        });
      }
      return [];
    },
    getEphemeralMessages: async (_: any, { address, password }: { address: string, password: string }) => {
      try {
        const token = await getToken(address, password);
        const messages = await getMessages(token);
        return messages;
      } catch (error) {
        console.error('Error fetching ephemeral messages:', error);
        throw new GraphQLError('Could not fetch messages', { extensions: { code: 'INTERNAL_SERVER_ERROR' } });
      }
    }
  },
  Mutation: {
    register: async (_: any, args: any) => {
      const { email, password, name } = args;

      await connectToDatabase();

      const existingUser = await User.findOne({ email });
      if (existingUser) {
        throw new GraphQLError("User with this email already exists", {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const newUser = {
        email,
        password: hashedPassword,
        name,
      };

      const user = await User.create(newUser);

      const plain = typeof (user as any).toObject === 'function' ? (user as any).toObject() : (user as any);
      return {
        id: user.id,
        ...plain,
      };
    },
    login: async (_: any, args: any) => {
      const { email, password } = args;

      await connectToDatabase();

      const user = await User.findOne({ email }).select('+password');
      if (!user || !user.password) {
        throw new GraphQLError("Invalid email or password", {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        throw new GraphQLError("Invalid email or password", {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      // Create a simple JWT-like token using HMAC SHA256. This avoids reliance on
      // external dependencies such as jsonwebtoken. The token consists of a
      // base64url-encoded header, payload, and signature.
      const header = { alg: 'HS256', typ: 'JWT' };
      const payload = { userId: user._id, roles: user.roles, exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60 };
      const base64url = (input: Buffer | string) => {
        return Buffer.from(typeof input === 'string' ? input : input.toString())
          .toString('base64')
          .replace(/=/g, '')
          .replace(/\+/g, '-')
          .replace(/\//g, '_');
      };
      const headerEncoded = base64url(JSON.stringify(header));
      const payloadEncoded = base64url(JSON.stringify(payload));
      const dataToSign = `${headerEncoded}.${payloadEncoded}`;
      const signature = createHmac('sha256', JWT_SECRET as string)
        .update(dataToSign)
        .digest('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
      const token = `${headerEncoded}.${payloadEncoded}.${signature}`;
      return token;
    },
    sendMessage: (_: any, args: any, context: any) => {
      if (!context.user) {
        throw new GraphQLError("You must be logged in to perform this action.", {
          extensions: { code: 'UNAUTHENTICATED' },
        });
      }
      return { id: "m1", senderId: context.user._id, receiverId: args.receiverId, ciphertext: args.ciphertext, createdAt: new Date().toISOString() };
    },
    createEphemeralEmail: async (_: any, __: any, context: any) => {
      if (!context.user) {
        throw new GraphQLError("You must be logged in to perform this action.", {
          extensions: { code: 'UNAUTHENTICATED' },
        });
      }
      try {
        const domains = await getDomains();
        if (!domains || domains.length === 0) {
          throw new GraphQLError('No domains available', { extensions: { code: 'INTERNAL_SERVER_ERROR' } });
        }
        const domain = domains[0].domain;
        const username = randomBytes(8).toString('hex');
        const address = `${username}@${domain}`;
        const password = randomBytes(12).toString('hex');

        await createAccount(address, password);

        return {
          address,
          password,
        };
      } catch (error) {
        console.error('Error creating ephemeral email:', error);
        throw new GraphQLError('Could not create ephemeral email', { extensions: { code: 'INTERNAL_SERVER_ERROR' } });
      }
    },
  }
};

export default resolvers;