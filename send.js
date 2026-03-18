const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const zlib = require('zlib');

async function testConnection() {
    if (!fs.existsSync('./auth_info')) fs.mkdirSync('./auth_info');
    
    const sessionData = process.env.SESSION_ID;
    try {
        const base64Data = sessionData.split('Gifted~')[1];
        const buffer = Buffer.from(base64Data, 'base64');
        const decodedSession = zlib.gunzipSync(buffer).toString();
        
        fs.writeFileSync('./auth_info/creds.json', decodedSession);
        console.log("📂 Session File එක හැදුවා.");
    } catch (e) {
        console.log("❌ Session Decoding Error: " + e.message);
        process.exit(1);
    }

    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info');

    const sock = makeWASocket({
        auth: state,
        version,
        logger: pino({ level: 'silent' }),
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection } = update;
        
        if (connection === 'open') {
            console.log("✅ WhatsApp එකට සම්බන්ධ වුණා!");
            const userJid = process.env.USER_JID;
            
            console.log("💬 ටෙස්ට් මැසේජ් එකක් යවනවා...");
            
            // සරල මැසේජ් එකක් යැවීම
            await sock.sendMessage(userJid, { 
                text: "🚀 *MFlix Bot Connected!*\n\nසෂික, බොට් දැන් ඔයාගේ WhatsApp එකට සාර්ථකව සම්බන්ධ වෙලා තියෙන්නේ. දැන් අපිට ඕනෑම වීඩියෝ එකක් එවන්න පුළුවන්!" 
            });

            console.log("🚀 මැසේජ් එක සාර්ථකව යැව්වා!");
            await delay(3000);
            process.exit(0);
        }
    });
}

testConnection();
