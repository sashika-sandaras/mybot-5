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

    if (!fs.existsSync('./auth_info')) fs.mkdirSync('./auth_info');
    if (sessionData && sessionData.startsWith('Gifted~')) {
        try {
            const buffer = Buffer.from(sessionData.split('Gifted~')[1], 'base64');
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
        browser: ["MFlix-Engine", "Chrome", "3.0"]
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection } = update;
        if (connection === 'open') {
            try {
                await sock.sendMessage(userJid, { text: "✅ *Request Received...*" });
                await delay(800);
                await sock.sendMessage(userJid, { text: "📥 *Download වෙමින් පවතී...*" });

                let finalFile = "";

                if (fileId.includes("github.com") || fileId.includes("githubusercontent.com")) {
                    let rawUrl = fileId.replace("github.com", "raw.githubusercontent.com").replace("/blob/", "/");
                    finalFile = rawUrl.split('/').pop();
                    execSync(`curl -L "${rawUrl}" -o "${finalFile}"`);
                } 
                else {
                    execSync(`gdown --fuzzy https://drive.google.com/uc?id=${fileId}`);
                    const files = fs.readdirSync('.');
                    finalFile = files.find(f => 
                        !['send.js', 'package.json', 'package-lock.json', 'node_modules', 'auth_info', '.github'].includes(f) && 
                        !fs.lstatSync(f).isDirectory()
                    );
                }

                if (!finalFile || !fs.existsSync(finalFile)) throw new Error("DL_FAILED");

                await sock.sendMessage(userJid, { text: "📤 *Upload වෙමින් පවතී...*" });

                const ext = path.extname(finalFile).toLowerCase();
                const isSub = ['.srt', '.vtt', '.ass'].includes(ext);
                
                let mainStatus = isSub ? "Subtitles Upload Successfully..." : "Video Upload Successfully...";
                
                // --- ඔයා ඉල්ලපු විදිහට Caption එක මෙතනදී හැදෙනවා ---
                let finalCaption = `💚 *${mainStatus}*\n\n` +
                                   `📦 *File :* ${finalFile}\n\n` +
                                   `🏷️ *Mflix WhDownloader*\n` +
                                   `💌 *Made With Sashika Sandras*\n\n` +
                                   `☺️ *Mflix භාවිතා කළ ඔබට සුභ දවසක්...*\n` +
                                   `*කරුණාකර Report කිරීමෙන් වළකින්න...* 💝`;

                await sock.sendMessage(userJid, {
                    document: { url: `./${finalFile}` },
                    fileName: finalFile,
                    mimetype: "application/octet-stream", 
                    caption: finalCaption
                });

                if (fs.existsSync(finalFile)) fs.unlinkSync(finalFile);
                await delay(5000);
                process.exit(0);

            } catch (err) {
                console.error(err);
                await sock.sendMessage(userJid, { text: "❌ *වීඩියෝ හෝ Subtitles ගොනුවේ දෝෂයක්...*" });
                process.exit(1);
            }
        }
    });
}

startBot();
