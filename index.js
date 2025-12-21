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
  PHONENUMBER_MCC,
  initInMemoryKeyStore,
  DisconnectReason,
  AnyMessageContent,
  makeInMemoryStore,
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
let phoneNumber = "T.me/The_Kelvin";

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
const store = makeInMemoryStore({ logger: Pino().child({ level: 'silent', stream: 'store' }) });
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

// Watch Case.js for changes (if loader exists)
try {
  import('./Case.js');
  nocache('./Case.js', module => console.log(color('[ CHANGE ]', 'green'), color(`'${module}'`, 'green'), 'Updated'));
} catch (e) {
  // ignore if Case.js not present or dynamic import fails during static analysis
}

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
  store.bind(Dare.ev);

  // Small banner (keeps previous style)
  try {
    console.log(chalk.white.bold(`⠀⠀⠀⠀⠀⠀⠀⠀⢀⠔⢉⠄⠚⢉⡀⢀⣀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⢸⠀⢺⡤⠔⣵⣿⣿⣷⣿⣷⣢⣄⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⢠⠓⡢⠝⠚⠉⠉⠉⠙⠛⠿⣿⣿⡗⢄⡀⠀⠀⠀⡀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠜⣈⡠⠒⢨⠁⠀⠀⠀⢀⠄⠈⠻⣿⡄⠳⡄⠀⠀⡷⡀
⠀⠀⠀⠀⠀⠀⠀⣜⢰⢡⠤⣀⠈⢴⢀⣄⠔⠃⠊⢆⠀⠈⢿⣄⣿⣄⣠⡧⣿
⠀⠀⠀⠀⢀⠤⡄⢻⠃⠀⠀⠈⠁⠀⠀⠀⢠⠤⢤⡀⠱⠇⣼⣿⣿⣿⡽⣧⡎
⠀⠀⠀⠀⡨⢚⣒⡇⠀⠀⠀⠸⠀⠈⠑⡀⠀⠀⠀⢉⠜⣠⣿⣿⣿⡿⣵⡿⢳
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

${chalk.green.bold("𝙿𝚘𝚠𝚎𝚛𝚎𝚍 𝚋𝚢 𝙺𝙴𝙻𝚅𝙸𝙽")}\n`));
  } catch (e) {
    // ignore banner errors
  }

  // Pairing code flow (if requested)
  if (pairingCode && !Dare?.authState?.creds?.registered) {
    if (useMobile) throw new Error('Cannot use pairing code with mobile api');

    try {
      let pn = phoneNumber;
      if (!!pn) {
        pn = pn.replace(/[^0-9]/g, '');

        if (!Object.keys(PHONENUMBER_MCC || {}).some(v => pn.startsWith(v))) {
          console.log(chalk.bgBlack(chalk.redBright("Start with country code of your WhatsApp Number, Example : 2348077115562")));
          process.exit(0);
        }
      } else {
        pn = await question(chalk.bgBlack(chalk.greenBright(`ENTER YOUR PHONE NUMBER\nE.G: 2348077115562 : `)));
        pn = pn.replace(/[^0-9]/g, '');
        if (!Object.keys(PHONENUMBER_MCC || {}).some(v => pn.startsWith(v))) {
          console.log(chalk.bgBlack(chalk.redBright("START WITH YOUR COUNTRY CODE, EXAMPLE: 2348089405509")));
          pn = await question(chalk.bgBlack(chalk.greenBright(`TYPE YOUR WHATSAPP NUMBER\nEXAMPLE: 2348077115562 : `)));
          pn = pn.replace(/[^0-9]/g, '');
        }
        rl.close();
      }

      setTimeout(async () => {
        try {
          let code = await Dare.requestPairingCode(pn);
          code = code?.match(/.{1,4}/g)?.join("-") || code;
          console.log(chalk.black(chalk.bgGreen(`PAIRING CODE = `)), chalk.black(chalk.white(code)));
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
    return [...text.matchAll(/@([0-9]{5,16}|0)/g)].map(v => v[1] + '@s.whatsapp.net');
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
      : /^data:.*?\/.*?;base64,/i.test(path) ? Buffer.from(path.split`,`[1], 'base64')
      : /^https?:\/\//.test(path) ? await getBuffer(path)
      : fs.existsSync(path) ? fs.readFileSync(path) : null;
    if (!buffer) throw new Error('Invalid image');
    return await Dare.sendMessage(jid, { image: buffer, caption: caption, ...options }, { quoted });
  };

  Dare.sendImageAsSticker = async (jid, path, quoted, options = {}) => {
    let buff = Buffer.isBuffer(path) ? path
      : /^data:.*?\/.*?;base64,/i.test(path) ? Buffer.from(path.split`,`[1], 'base64')
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
      : /^data:.*?\/.*?;base64,/i.test(path) ? Buffer.from(path.split`,`[1], 'base64')
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
        message.message = message.message && message.message.ephemeralMessage && message.message.ephemeralMessage.message ? message.message.ephemeralMessage.message : (message.message || undefined);
        const vtype = Object.keys(message.message.viewOnceMessage.message)[0];
        delete message.message.viewOnceMessage.message[vtype].viewOnce;
        message.message = { ...message.message.viewOnceMessage.message };
      }
      const mtype = Object.keys(message.message)[0];
      const content = await generateForwardMessageContent(message, forceForward);
      const ctype = Object.keys(content)[0];
      let context = {};
      if (mtype != "conversation") context = message.message[mtype].contextInfo || {};
      content[ctype].contextInfo = { ...context, ...content[ctype].contextInfo };
      const waMessage = await generateWAMessageFromContent(jid, content, options ? {
        ...content[ctype],
        ...options,
        ...(options.contextInfo ? { contextInfo: { ...content[ctype].contextInfo, ...options.contextInfo } } : {})
      } : {});
      await Dare.relayMessage(jid, waMessage.message, { messageId: waMessage.key.id });
      return waMessage;
    } catch (e) {
      console.error('copyNForward error:', e);
    }
  };

  Dare.downloadAndSaveMediaMessage = async (message, filename, attachExtension = true) => {
    let quoted = message.msg ? message.msg : message;
    let mime = (message.msg || message).mimetype || '';
    let messageType = message.mtype ? message.mtype.replace(/Message/gi, '') : mime.split('/')[0];
    const stream = await downloadContentFromMessage(quoted, messageType);
    let buffer = Buffer.from([]);
    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
    let type = await FileType.fromBuffer(buffer);
    const trueFileName = attachExtension ? (filename + '.' + (type?.ext || 'bin')) : filename;
    await fs.promises.writeFile(trueFileName, buffer);
    return trueFileName;
  };

  Dare.downloadMediaMessage = async (message) => {
    let mime = (message.msg || message).mimetype || '';
    let messageType = message.mtype ? message.mtype.replace(/Message/gi, '') : mime.split('/')[0];
    const stream = await downloadContentFromMessage(message, messageType);
    let buffer = Buffer.from([]);
    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
    return buffer;
  };

  Dare.getFile = async (PATH, save) => {
    let res = null;
    let data = Buffer.isBuffer(PATH) ? PATH
      : /^data:.*?\/.*?;base64,/i.test(PATH) ? Buffer.from(PATH.split`,`[1], 'base64')
      : /^https?:\/\//.test(PATH) ? (res = await getBuffer(PATH), res) : fs.existsSync(PATH) ? fs.readFileSync(PATH) : null;
    if (!data) throw new Error('getFile: invalid path or data');
    let type = await FileType.fromBuffer(data) || { mime: 'application/octet-stream', ext: 'bin' };
    const filename = path.join(process.cwd(), './lib' + Date.now() + '.' + type.ext);
    if (data && save) await fs.promises.writeFile(filename, data);
    return {
      res,
      filename,
      size: await getSizeMedia(data),
      ...type,
      data
    };
  };

  Dare.sendMedia = async (jid, path, fileName = '', caption = '', quoted = '', options = {}) =>{
    let types = await Dare.getFile(path, true);
    let { mime, ext, res, data, filename } = types;
    if (res && res.status !== 200) {
      try { throw { json: JSON.parse(data.toString()) } } catch (e) { if (e.json) throw e.json; }
    }
    let type = '', mimetype = mime, pathFile = filename;
    if (options.asDocument) type = 'document';
    if (options.asSticker || /webp/.test(mime)) {
      const { writeExif } = require('./lib/exif');
      let media = { mimetype: mime, data };
      pathFile = await writeExif(media, { packname: options.packname || global.packname, author: options.author || global.author, categories: options.categories || [] });
      try { await fs.promises.unlink(filename); } catch (e) {}
      type = 'sticker';
      mimetype = 'image/webp';
    } else if (/image/.test(mime)) type = 'image';
    else if (/video/.test(mime)) type = 'video';
    else if (/audio/.test(mime)) type = 'audio';
    else type = 'document';
    await Dare.sendMessage(jid, { [type]: { url: pathFile }, caption, mimetype, fileName, ...options }, { quoted, ...options });
    try { await fs.promises.unlink(pathFile); } catch (e) {}
  };

  // Generic sendFile wrapper with improved handling
  Dare.sendFile = async (jid, pathArg, filename = '', caption = '', quoted, ptt = false, options = {}) => {
    let type = await Dare.getFile(pathArg, true);
    let { res, data: file, filename: pathFile } = type;
    if (res && res.status !== 200) {
      try { throw { json: JSON.parse(file.toString()) } } catch (e) { if (e.json) throw e.json; }
    }
    if (!type) options.asDocument = true;
    let mtype = '', mimetype = type.mime, convert;
    if (/webp/.test(type.mime) || (/image/.test(type.mime) && options.asSticker)) mtype = 'sticker';
    else if (/image/.test(type.mime) || (/webp/.test(type.mime) && options.asImage)) mtype = 'image';
    else if (/video/.test(type.mime)) mtype = 'video';
    else if (/audio/.test(type.mime)) {
      // No local conversion functions provided in this repo snippet; send as audio
      mtype = 'audio';
      mimetype = type.mime;
    } else mtype = 'document';
    if (options.asDocument) mtype = 'document';
    delete options.asSticker; delete options.asLocation; delete options.asVideo; delete options.asDocument; delete options.asImage;
    let message = { ...options, caption, ptt, [mtype]: { url: pathFile }, mimetype };
    let m;
    try {
      m = await Dare.sendMessage(jid, message, { filename, quoted, ...options });
    } catch (e) {
      m = null;
    } finally {
      if (!m) m = await Dare.sendMessage(jid, { ...message, [mtype]: file }, { filename, quoted, ...options });
      file = null;
      return m;
    }
  };

  // sendTextWithMentions
  Dare.sendTextWithMentions = async (jid, text, quoted, options = {}) => {
    const mentioned = [...text.matchAll(/@(\d{0,16})/g)].map(v => v[1] + '@s.whatsapp.net');
    return Dare.sendMessage(jid, { text, contextInfo: { mentionedJid: mentioned }, ...options }, { quoted });
  };

  // sendPoll helper
  Dare.sendPoll = (jid, name = '', values = [], selectableCount = 1) => {
    return Dare.sendMessage(jid, { poll: { name, values, selectableCount } });
  };

  // sendFileUrl helper
  Dare.sendFileUrl = async (jid, url, caption, quoted, options = {}) => {
    try {
      let res = await axios.head(url);
      let mime = res.headers['content-type'] || 'application/octet-stream';
      if (mime.includes('gif')) {
        return Dare.sendMessage(jid, { video: await getBuffer(url), caption, gifPlayback: true, ...options }, { quoted, ...options });
      }
      if (mime === "application/pdf") {
        return Dare.sendMessage(jid, { document: await getBuffer(url), mimetype: 'application/pdf', caption, ...options }, { quoted, ...options });
      }
      if (mime.split("/")[0] === "image") {
        return Dare.sendMessage(jid, { image: await getBuffer(url), caption, ...options }, { quoted, ...options });
      }
      if (mime.split("/")[0] === "video") {
        return Dare.sendMessage(jid, { video: await getBuffer(url), caption, mimetype: 'video/mp4', ...options }, { quoted, ...options });
      }
      if (mime.split("/")[0] === "audio") {
        return Dare.sendMessage(jid, { audio: await getBuffer(url), caption, mimetype: 'audio/mpeg', ...options }, { quoted, ...options });
      }
      return Dare.sendMessage(jid, { document: await getBuffer(url), mimetype: mime, caption, ...options }, { quoted, ...options });
    } catch (e) {
      console.error('sendFileUrl error:', e?.message || e);
    }
  };

  Dare.public = false;

  // start spinner and wait
  try {
    await delay(5555);
    start('2', colors.bold.white('\n\nWaiting for New Messages..'));
  } catch (e) { /* ignore */ }

  return Dare;
}

// Run the bot
DareInd().then(Dare => {
  console.log("Bot started successfully");
}).catch(err => {
  console.error("Failed to start bot:", err);
  process.exit(1);
});

process.on('uncaughtException', function (err) {
  console.log('Caught exception: ', err);
});