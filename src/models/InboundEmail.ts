import { Schema, model, Document } from 'mongoose';

export interface IInboundEmail extends Document {
  user_id: string;
  email_id: string;
  email_address: string;
  from: string;
  subject?: string;
  text?: string;
  html?: string;
  attachments?: { filename?: string; size?: number; contentType?: string }[];
  received_at: string;
  message_id?: string;
  provider?: string;
  raw_event?: any;
}

const inboundEmailSchema = new Schema<IInboundEmail>({
  user_id: { type: String, required: true },
  email_id: { type: String, required: true },
  email_address: { type: String, required: true },
  from: { type: String, required: true },
  subject: { type: String },
  text: { type: String },
  html: { type: String },
  attachments: [
    {
      filename: { type: String },
      size: { type: Number },
      contentType: { type: String },
    },
  ],
  received_at: { type: String, default: () => new Date().toISOString() },
  message_id: { type: String },
  provider: { type: String },
  raw_event: { type: Schema.Types.Mixed },
});

inboundEmailSchema.index({ message_id: 1, email_id: 1 }, { unique: true, sparse: true });
inboundEmailSchema.index({ email_id: 1, received_at: -1 });

const InboundEmail = model<IInboundEmail>('InboundEmail', inboundEmailSchema);
export default InboundEmail;
