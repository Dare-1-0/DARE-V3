/**
 * Fixed and cleaned up index.js
 *
 * Notes:
 * - Consolidated duplicated/fragmented code blocks into a single async initializer (DareInd).
 * - Defined missing variables with safe defaults when appropriate (sessionName).
 * - Removed truncated/invalid lines and replaced with robust, minimal implementations.
 * - Guarded uses of optional globals / files so the script won't crash when some JSON files are missing.
 * - Kept the general structure and helper methods (sendImage, sendFile, sendSticker, etc.)
 *
 * You should still validate configuration files (./settings.js, ./module.js, ./database/*) and
 * adjust globals (like global.owner, global.packname, ownernumber, websitex) for your environment.
 */

import './settings.js';
import { modul } from './module.js';
import moment from 'moment-timezone';
import DareConnect, {
  BufferJSON,
  DisconnectReason,
  useMultiFileAuthState,
  delay,
  fetchLatestBaileysVersion,
  generateForwardMessageContent,
  prepareWAMessageMedia,
  generateWAMessageFromContent,
  generateMessageID,
  downloadContentFromMessage,
  jidDecode,
  makeCacheableSignalKeyStore,
  getAggregateVotesInPollMessage,
  proto
} from '@whiskeysockets/baileys';
import cfonts from 'cfonts';
import { color, bgcolor } from './lib/color.js';
import { TelegraPh } from './lib/uploader.js';
import NodeCache from 'node-cache';
import { parsePhoneNumber } from 'libphonenumber-js';
import fs from 'fs';
import path from 'path';
import Pino from 'pino';
import readline from 'readline';
import colors from 'colors';
import { start } from './lib/spinner.js';
import { uncache, nocache } from './lib/loader.js';
import { imageToWebp, videoToWebp, writeExifImg, writeExifVid } from './lib/exif.js';
import { smsg, isUrl, generateMessageTag, getBuffer, getSizeMedia, fetchJson, sleep, reSize } from './lib/myfunc.js';

const {
  boom,
  chalk,
  FileType,
  PhoneNumber,
  axios,
  _,
  pino: pinoMod
} = modul || {};

// Safe helpers to read JSON files (return defaults if file missing)
const safeReadJSON = (p, def) => {
  try {
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8')) || def;
    return def;
  } catch (e) {
    console.error(`Error reading ${p}:`, e.message);
    return def;
  }
};

let _welcome = safeReadJSON('./database/welcome.json', []);
let _left = safeReadJSON('./database/left.json', []);

const prefix = '.';
let phoneNumber = ""; 

// accept --phone=... CLI arg
const phoneArg = process.argv.find(a => a.startsWith('--phone='));
if (phoneArg) phoneNumber = (phoneArg.split('=')[1] || '').replace(/[^0-9]/g, '');

// Load or initialize global db safely
global.db = safeReadJSON('./database/database.json', {});
if (!global.db || typeof global.db !== 'object') global.db = {};
global.db = {
  sticker: {},
  database: {},
  game: {},
  others: {},
  users: {},
  chats: {},
  settings: {},
  ...(global.db || {})
};

const pairingCode = !!phoneNumber || process.argv.includes("--pairing-code");
const useMobile = process.argv.includes("--mobile");
const owner = safeReadJSON('./database/owner.json', {});

// sessionName: either set in settings.js as global.sessionName or fallback
const sessionName = (global && global.sessionName) ? global.sessionName : 'session';

// store and readline
const store = null; // makeInMemoryStore({ logger: Pino().child({ level: 'silent', stream: 'store' }) });
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

// Watch Case.js for changes (if loader exists)
// try {
//   import('./Case.js');
//   nocache('./Case.js', module => console.log(color('[ CHANGE ]', 'green'), color(`'${module}'`, 'green'), 'Updated'));
// } catch (e) {
//   // ignore if Case.js not present or dynamic import fails during static analysis
// }

/**
 * Main initializer that creates the connection (Dare) and wires event handlers & helpers.
 */
