import { Schema, model, Document } from 'mongoose'

export interface ISentEmail extends Document {
  user_id: string
  from: string
  to: string
  subject: string
  text?: string
  html?: string
  sent_at: string
}

const sentEmailSchema = new Schema<ISentEmail>({
  user_id: { type: String, required: true },
  from: { type: String, required: true },
  to: { type: String, required: true },
  subject: { type: String, required: true },
  text: { type: String },
  html: { type: String },
  sent_at: { type: String, default: () => new Date().toISOString() },
})

const SentEmail = model<ISentEmail>('SentEmail', sentEmailSchema)
export default SentEmail
