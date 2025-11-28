import { Schema, model, Document } from 'mongoose';

interface ISmsMessage extends Document {
  to: string;
  from: string;
  body: string;
  message_sid?: string;
  user_id?: string; // resolved via to mapping
  received_at: string;
  expires_at?: Date;
}

const smsMessageSchema = new Schema<ISmsMessage>({
  to: { type: String, required: true },
  from: { type: String, required: true },
  body: { type: String, required: true },
  message_sid: { type: String },
  user_id: { type: String },
  received_at: { type: String, default: () => new Date().toISOString() },
  expires_at: { type: Date },
});

// TTL for messages (default 24h if set). We'll set expires_at when creating.
smsMessageSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

const SmsMessage = model<ISmsMessage>('SmsMessage', smsMessageSchema);

export default SmsMessage;
export { ISmsMessage };