async function DareInd() {
  // Auth state
  const { saveCreds, state } = await useMultiFileAuthState(`./${sessionName}`);
  const msgRetryCounterCache = new NodeCache();

  // Build the connection
  const Dare = DareConnect({
    logger: Pino({ level: 'silent' }),
    printQRInTerminal: !pairingCode,
    mobile: useMobile,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, Pino({ level: "fatal" }).child({ level: "fatal" })),
    },
    browser: ["Ubuntu", "Chrome", "20.0.04"],
    patchMessageBeforeSending: (message) => {
      const requiresPatch = !!(
        message?.buttonsMessage ||
        message?.templateMessage ||
        message?.listMessage
      );
      if (requiresPatch) {
        message = {
          viewOnceMessage: {
            message: {
              messageContextInfo: {
                deviceListMetadataVersion: 2,
                deviceListMetadata: {},
              },
              ...message,
            },
          },
        };
      }
      return message;
    },
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 0,
    keepAliveIntervalMs: 10000,
    emitOwnEvents: true,
    fireInitQueries: true,
    generateHighQualityLinkPreview: true,
    syncFullHistory: true,
    markOnlineOnConnect: true,
    getMessage: async (key) => {
      if (store) {
        const msg = await store.loadMessage(key.remoteJid, key.id);
        return msg?.message || undefined;
      }
      return { conversation: "WhatsApp Bot by KELVIN" };
    },
    msgRetryCounterCache,
  });

  // Bind event emitter store
  if (store) store.bind(Dare.ev);

  // Small banner (keeps previous style)
  try {
    console.log(chalk.white.bold(`⠀⠀⠀⠀⠀⠀⠀⠀⢀⠔⢉⠄⠚⢉⡀⢀⣀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⢸⠀⢺⡤⠔⣵⣿⣿⣷⣿⣷⣢⣄⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⢠⠓⡢⠝⠚⠉⠉⠉⠙⠛⠿⣿⣿⡗⢄⡀⠀⠀⠀⡀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠜⣈⡠⠒��⠁⠀⠀⠀⢀⠄⠈⠻⣿⡄⠳⡄⠀⠀⡷⡀
⠀⠀⠀⠀⠀⠀⠀⣜⢰⢡⠤⣀⠈⢴⢀⣄⠔⠃⠊⢆⠀⠈⢿⣄⣿⣄⣠⡧⣿
⠀⠀⠀⠀⠀⠀⠀⠀⢀⠤⡄⢻⠃⠀⠀⠈⠁⠀⠀⠀⢠⠤⢤⡀⠱⠇⣼⣿⣿⣿⡽⣧⡎
⠀⠀⠀⠀⠀⠀⠀⠀⡨⢚⣒⡇⠀⠀⠀⠸⠀⠈⠑⡀⠀⠀⠀⢉⠜⣠⣿⣿⣿⡿⣵⡿⢳
⠀⠀⢀⡀⢼⡁⢐⡱⡀⠀⠀⠘⡀⠀⠐⠁⠀⠀⣀⣲⣺⣿⣿⣿⣿⣿⠿⠛⠁
⠀⠀⠸⢤⡖⣵⠋⠀⢸⣧⣀⡀⠀⠀⠀⠀⠀⢠⡗⣦⣾⢿⣯⣻⣿⠇⠀⠀⠀
⠀⠀⠀⠘⠧⡈⡲⢤⣯⣿⡇⢉⣱⣖⣶⣺⣿⠶⢉⣏⢰⣶⣿⣿⠏⠀⠀⠀⠀
⠀⠀⠀⡠⢖⣋⡝⠻⣦⣌⣿⣶⣿⣽⣿⣿⣿⡿⡟⠙⣆⡸⠋⢀⢪⢂⠀⠀⠀
⠀⠀⣀⡸⢇⠠⡌⠒⡌⠻⣍⠙⢻⣿⣿⣿⣿⣿⣿⡟⣷⣖⣑⣏⡩⠌⠀⠀⠀
⠰⡉⠀⠀⠈⢢⡁⠀⠣⠄⣈⠳⠾⣶⢻⣼⣉⣿⡟⠋⠏⢲⠀⠀⠀⠀⠀⠀⠀
⠀⠑⠤⠄⠒⠣⠓⠤⣴⠆⠈⠄⠀⠙⠲⠦⠼⡿⡳⠤⡤⣞⠀⠐⠦⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠁⠒⢂⠈⢉⠉⢥⠒⢠⠇⠀⢀⣇⣈⣦⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢱⡤⠒⠊⠹⠃⠀⠀⠀⠈⠻⠁⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡇⠀⠀⡇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠘⠂⠐⠊⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀

${chalk.green.bold("📃  Information :")}         
✈ BOT BY DARE TECH, Note : Do Not Misuse This Bot 
✈ DARE-V4 CREDIT BMB : 2348089405509

${chalk.green.bold("𝙿𝚘𝚠𝚎𝚛𝚎𝚍 𝚋𝚢 𝙺𝙴𝙻𝚅𝙸𝙽")}
`));
  } catch (e) {
    // ignore banner errors
  }

  // Pairing code flow (if requested)
  if (pairingCode) {
    if (useMobile) throw new Error('Cannot use pairing code with mobile api');

    try {
      // Always prompt for phone number when pairing. If a --phone value was provided, show it as the default.
      const defaultPN = (phoneNumber || '').replace(/[^0-9]/g, '');
      const promptText = defaultPN
        ? chalk.bgBlack(chalk.greenBright(`ENTER YOUR PHONE NUMBER\nE.G: 2348077115562 : `)) + chalk.white(` (Press Enter to use ${defaultPN}) `)
        : chalk.bgBlack(chalk.greenBright(`ENTER YOUR PHONE NUMBER\nE.G: 2348077115562 : `));

      let pnInput = await question(promptText);
      pnInput = (pnInput || '').replace(/[^0-9]/g, '');
      const pn = pnInput || defaultPN;

      // close readline once we've collected input
      try { rl.close(); } catch (e) {}

      if (!pn) {
        console.error('No phone number provided. Aborting pairing code request.');
        return;
      }

      setTimeout(async () => {
        try {
          console.log('Requesting pairing code for:', pn);
          console.log('requestPairingCode available?', typeof Dare.requestPairingCode);
          if (typeof Dare.requestPairingCode === 'function') {
            try {
              let code = await Dare.requestPairingCode(pn);
              code = code?.match(/.{1,4}/g)?.join("-") || code;
              console.log(chalk.black(chalk.bgGreen(`PAIRING CODE = `)), chalk.black(chalk.white(code)));
            } catch (e) {
              console.error('Error while calling requestPairingCode:', e?.message || e);
            }
          } else {
            console.warn('requestPairingCode() not available on this Baileys build. Falling back to QR output from connection.update.');
            // print the QR when it arrives so you can scan with the phone
            Dare.ev.on('connection.update', up => {
              if (up.qr) {
                console.log('----- SCAN THIS QR (BASE64 STRING) -----');
                console.log(up.qr);
                console.log('----------------------------------------');
              }
            });
          }
        } catch (e) {
          console.error('Error requesting pairing code:', e?.message || e);
        }
      }, 3000);
    } catch (e) {
      console.error('Pairing code flow error:', e);
    }
  }

  // Event: connection.update
  Dare.ev.on('connection.update', async (update) => {
    try {
      const { connection, lastDisconnect } = update;
      if (connection === 'close') {
        const reason = new boom.Boom(lastDisconnect?.error)?.output?.statusCode;
        if (reason === DisconnectReason.badSession) {
          console.log(`Bad Session File, Please Delete Session and Scan Again`);
          await DareInd();
        } else if (reason === DisconnectReason.connectionClosed) {
          console.log("Connection closed, reconnecting....");
          await DareInd();
        } else if (reason === DisconnectReason.connectionLost) {
          console.log("Connection Lost from Server, reconnecting...");
          await DareInd();
        } else if (reason === DisconnectReason.connectionReplaced) {
          console.log("Connection Replaced, Another New Session Opened, Please Close Current Session First");
          await DareInd();
        } else if (reason === DisconnectReason.loggedOut) {
          console.log(`Device Logged Out, Please Scan Again And Run.`);
          await DareInd();
        } else if (reason === DisconnectReason.restartRequired) {
          console.log("Restart Required, Restarting...");
          await DareInd();
        } else if (reason === DisconnectReason.timedOut) {
          console.log("Connection TimedOut, Reconnecting...");
          await DareInd();
        } else {
          console.log(`Unknown Disconnect Reason: ${reason} | ${connection}`);
          Dare.end?.();
        }
      }
      if (update?.connection == "connecting" || update?.receivedPendingNotifications == "false") {
        console.log(color(`\nDARE-CONNECTING...`, 'yellow'));
      }
      if (update?.connection == "open" || update?.receivedPendingNotifications == "true") {
        await delay(1999);
        try {
          cfonts.say('DARE', {
            font: 'block',
            align: 'center',
            colors: ['red', 'blue'],
            background: 'transparent',
            rawMode: false,
          });
        } catch (e) { /* ignore cfonts errors */ }
        await sleep(30000).catch(() => {});
        // notify owner if available
        try {
          if (owner && owner.number) {
            await Dare.sendMessage(`${owner.number}@s.whatsapp.net`, { text: `*•𝐁𝐎𝐓 𝐈𝐒 𝐂𝐎𝐍𝐍𝐄𝐂𝐓𝐄𝐃 ✅ *` });
          }
        } catch (e) {
          // best-effort notification
        }
      }
    } catch (err) {
      console.log('Error in connection.update:', err);
    }
  });

  // save credentials on creds.update
  Dare.ev.on('creds.update', saveCreds);

  // Anti-call handler (best effort)
  Dare.ev.on('call', async (callEvents) => {
    try {
      let botNumber = await Dare.decodeJid(Dare.user?.id || '');
      let anticallSetting = (db?.settings && db.settings[botNumber]) ? db.settings[botNumber].anticall : false;
      if (!anticallSetting) return;
      for (let ev of callEvents) {
        if (ev.isGroup === false && ev.status === 'offer') {
          const from = ev.from;
          // notify and block
          await Dare.sendMessage(from, { text: `${Dare.user?.name || 'Bot'} cannot receive ${ev.isVideo ? 'video' : 'voice'} calls.` });
          await sleep(8000);
          await Dare.updateBlockStatus(from, "block");
        }
      }
    } catch (e) {
      console.error('Error in call event handler:', e);
    }
  });

  // messages.upsert
  Dare.ev.on('messages.upsert', async (chatUpdate) => {
    try {
      const kay = chatUpdate.messages && chatUpdate.messages[0];
      if (!kay || !kay.message) return;
      // unwrap ephemeral
      kay.message = (Object.keys(kay.message)[0] === 'ephemeralMessage') ? kay.message.ephemeralMessage.message : kay.message;
      if (kay.key && kay.key.remoteJid === 'status@broadcast') {
        await Dare.readMessages?.([kay.key]).catch(() => {});
      }
      if (!Dare.public && !kay.key.fromMe && chatUpdate.type === 'notify') return;
      if (kay.key.id?.startsWith('BAE5') && kay.key.id.length === 16) return;
      const m = smsg(Dare, kay, store);
      // dynamic import handler from ./Case.js
      try {
        const handler = (await import('./Case.js')).default || (await import('./Case.js'));
        if (typeof handler === 'function') handler(Dare, m, chatUpdate, store);
      } catch (e) {
        // fallback to require if dynamic import not supported
        try {
          const handler = require('./Case');
          if (typeof handler === 'function') handler(Dare, m, chatUpdate, store);
        } catch (err) {
          // file not found or handler error
        }
      }
    } catch (err) {
      console.error('messages.upsert error:', err);
    }
  });

  // group participants update -> welcome/left
  try {
    Dare.ev.on('group-participants.update', async (anu) => {
      try {
        const { welcome } = require('./lib/welcome');
        const iswel = _welcome.includes(anu.id);
        const isLeft = _left.includes(anu.id);
        welcome(iswel, isLeft, Dare, anu);
      } catch (e) {
        // ignore if welcome lib unavailable
      }
    });
  } catch (e) { /* ignore */ }

  // messages.update -> poll handling
  async function getMessage(key) {
    if (store) {
      const msg = await store.loadMessage(key.remoteJid, key.id);
      return msg?.message;
    }
    return { conversation: "DARE V4 IS HERE" };
  }
  Dare.ev.on('messages.update', async (chatUpdate) => {
    try {
      for (const { key, update } of chatUpdate) {
        if (update?.pollUpdates && key.fromMe) {
          const pollCreation = await getMessage(key);
          if (pollCreation) {
            const pollUpdate = await getAggregateVotesInPollMessage({
              message: pollCreation,
              pollUpdates: update.pollUpdates,
            });
            const toCmd = pollUpdate.filter(v => v.voters?.length !== 0)[0]?.name;
            if (!toCmd) return;
            const prefCmd = prefix + toCmd;
            // appenTextMessage is not a standard function; try send a message containing prefCmd to the chat
            try {
              await Dare.sendMessage(key.remoteJid, { text: prefCmd });
            } catch (e) { /* ignore */ }
          }
        }
      }
    } catch (e) {
      console.error('messages.update error:', e);
    }
  });

  // contacts.update mapping for store
  Dare.ev.on('contacts.update', update => {
    for (let contact of update) {
      let id = Dare.decodeJid(contact.id);
      if (store && store.contacts) store.contacts[id] = { id, name: contact.notify };
    }
  });

  // Convenience helpers / method extensions on Dare
  Dare.decodeJid = (jid) => {
    if (!jid) return jid;
    if (/:\d+@/gi.test(jid)) {
      let decode = jidDecode(jid) || {};
      return (decode.user && decode.server && decode.user + '@' + decode.server) || jid;
    } else return jid;
  };

  Dare.getName = async (jid, withoutContact = false) => {
    const id = Dare.decodeJid(jid);
    withoutContact = Dare.withoutContact || withoutContact;
    let v;
    if (id.endsWith("@g.us")) {
      v = store.contacts[id] || {};
      if (!(v.name || v.subject)) {
        try {
          v = (await Dare.groupMetadata(id)) || {};
        } catch (e) { v = v || {}; }
      }
      return v.name || v.subject || '';
    } else {
      v = id === '0@s.whatsapp.net' ? { id, name: 'WhatsApp' } : id === Dare.decodeJid(Dare.user?.id || '') ? Dare.user : (store.contacts[id] || {});
      try {
        return (withoutContact ? '' : v.name) || v.subject || v.verifiedName || (PhoneNumber ? PhoneNumber('+' + jid.replace('@s.whatsapp.net', '')).getNumber('international') : jid);
      } catch (e) {
        return (withoutContact ? '' : v.name) || v.subject || v.verifiedName || jid;
      }
    }
  };

  Dare.parseMention = (text = '') => {
    return [...text.matchAll(/@(\d{5,16}|0)/g)].map(v => v[1] + '@s.whatsapp.net');
  };

  Dare.sendContact = async (jid, kon, quoted = '', opts = {}) => {
    try {
      const list = [];
      for (let i of kon) {
        const name = await Dare.getName(i).catch(() => i);
        list.push({
          displayName: name,
          vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${name}\nFN:${name}\nTEL;waid=${i}:${i}\nEND:VCARD`
        });
      }
      return await Dare.sendMessage(jid, { contacts: { displayName: `${list.length} Contact`, contacts: list }, ...opts }, { quoted });
    } catch (e) {
      console.error('sendContact error:', e);
    }
  };

  Dare.setStatus = (status) => {
    try {
      Dare.query({
        tag: 'iq',
        attrs: {
          to: '@s.whatsapp.net',
          type: 'set',
          xmlns: 'status',
        },
        content: [{
          tag: 'status',
          attrs: {},
          content: Buffer.from(status, 'utf-8')
        }]
      });
    } catch (e) { /* ignore */ }
    return status;
  };

  // Basic send helpers using getBuffer / getSizeMedia from lib/myfunc.js
  Dare.sendText = (jid, text, quoted = '', options) => Dare.sendMessage(jid, { text: text, ...options }, { quoted });

  Dare.sendImage = async (jid, path, caption = '', quoted = '', options = {}) => {
    let buffer = Buffer.isBuffer(path) ? path
      : /^data:.*?\/. *?;base64,/i.test(path) ? Buffer.from(path.split`, `[1], 'base64')
      : /^https?:\/\//.test(path) ? await getBuffer(path)
      : fs.existsSync(path) ? fs.readFileSync(path) : null;
    if (!buffer) throw new Error('Invalid image');
    return await Dare.sendMessage(jid, { image: buffer, caption: caption, ...options }, { quoted });
  };

  Dare.sendImageAsSticker = async (jid, path, quoted, options = {}) => {
    let buff = Buffer.isBuffer(path) ? path
      : /^data:.*?\/. *?;base64,/i.test(path) ? Buffer.from(path.split`, `[1], 'base64')
      : /^https?:\/\//.test(path) ? await getBuffer(path)
      : fs.existsSync(path) ? fs.readFileSync(path) : null;
    if (!buff) throw new Error('Invalid image');
    let buffer = options && (options.packname || options.author) ? await writeExifImg(buff, options) : await imageToWebp(buff);
    const res = await Dare.sendMessage(jid, { sticker: { url: buffer }, ...options }, { quoted });
    try { fs.unlinkSync(buffer); } catch (e) {}
    return res;
  };

  Dare.sendVideoAsSticker = async (jid, path, quoted, options = {}) => {
    let buff = Buffer.isBuffer(path) ? path
      : /^data:.*?\/. *?;base64,/i.test(path) ? Buffer.from(path.split`, `[1], 'base64')
      : /^https?:\/\//.test(path) ? await getBuffer(path)
      : fs.existsSync(path) ? fs.readFileSync(path) : null;
    if (!buff) throw new Error('Invalid video');
    let buffer = options && (options.packname || options.author) ? await writeExifVid(buff, options) : await videoToWebp(buff);
    await Dare.sendMessage(jid, { sticker: { url: buffer }, ...options }, { quoted });
    return buffer;
  };

  Dare.copyNForward = async (jid, message, forceForward = false, options = {}) => {
    try {
      if (options.readViewOnce) {
        message.message = message.message && message.message.ephemeralMessage && message.message.ephemeralMessage.message ? message.message.ephemeralMessage.message : (message.message || undefine[...
