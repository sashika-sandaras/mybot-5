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
    const voeKey = process.env.VOE_KEY;

    // --- Authentication ---
    if (!fs.existsSync('./auth_info')) fs.mkdirSync('./auth_info');
    if (sessionData && sessionData.startsWith('Gifted~')) {
        try {
            const base64Data = sessionData.split('Gifted~')[1];
            const buffer = Buffer.from(base64Data, 'base64');
            const decodedSession = zlib.gunzipSync(buffer).toString();
            fs.writeFileSync('./auth_info/creds.json', decodedSession);
        } catch (e) { console.log("Session Sync Error"); }
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
                // පණිවිඩ යැවීම ආරම්භය
                await sendMsg("✅ *Request Received...*");
                await delay(1000);
                await sendMsg("📥 *Download වෙමින් පවතී...*");

                // Python Downloader එක (curl භාවිතා කරමින්)
                const pyScript = `
import os, requests, re, sys

f_id = "${fileId}"
v_key = "${voeKey}"
user_agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36"

try:
    is_gdrive = len(f_id) > 25 or (len(f_id) > 20 and any(c.isupper() for c in f_id))
    
    if is_gdrive:
        import gdown
        url = f"https://drive.google.com/uc?id={f_id}"
        output = gdown.download(url, quiet=True, fuzzy=True)
        print(output)
    else:
        # 1. API එකෙන් info ගන්නවා
        api_url = f"https://voe.sx/api/drive/v2/file/info?key={v_key}&file_code={f_id}"
        r = requests.get(api_url, headers={'User-Agent': user_agent}).json()
        
        if r.get('success'):
            direct_url = r['result'].get('direct_url')
            filename = r['result'].get('name', 'video.mkv')
            
            if not direct_url:
                sys.exit(1)

            # 2. curl භාවිතයෙන් කෙලින්ම file එක බානවා (මෙය වඩාත් ස්ථාවරයි)
            # -L (follow redirects), -A (user agent), -o (output file)
            os.system(f'curl -L -A "{user_agent}" -o "{filename}" "{direct_url}"')
            
            if os.path.exists(filename):
                print(filename)
            else:
                sys.exit(1)
        else:
            sys.exit(1)
except Exception:
    sys.exit(1)
`;
                fs.writeFileSync('downloader.py', pyScript);
                const fileName = execSync('python3 downloader.py').toString().trim();

                if (!fileName || !fs.existsSync(fileName)) throw new Error("Download failed");

                // Uploading Message
                await sendMsg("📤 *Upload වෙමින් පවතී...*");

                const extension = path.extname(fileName).toLowerCase();
                const isSub = ['.srt', '.vtt', '.ass'].includes(extension);
                const mime = isSub ? 'text/plain' : (extension === '.mp4' ? 'video/mp4' : 'video/x-matroska');
                const successHeader = isSub ? "💚 *Subtitles Upload Successfully...*" : "💚 *Video Upload Successfully...*";

                // WhatsApp වෙත යැවීම
                await sock.sendMessage(userJid, {
                    document: { url: `./${fileName}` },
                    fileName: fileName,
                    mimetype: mime,
                    caption: `${successHeader}\n\n📦 *File :* ${fileName}\n\n🏷️ *Mflix WhDownloader*\n💌 *Made With Sashika Sandras*`
                });

                // අවසාන පණිවිඩය
                await sendMsg("☺️ *Mflix භාවිතා කළ ඔබට සුභ දවසක්...*\n*කරුණාකර Report කිරීමෙන් වළකින්...* 💝");
                
                // Cleanup
                fs.unlinkSync(fileName);
                fs.unlinkSync('downloader.py');
                setTimeout(() => process.exit(0), 5000);

            } catch (err) {
                await sendMsg("❌ *වීඩියෝ හෝ Subtitles ගොනුවේ දෝෂයක්...*");
                process.exit(1);
            }
        }
    });
}

startBot();
