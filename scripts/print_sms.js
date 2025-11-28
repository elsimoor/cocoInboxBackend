require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('No MONGO_URI');
    process.exit(1);
  }
  await mongoose.connect(uri);
  const smsSchema = new mongoose.Schema({ to: String, from: String, body: String, received_at: String }, { collection: 'smsmessages' });
  const Sms = mongoose.model('SmsMessage', smsSchema);
  const docs = await Sms.find({}).sort({ received_at: -1 }).limit(5).lean();
  console.log(JSON.stringify(docs, null, 2));
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });

