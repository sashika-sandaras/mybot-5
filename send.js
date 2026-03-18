const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const zlib = require('zlib');

async function startBot() {
    // 1. Session එක සකස් කිරීම
    if (!fs.existsSync('./auth_info')) fs.mkdirSync('./auth_info');
    const sessionData = process.env.SESSION_ID;
    
    try {
        if (sessionData) {
            const base64Data = sessionData.split('Gifted~')[1];
            const buffer = Buffer.from(base64Data, 'base64');
            const decodedSession = zlib.gunzipSync(buffer).toString();
            fs.writeFileSync('./auth_info/creds.json', decodedSession);
            console.log("📂 Session Loaded Successfully.");
        }
    } catch (e) {
        console.log("❌ Session Error: " + e.message);
    }

    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info');

    const sock = makeWASocket({
        auth: state,
        version,
        logger: pino({ level: 'silent' }),
        connectTimeoutMs: 120000,
        printQRInTerminal: true
    });

    sock.ev.on('creds.update', saveCreds);

    // 2. Connection එක ඕපන් වුණාම සිදුවන දේ
    sock.ev.on('connection.update', async (update) => {
        const { connection } = update;
        if (connection === 'open') {
            console.log("✅ WhatsApp Connected!");

            // --- GitHub Action එකෙන් එන Request එකක් නම් වීඩියෝ එක යවනවා ---
            const userJid = process.env.USER_JID;
            if (fs.existsSync('filename.txt') && userJid) {
                const originalFileName = fs.readFileSync('filename.txt', 'utf8').trim();
                const filePath = `./${originalFileName}`;

                if (fs.existsSync(filePath)) {
                    console.log(`📤 Sending Movie: ${originalFileName} to ${userJid}`);
                    await sock.sendMessage(userJid, { 
                        document: fs.readFileSync(filePath), 
                        mimetype: originalFileName.endsWith('.mkv') ? 'video/x-matroska' : 'video/mp4',
                        fileName: originalFileName,
                        caption: `🎬 *MFlix Original Delivery*\n\n*Name:* ${originalFileName}\n\n🍿 රසවිඳින්න!`
                    });
                    console.log("🚀 Successfully Sent!");
                    await delay(5000);
                    process.exit(0);
                }
            }
        }
    });

    // 3. යූසර් එවන මැසේජ් වලට රිප්ලයි කිරීම (Trigger Logic)
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";

        if (text.startsWith('.tv')) {
            const fileId = text.split(' ')[1];

            if (!fileId) {
                return await sock.sendMessage(from, { text: "❌ කරුණාකර වීඩියෝ ID එක ඇතුළත් කරන්න." });
            }

            await sock.sendMessage(from, { text: "⏳ ඔබගේ ඉල්ලීම පද්ධතියට ලැබුණා. වීඩියෝව සූදානම් කරමින් පවතී..." });

            try {
                // ⚠️ ඔයාගේ අන්තිමට ගත්ත අලුත් Google Script URL එක මෙතනට පේස්ට් කරන්න
                const scriptUrl = "https://script.google.com/macros/s/AKfycbyx810dTnq2LZOJIHP2CX9OqGYqXGLYxZDP_PLl-zsZMz6Kz17aPeSe_7fYHdc2iCpV/exec";

                console.log(`🔗 Triggering Google Script for ID: ${fileId}`);

                // Google Script එකට දත්ත යවනවා (fetch පාවිච්චි කර ඇත)
                const response = await fetch(scriptUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain' },
                    body: JSON.stringify({ fileId: fileId, userJid: from })
                });

                const resText = await response.text();
                console.log("✅ Google Response:", resText);

            } catch (error) {
                console.error("❌ Google Trigger Error:", error.message);
                await sock.sendMessage(from, { text: "⚠️ පද්ධතියේ දෝෂයක්. කරුණාකර පසුව උත්සාහ කරන්න." });
            }
        }
    });
}

startBot();
