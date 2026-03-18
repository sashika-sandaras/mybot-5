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

    // --- Session Setup ---
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

    async function sendMsg(text) {
        await sock.sendMessage(userJid, { text: text });
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection } = update;
        if (connection === 'open') {
            try {
                await sendMsg("✅ *Request Received...*");
                await delay(500);
                await sendMsg("📥 *Download වෙමින් පවතී...*");

                // Python script using gdown to get ORIGINAL filename
                const pyScript = `
import gdown
import os
import sys

file_id = "${fileId}"
url = f'https://drive.google.com/uc?id={file_id}'

try:
    # gdown used to fetch the original file from Google Drive
    # fuzzy=True helps to extract ID from full URLs if provided
    filename = gdown.download(url, quiet=False, fuzzy=True)
    if filename and os.path.exists(filename):
        print(filename) # Output the real filename to Node.js
    else:
        sys.exit(1)
except Exception:
    sys.exit(1)
`;
                fs.writeFileSync('downloader.py', pyScript);

                // Ensure gdown is ready
                try { execSync('pip install gdown'); } catch(e) {}

                let originalFileName;
                try {
                    // Get the real filename printed by Python
                    originalFileName = execSync('python3 downloader.py').toString().trim().split('\n').pop();
                } catch (e) {
                    throw new Error("DOWNLOAD_FAILED");
                }

                if (!originalFileName || !fs.existsSync(originalFileName)) throw new Error("FILE_NOT_FOUND");

                await sendMsg("📤 *Upload වෙමින් පවතී...*");

                // Detect extension for caption logic
                const ext = path.extname(originalFileName).toLowerCase();
                const isSub = ['.srt', '.vtt', '.ass'].includes(ext);
                
                let captionHeader = isSub ? "💚 *Subtitles Upload Successfully...*" : "💚 *Video Upload Successfully...*";
                
                // Mime types for Document sending
                let mimetype = "application/octet-stream"; // Default for any file
                if (ext === '.mp4') mimetype = "video/mp4";
                if (ext === '.mkv') mimetype = "video/x-matroska";
                if (isSub) mimetype = "text/plain";

                // --- SEND AS DOCUMENT (Original File Type) ---
                await sock.sendMessage(userJid, {
                    document: { url: `./${originalFileName}` },
                    fileName: originalFileName,
                    mimetype: mimetype,
                    caption: `${captionHeader}\n\n📦 *File :* ${originalFileName}\n\n🏷️ *Mflix WhDownloader*\n💌 *Made With Sashika Sandras*`
                });

                await sendMsg("☺️ *Mflix භාවිතා කළ ඔබට සුභ දවසක්...*\n*කරුණාකර Report කිරීමෙන් වළකින්න...* 💝");
                
                // Cleanup files
                if (fs.existsSync(originalFileName)) fs.unlinkSync(originalFileName);
                if (fs.existsSync('downloader.py')) fs.unlinkSync('downloader.py');
                
                setTimeout(() => process.exit(0), 5000);

            } catch (err) {
                await sendMsg("❌ *වීඩියෝ හෝ Subtitles ගොනුවේ දෝෂයක්...*");
                process.exit(1);
            }
        }
    });
}

startBot();
