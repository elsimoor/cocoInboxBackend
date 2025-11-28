import { Schema, model, Document } from 'mongoose';

interface IUser extends Document {
  email: string;
  password?: string;
  name?: string;
  roles: string[];
  is_pro: boolean;
  stripeCustomerId?: string;
  subscriptionStatus?: 'active' | 'canceled' | 'trialing' | 'past_due' | 'incomplete' | 'incomplete_expired' | 'unpaid' | null;
  subscriptionCurrentPeriodEnd?: Date | null;
  proGraceUntil?: Date | null;
  subscriptionCurrentPeriodStart?: Date | null;
  subscriptionCreatedAt?: Date | null;
  created_at: Date;
}

const userSchema = new Schema<IUser>({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String },
  roles: { type: [String], default: ['user'] },
  is_pro: { type: Boolean, default: false },
  stripeCustomerId: { type: String },
  subscriptionStatus: { type: String, default: null },
  subscriptionCurrentPeriodEnd: { type: Date, default: null },
  proGraceUntil: { type: Date, default: null },
  subscriptionCurrentPeriodStart: { type: Date, default: null },
  subscriptionCreatedAt: { type: Date, default: null },
  // @ts-ignore
  created_at: { type: Date, default: Date.now },
});

const User = model<IUser>('User', userSchema);

export default User;
export { IUser };