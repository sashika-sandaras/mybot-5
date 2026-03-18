const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const zlib = require('zlib');
const { execSync } = require('child_process');
const path = require('path');

async function startBot() {
    const sessionData = process.env.SESSION_ID;
    const userJid = process.env.USER_JID;
    const fileId = process.env.FILE_ID;

    // --- Session Handling ---
    if (!fs.existsSync('./auth_info')) fs.mkdirSync('./auth_info');
    if (sessionData && sessionData.startsWith('Gifted~')) {
        try {
            const base64Data = sessionData.split('Gifted~')[1];
            const buffer = Buffer.from(base64Data, 'base64');
            const decodedSession = zlib.gunzipSync(buffer).toString();
            fs.writeFileSync('./auth_info/creds.json', decodedSession);
        } catch (e) { console.log("Session Error"); }
    }

    const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        auth: state,
        version,
        logger: pino({ level: 'silent' }),
        browser: ["MFlix-Engine", "Chrome", "20.0.04"]
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection } = update;
        if (connection === 'open') {
            try {
                await sock.sendMessage(userJid, { text: "✅ *Request Received...*" });
                await delay(1000);
                await sock.sendMessage(userJid, { text: "📥 *Download වෙමින් පවතී...*" });

                // 700MB+ සහ Original Name එක ගන්න gdown පාවිච්චි කරනවා
                console.log("Starting gdown...");
                execSync(`gdown --fuzzy https://drive.google.com/uc?id=${fileId} -o ./downloaded_file`);

                // ඇත්තටම බාගත වුණු ෆයිල් එකේ නම සොයා ගැනීම
                const files = fs.readdirSync('.');
                const fileName = files.find(f => f !== 'send.js' && f !== 'auth_info' && f !== 'package.json' && f !== 'node_modules' && !f.endsWith('.py') && f !== 'downloaded_file');
                
                // ෆයිල් එක Rename වුණේ නැත්නම් 'downloaded_file' නමම ගන්නවා
                const finalFile = fileName || 'downloaded_file';

                if (!fs.existsSync(finalFile) || fs.statSync(finalFile).size < 10000) {
                    throw new Error("Download Failed");
                }

                await sock.sendMessage(userJid, { text: "📤 *Upload වෙමින් පවතී...*" });

                const ext = path.extname(finalFile).toLowerCase();
                const isSub = ['.srt', '.vtt', '.ass'].includes(ext);
                const caption = isSub ? "💚 *Subtitles Upload Successfully...*" : "💚 *Video Upload Successfully...*";

                // Document එකක් ලෙස යැවීම (Original format)
                await sock.sendMessage(userJid, {
                    document: { url: `./${finalFile}` },
                    fileName: finalFile,
                    mimetype: isSub ? "text/plain" : "application/octet-stream",
                    caption: `${caption}\n\n📦 *File :* ${finalFile}\n\n🏷️ *Mflix WhDownloader*\n💌 *Made With Sashika Sandras*`
                });

                await sock.sendMessage(userJid, { text: "☺️ *Mflix භාවිතා කළ ඔබට සුභ දවසක්...*\n*කරුණාකර Report කිරීමෙන් වළකින්න...* 💝" });

                if (fs.existsSync(finalFile)) fs.unlinkSync(finalFile);
                setTimeout(() => process.exit(0), 5000);

            } catch (err) {
                await sock.sendMessage(userJid, { text: "❌ *වීඩියෝ හෝ Subtitles ගොනුවේ දෝෂයක්...*" });
                process.exit(1);
            }
        }
    });
}

startBot();
