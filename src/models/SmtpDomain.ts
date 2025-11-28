import { Schema, model, Document } from 'mongoose';

interface ISmtpDomain extends Document {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  from: string;
  limit: number;
  order: number;
  created_at: string;
}

const smtpDomainSchema = new Schema<ISmtpDomain>({
  host: { type: String, required: true },
  port: { type: Number, required: true },
  secure: { type: Boolean, required: true },
  username: { type: String, required: true },
  password: { type: String, required: true },
  from: { type: String, required: true },
  limit: { type: Number, required: true },
  order: { type: Number, required: true },
  created_at: { type: String, default: () => new Date().toISOString() },
});

const SmtpDomain = model<ISmtpDomain>('SmtpDomain', smtpDomainSchema, 'smtp_domains');

export default SmtpDomain;
export { ISmtpDomain };