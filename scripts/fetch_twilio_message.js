require('dotenv').config({ path: __dirname + '/../.env' });
const twilio = require('twilio');

async function main() {
  const sid = process.argv[2];
  if (!sid) {
    console.error('Usage: node fetch_twilio_message.js <MessageSid>');
    process.exit(1);
  }
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    console.error('Missing Twilio credentials');
    process.exit(1);
  }
  const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  const msg = await client.messages(sid).fetch();
  console.log({ sid: msg.sid, direction: msg.direction, to: msg.to, from: msg.from, body: msg.body });
}

main().catch((e) => { console.error(e); process.exit(1); });

