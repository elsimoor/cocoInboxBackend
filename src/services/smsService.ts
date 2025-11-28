import { connectToDatabase } from '../db';
import TempPhoneNumber from '../models/TempPhoneNumber';
import SmsMessage from '../models/SmsMessage';

type TwilioClient = ReturnType<typeof require>;

export class SmsService {
  private twilio: any | null = null;
  private accountSid?: string;
  private authToken?: string;
  private apiKeySid?: string;
  private apiKeySecret?: string;

  constructor() {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID;
    this.authToken = process.env.TWILIO_AUTH_TOKEN;
    this.apiKeySid = process.env.TWILIO_API_KEY_SID || process.env.TWILIO_API_KEY;
    this.apiKeySecret = process.env.TWILIO_API_KEY_SECRET || process.env.TWILIO_API_SECRET;

    try {
      // dynamic require to avoid crashing if module missing
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const twilio = require('twilio');
      if (this.accountSid && this.authToken) {
        // Prefer classic Account SID + Auth Token when both are set
        this.twilio = twilio(this.accountSid, this.authToken);
      } else if (this.apiKeySid && this.apiKeySecret) {
        // API Key auth requires explicit accountSid option
        if (!this.accountSid || !this.accountSid.startsWith('AC')) {
          throw new Error('When using TWILIO_API_KEY_SID/TWILIO_API_KEY_SECRET you must also set TWILIO_ACCOUNT_SID (starts with AC...)');
        }
        this.twilio = twilio(this.apiKeySid, this.apiKeySecret, { accountSid: this.accountSid });
      } else if (this.accountSid && this.accountSid.startsWith('SK')) {
        // Misconfigured: user put API key SID into TWILIO_ACCOUNT_SID. Try to rescue if secret is provided.
        if (this.authToken) {
          if (!process.env.TWILIO_REAL_ACCOUNT_SID && (!process.env.TWILIO_ACCOUNT_SID_FOR_API_KEY || !String(process.env.TWILIO_ACCOUNT_SID_FOR_API_KEY).startsWith('AC'))) {
            throw new Error('TWILIO_ACCOUNT_SID is an API Key SID (SK...). Provide TWILIO_API_KEY_SID/TWILIO_API_KEY_SECRET and set TWILIO_ACCOUNT_SID to your Account SID (AC...).');
          }
        }
      }
    } catch (e) {
      console.error('Failed to init Twilio client:', e);
      this.twilio = null;
    }
  }

  private async ensureWebhook(phoneNumber: string) {
    if (!this.twilio) return;
    const smsUrl = process.env.TWILIO_SMS_WEBHOOK_URL;
    if (!smsUrl) return;
    try {
      const list = await this.twilio.incomingPhoneNumbers.list({ limit: 100 });
      const match = list.find((n: any) => n.phoneNumber === phoneNumber);
      if (match && match.smsUrl !== smsUrl) {
        await this.twilio.incomingPhoneNumbers(match.sid).update({ smsUrl });
      }
    } catch (e) {
      console.warn('ensureWebhook failed for', phoneNumber, e);
    }
  }

  isConfigured(): boolean {
    const hasClassic = !!(this.accountSid && this.authToken);
    const hasApiKey = !!(this.accountSid && this.apiKeySid && this.apiKeySecret);
    return !!(this.twilio && (hasClassic || hasApiKey));
  }

  async listUserNumbers(userId: string) {
    await connectToDatabase();
    const docs = await TempPhoneNumber.find({ user_id: userId, is_active: true }).sort({ assigned_at: -1 }).lean();
    return docs.map((d: any) => ({ id: d._id.toString(), ...d }));
  }

  async assignNumber(userId: string, expiresInMinutes?: number, country?: string): Promise<any | null> {
    await connectToDatabase();
    const now = new Date();
    const exp = expiresInMinutes ? new Date(now.getTime() + expiresInMinutes * 60 * 1000) : undefined;

    // Strategy:
    // 1. If TWILIO_PREALLOCATED_NUMBERS provided -> allocate first unused
    const pre = (process.env.TWILIO_PREALLOCATED_NUMBERS || '')
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean);
    if (pre.length > 0) {
      const used = await TempPhoneNumber.find({ phone_number: { $in: pre }, is_active: true }).lean();
      const usedSet = new Set<string>(used.map((u: any) => u.phone_number));
      const available = pre.find((n) => !usedSet.has(n));
      if (!available) {
        // If user already has an active number, return it instead of failing
        const existingForUser = await TempPhoneNumber.findOne({ user_id: userId, is_active: true })
          .sort({ assigned_at: -1 })
          .lean();
        if (existingForUser) return { id: (existingForUser as any)._id.toString(), ...existingForUser };
        return null;
      }
      const updated = await TempPhoneNumber.findOneAndUpdate(
        { phone_number: available },
        {
          $set: {
            user_id: userId,
            provider: 'twilio',
            expires_at: exp,
            is_active: true,
            country,
            assigned_at: new Date().toISOString(),
          },
        },
        { new: true, upsert: true }
      );
      const obj: any = updated!.toObject();
      await this.ensureWebhook(available);
      return { id: obj._id.toString(), ...obj };
    }

