import { Schema, model, Document } from 'mongoose';

interface ITempPhoneNumber extends Document {
  user_id: string;
  phone_number: string; // E.164 e.g. +15551231234
  provider: 'twilio' | 'vonage';
  expires_at?: Date;
  is_active: boolean;
  assigned_at: string;
  country?: string;
}

const tempPhoneNumberSchema = new Schema<ITempPhoneNumber>({
  user_id: { type: String, required: true },
  phone_number: { type: String, required: true, unique: true },
  provider: { type: String, enum: ['twilio', 'vonage'], default: 'twilio' },
  expires_at: { type: Date },
  is_active: { type: Boolean, default: true },
  assigned_at: { type: String, default: () => new Date().toISOString() },
  country: { type: String },
});

// TTL index: auto-remove when expires_at reached
tempPhoneNumberSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

const TempPhoneNumber = model<ITempPhoneNumber>('TempPhoneNumber', tempPhoneNumberSchema);

export default TempPhoneNumber;
export { ITempPhoneNumber };

