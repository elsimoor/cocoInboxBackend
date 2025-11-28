import { Schema, model, Document } from 'mongoose';

interface ISmtpDomainUsage extends Document {
  domain_id: Schema.Types.ObjectId;
  window_start: Date;
  count: number;
}

const smtpDomainUsageSchema = new Schema<ISmtpDomainUsage>({
  domain_id: { type: Schema.Types.ObjectId, ref: 'SmtpDomain', required: true },
  window_start: { type: Date, required: true },
  count: { type: Number, required: true },
});

const SmtpDomainUsage = model<ISmtpDomainUsage>('SmtpDomainUsage', smtpDomainUsageSchema, 'smtp_domain_usage');

export default SmtpDomainUsage;
export { ISmtpDomainUsage };