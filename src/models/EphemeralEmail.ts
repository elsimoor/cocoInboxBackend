import { Schema, model, Document } from 'mongoose';

interface IEphemeralEmail extends Document {
  user_id: string;
  email_address: string;
  alias_name?: string;
  expires_at: string;
  is_active: boolean;
  created_at: string;
}

const ephemeralEmailSchema = new Schema<IEphemeralEmail>({
  user_id: { type: String, required: true },
  email_address: { type: String, required: true, unique: true },
  alias_name: { type: String },
  expires_at: { type: String, required: true },
  is_active: { type: Boolean, default: true },
  created_at: { type: String, default: () => new Date().toISOString() },
});

const EphemeralEmail = model<IEphemeralEmail>('EphemeralEmail', ephemeralEmailSchema);

export default EphemeralEmail;
export { IEphemeralEmail };