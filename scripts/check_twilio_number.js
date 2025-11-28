require('dotenv').config({ path: __dirname + '/../.env' });
const twilio = require('twilio');

async function main() {
  const number = process.argv[2];
  if (!number) {
    console.error('Usage: node check_twilio_number.js <E164Number>');
    process.exit(1);
  }
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env;
  const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  const list = await client.incomingPhoneNumbers.list({ limit: 100 });
  const match = list.find((n) => n.phoneNumber === number);
  if (!match) { console.log('Number not found'); return; }
  console.log({ sid: match.sid, phoneNumber: match.phoneNumber, smsUrl: match.smsUrl, smsMethod: match.smsMethod, friendlyName: match.friendlyName });
}

main().catch((e) => { console.error(e); process.exit(1); });

