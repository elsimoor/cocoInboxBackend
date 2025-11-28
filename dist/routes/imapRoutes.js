"use strict";
// import { Router } from 'express';
// // Use require for imap-simple to avoid potential TypeScript type issues. The
// // package provides a promise‑based API similar to the example in Hi.zip.
// const imaps = require('imap-simple');
// import { simpleParser } from 'mailparser';
Object.defineProperty(exports, "__esModule", { value: true });
// // Define the router. This route exposes a single GET endpoint `/get-all` that
// // fetches all messages from the IMAP server defined in environment variables.
// // It mirrors the behaviour of the standalone Express server in Hi.zip. No
// // authentication is required for this endpoint because it connects to a
// // specific mailbox configured via MAIL_USER and related environment vars.
// const router = Router();
// router.get('/get-all', async (_req, res) => {
//   const user = process.env.MAIL_USER;
//   const pass = process.env.MAIL_PASS;
//   const host = process.env.MAIL_HOST;
//   const port = process.env.MAIL_PORT;
//   const tlsEnv = process.env.MAIL_TLS;
//   // Basic validation: ensure credentials are present
//   if (!user || !pass || !host || !port) {
//     return res.status(500).json({ ok: false, error: 'IMAP environment variables not set' });
//   }
//   const imapConfig = {
//     imap: {
//       user,
//       password: pass,
//       host,
//       port: parseInt(port as string, 10),
//       tls: tlsEnv !== 'false',
//       authTimeout: 3000,
//     },
//   };
//   try {
//     const connection = await imaps.connect(imapConfig);
//     await connection.openBox('INBOX');
//     // Fetch all messages. Use similar search criteria and fetch options as Hi.zip.
//     const searchCriteria = ['ALL'];
//     const fetchOptions = {
//       // Request both the header fields and the full raw body. The BODY[]
//       // specifier returns the entire message, which allows simpleParser
//       // to extract both HTML and plain text as well as attachments. Using
//       // only 'TEXT' would omit HTML parts and inline attachments, causing
//       // incomplete rendering of rich emails such as Gmail drive chips.
//       bodies: [
//         'HEADER.FIELDS (FROM TO SUBJECT DATE)',
//         // Use BODY.PEEK[] to fetch the entire message without marking
//         // it as seen. Some servers reject BODY[]/RFC822 in UID FETCH
//         // commands, but BODY.PEEK[] is widely supported.
//         'TEXT',
//       ],
//       // bodies: ['HEADER.FIELDS (FROM TO SUBJECT DATE)', 'TEXT'],
//       struct: true,
//     };
//     const results = await connection.search(searchCriteria, fetchOptions);
//     const messages = await Promise.all(
//       results.map(async (item: any) => {
//         // Find the part containing the message body. We use the 'TEXT'
//         // body as before. If not present, fall back to an empty string.
//         // Find the full message body. When using 'BODY[]' in fetchOptions,
//         // the part with that identifier contains the entire raw RFC822 content.
//         const fullPart = item.parts.find((part: any) => part.which === 'TEXT') || { body: '' };
//         const parsed = await simpleParser(fullPart.body || '');
//         // Inline attachments referenced via CID identifiers need to be
//         // replaced with data URIs for proper rendering in the frontend. We
//         // iterate over each attachment, build a data URI and replace
//         // occurrences of `cid:<cid>` in the HTML with the data URI. This
//         // ensures inline images appear correctly when the HTML is rendered.
//         let html = parsed.html || '';
//         (parsed.attachments || []).forEach((att: any) => {
//           if (att.cid && att.content) {
//             const cidRegex = new RegExp(`cid:${att.cid}`, 'g');
//             const dataUri = `data:${att.contentType};base64,${att.content.toString('base64')}`;
//             html = html.replace(cidRegex, dataUri);
//           }
//         });
//         return {
//           // Unique identifier for the message from IMAP attributes
//           uid: item.attributes && item.attributes.uid,
//           seqNo: item.seqNo,
//           flags: item.attributes && item.attributes.flags,
//           modseq: item.attributes && (item.attributes.modseq || item.attributes['modseq']),
//           subject: parsed.subject || '',
//           from: parsed.from ? parsed.from.text : '',
//           // @ts-ignore
//           to: parsed.to ? parsed.to.text : '',
//           // Use the parsed date object directly; frontend can format it as needed
//           date: parsed.date,
//           text: parsed.text || '',
//           html,
//           attachments: (parsed.attachments || []).map((a: any) => ({
//             filename: a.filename,
//             size: a.size,
//             contentType: a.contentType,
//             cid: a.cid,
//             // Convert attachment content to base64 so clients can render or download it
//             content: a.content ? a.content.toString('base64') : undefined,
//           })),
//         };
//       })
//     );
//     await connection.end();
//     res.json({ ok: true, count: messages.length, messages });
//   } catch (err: any) {
//     console.error(err);
//     res.status(500).json({ ok: false, error: String(err) });
//   }
// });
// export default router;
// test1
const express_1 = require("express");
const imaps = require('imap-simple');
const mailparser_1 = require("mailparser");
const router = (0, express_1.Router)();
router.get('/get-all', async (_req, res) => {
    const user = process.env.MAIL_USER;
    const pass = process.env.MAIL_PASS;
    const host = process.env.MAIL_HOST;
    const port = process.env.MAIL_PORT;
    const tlsEnv = process.env.MAIL_TLS;
    if (!user || !pass || !host || !port) {
        return res.status(500).json({ ok: false, error: 'IMAP environment variables not set' });
    }
    const imapConfig = {
        imap: {
            user,
            password: pass,
            host,
            port: parseInt(port, 10),
            tls: tlsEnv !== 'false',
            authTimeout: 3000,
        },
    };
    try {
        const connection = await imaps.connect(imapConfig);
        await connection.openBox('INBOX');
        const searchCriteria = ['ALL'];
        const fetchOptions = {
            // Ask for headers, a decoded TEXT body, and also the *raw* message ('')
            // per imap-simple README. We also need struct to support the fallback path.
            bodies: ['HEADER.FIELDS (FROM TO SUBJECT DATE)', 'TEXT', ''],
            struct: true,
            markSeen: false,
        };
        const results = await connection.search(searchCriteria, fetchOptions);
        const messages = await Promise.all(results.map(async (item) => {
            // Try to get the *raw* message first (best fidelity)
            const rawPart = item.parts.find((p) => p.which === '');
            let parsed = null;
            if (rawPart?.body) {
                // Include a synthetic Imap-Id header (as shown in imap-simple docs)
                // so simpleParser has a stable identifier.
                const idHeader = `Imap-Id: ${item.attributes?.uid}\r\n`;
                parsed = await (0, mailparser_1.simpleParser)(idHeader + rawPart.body);
            }
            else {
                // Fallback: fetch parts individually (HTML, TEXT, attachments)
                const parts = imaps.getParts(item.attributes.struct); // flattens BODYSTRUCTURE
                let html = '';
                let text = '';
                const attachments = [];
                for (const part of parts) {
                    const type = `${(part.type || '').toLowerCase()}/${(part.subtype || '').toLowerCase()}`;
                    // Download and auto-decode the part
                    const data = await connection.getPartData(item, part);
                    // Body (no disposition) vs attachment (has disposition)
                    if (!part.disposition) {
                        if (type === 'text/html') {
                            html = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
                        }
                        else if (type === 'text/plain') {
                            text = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
                        }
                    }
                    else {
                        // Attachment
                        const filename = (part.disposition.params && part.disposition.params.filename) || 'attachment';
                        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
                        attachments.push({
                            filename,
                            size: part.size || buf.length,
                            contentType: type,
                            cid: part.id, // may be undefined
                            content: buf.toString('base64'),
                        });
                    }
                }
                // Build a minimal parsed-like object for downstream mapping
                const header = item.parts.find((p) => String(p.which).startsWith('HEADER'))?.body || {};
                parsed = {
                    subject: header.subject?.[0] || '',
                    from: { text: header.from?.[0] || '' },
                    to: { text: header.to?.[0] || '' },
                    date: item.attributes?.date,
                    html,
                    text,
                    attachments,
                };
            }
            // Replace cid: links with data: URIs so inline images display
            let htmlOut = parsed.html || '';
            (parsed.attachments || []).forEach((att) => {
                if (att.cid && att.content) {
                    const cidRegex = new RegExp(`cid:${att.cid}`, 'g');
                    const dataUri = `data:${att.contentType || 'application/octet-stream'};base64,${att.content}`;
                    htmlOut = htmlOut.replace(cidRegex, dataUri);
                }
            });
            return {
                uid: item.attributes?.uid,
                seqNo: item.seqNo,
                flags: item.attributes?.flags,
                modseq: item.attributes?.modseq || item.attributes?.['modseq'],
                subject: parsed.subject || '',
                from: parsed.from ? parsed.from.text : '',
                // @ts-ignore
                to: parsed.to ? parsed.to.text : '',
                date: parsed.date,
                text: parsed.text || '',
                html: htmlOut,
                attachments: (parsed.attachments || []).map((a) => ({
                    filename: a.filename,
                    size: a.size,
                    contentType: a.contentType,
                    cid: a.cid,
                    content: a.content, // base64
                })),
            };
        }));
        await connection.end();
        res.json({ ok: true, count: messages.length, messages });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: String(err) });
    }
});
exports.default = router;