    // 2. If Twilio configured, try to reuse an owned number that isn't in use.
    if (this.twilio) {
      try {
        const incoming = await this.twilio.incomingPhoneNumbers.list({ limit: 20 });
        const numbers = incoming.map((n: any) => n.phoneNumber);
        const used = await TempPhoneNumber.find({ phone_number: { $in: numbers }, is_active: true }).lean();
        const usedSet = new Set<string>(used.map((u: any) => u.phone_number));
        const available = numbers.find((n: string) => !usedSet.has(n));
        if (available) {
          const updated = await TempPhoneNumber.findOneAndUpdate(
            { phone_number: available },
            {
              $set: {
                user_id: userId,
                provider: 'twilio',
                expires_at: exp,
                is_active: true,
                country,
                assigned_at: new Date().toISOString(),
              },
            },
            { new: true, upsert: true }
          );
          const obj: any = updated!.toObject();
          await this.ensureWebhook(available);
          return { id: obj._id.toString(), ...obj };
        }
        // 3. If allowed, auto-buy a number
        if (process.env.TWILIO_AUTOBUY === 'true') {
          const searchCountry = country || process.env.TWILIO_COUNTRY || 'US';
          const available = await this.twilio.availablePhoneNumbers(searchCountry).local.list({
            smsEnabled: true,
            limit: 1,
          });
          if (available && available.length > 0) {
            const areaCode = process.env.TWILIO_AREA_CODE ? Number(process.env.TWILIO_AREA_CODE) : undefined;
            const purchase = await this.twilio.incomingPhoneNumbers.create({
              phoneNumber: available[0].phoneNumber,
              smsUrl: process.env.TWILIO_SMS_WEBHOOK_URL || undefined,
              areaCode,
            });
            const updated = await TempPhoneNumber.findOneAndUpdate(
              { phone_number: purchase.phoneNumber },
              {
                $set: {
                  user_id: userId,
                  provider: 'twilio',
                  expires_at: exp,
                  is_active: true,
                  country: searchCountry,
                  assigned_at: new Date().toISOString(),
                },
              },
              { new: true, upsert: true }
            );
            const obj: any = updated!.toObject();
            await this.ensureWebhook(purchase.phoneNumber);
            return { id: obj._id.toString(), ...obj };
          }
        }
      } catch (e: any) {
        // 20008 indicates test credentials where many resources are not accessible
        if (e && (e.code === 20008 || e.status === 403)) {
          const err: any = new Error('Twilio test credentials cannot list or buy numbers');
          err.reason = 'TWILIO_TEST';
          throw err;
        }
        console.error('Twilio number allocation failed:', e);
      }
    }
    // Final fallback: return user's active number if any
    const existingForUser = await TempPhoneNumber.findOne({ user_id: userId, is_active: true })
      .sort({ assigned_at: -1 })
      .lean();
    if (existingForUser) return { id: (existingForUser as any)._id.toString(), ...existingForUser };
    return null;
  }

  async releaseNumber(numberId: string, userId: string): Promise<boolean> {
    await connectToDatabase();
    const updated = await TempPhoneNumber.updateOne({ _id: numberId, user_id: userId }, { $set: { is_active: false } });
    // Optional: also release from Twilio if TWILIO_RELEASE_ON_DELETE === 'true'
    // Not implemented to avoid accidental charges.
    return updated.modifiedCount > 0;
  }

  async listMessages(userId: string, phoneNumber?: string) {
    await connectToDatabase();
    let filter: any = {};
    if (phoneNumber) {
      // ensure number belongs to user
      const owned = await TempPhoneNumber.findOne({ user_id: userId, phone_number: phoneNumber, is_active: true }).lean();
      if (!owned) return [];
      filter.to = phoneNumber;
    } else {
      const owned = await TempPhoneNumber.find({ user_id: userId, is_active: true }).lean();
      const numbers = owned.map((o: any) => o.phone_number);
      if (numbers.length === 0) return [];
      filter.to = { $in: numbers };
    }
    let msgs = await SmsMessage.find(filter).sort({ received_at: -1 }).limit(200).lean();

    // Optional fallback: fetch recent inbound via Twilio REST API.
    // Many Twilio accounts have Message Body Redaction enabled which returns
    // obfuscated bodies (e.g. "Your.*?verification PIN is**"). In those cases
    // the webhook is the only way to capture the real message text. To avoid
    // showing redacted content, this fallback is disabled by default and can
    // be enabled by setting TWILIO_ENABLE_REST_FALLBACK=true.
    const enableRestFallback = String(process.env.TWILIO_ENABLE_REST_FALLBACK || 'false').toLowerCase() === 'true';
    if ((!msgs || msgs.length === 0) && this.twilio && enableRestFallback) {
      try {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000); // last 24 hours
        const numbersToFetch: string[] = phoneNumber
          ? [phoneNumber]
          : (await TempPhoneNumber.find({ user_id: userId, is_active: true }).lean()).map((n: any) => n.phone_number);
        let fetched: any[] = [];
        for (const to of numbersToFetch) {
          const list = await this.twilio.messages.list({ to, dateSentAfter: since, limit: 50 });
          fetched = fetched.concat(list);
        }
        const inbound = fetched.filter((m: any) => String(m.direction).toLowerCase().includes('inbound'));
        // Persist into DB (best effort, avoid dupes by message_sid)
        for (const m of inbound) {
          const exists = await SmsMessage.findOne({ message_sid: m.sid }).lean();
          if (!exists) {
            await SmsMessage.create({
              to: m.to,
              from: m.from,
              body: m.body,
              message_sid: m.sid,
              received_at: m.dateCreated ? new Date(m.dateCreated).toISOString() : new Date().toISOString(),
              expires_at: new Date(Date.now() + Number(process.env.SMS_TTL_MINUTES || '1440') * 60 * 1000),
            });
          }
        }
        msgs = await SmsMessage.find(filter).sort({ received_at: -1 }).limit(200).lean();
      } catch (e) {
        console.error('Twilio REST fallback failed:', e);
      }
    }

    return (msgs || []).map((m: any) => ({ id: m._id.toString(), ...m }));
  }

  async handleTwilioWebhook(req: any): Promise<void> {
    // Expect fields: From, To, Body, MessageSid
    await connectToDatabase();
    const { From, To, Body, MessageSid } = req.body || {};
    if (!From || !To || !Body) return;
    // resolve user via TempPhoneNumber
    const owner = await TempPhoneNumber.findOne({ phone_number: To, is_active: true }).lean();
    const ttlMinutes = Number(process.env.SMS_TTL_MINUTES || '1440'); // 24h default
    const exp = new Date(Date.now() + ttlMinutes * 60 * 1000);
    await SmsMessage.create({
      to: To,
      from: From,
      body: String(Body),
      message_sid: MessageSid,
      user_id: owner ? (owner as any).user_id : undefined,
      expires_at: exp,
    });
  }
}
