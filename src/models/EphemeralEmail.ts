import { Schema, model, Document } from 'mongoose';

interface IEphemeralEmail extends Document {
  user_id: string;
  email_address: string;
  alias_name?: string;
  expires_at: string;
  is_active: boolean;
  created_at: string;
  provider?: 'freemium' | 'mailchimp';
  provider_metadata?: Record<string, any> | null;
}

const ephemeralEmailSchema = new Schema<IEphemeralEmail>({
  user_id: { type: String, required: true },
  email_address: { type: String, required: true, unique: true },
  alias_name: { type: String },
  expires_at: { type: String, required: true },
  is_active: { type: Boolean, default: true },
  created_at: { type: String, default: () => new Date().toISOString() },
  provider: { type: String, enum: ['freemium', 'mailchimp'], default: 'freemium' },
  provider_metadata: { type: Schema.Types.Mixed, default: null },
});

const EphemeralEmail = model<IEphemeralEmail>('EphemeralEmail', ephemeralEmailSchema);

export default EphemeralEmail;
export { IEphemeralEmail };
