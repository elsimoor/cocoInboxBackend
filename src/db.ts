import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Load environment variables as early as possible. Without calling dotenv.config()
// here, modules that rely on variables like MONGO_URI may see them as undefined
// because index.ts calls dotenv.config() after importing this module. By
// invoking dotenv.config() at the top of this file, we ensure that
// process.env is populated before accessing it below.
dotenv.config();

const MONGODB_URI: string = process.env.MONGO_URI || '';

if (!MONGODB_URI) {
  throw new Error("MONGO_URI is not defined in the environment variables.");
}

export async function connectToDatabase(): Promise<void> {
  // If connection is already established, do nothing.
  if (mongoose.connection.readyState >= 1) {
    return;
  }

  try {
    await mongoose.connect(MONGODB_URI);
    console.log("Connected to MongoDB with Mongoose");
  } catch (error) {
    console.error("Mongoose connection error:", error);
    throw new Error("Could not connect to MongoDB");
  }
}