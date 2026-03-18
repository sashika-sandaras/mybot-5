const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const zlib = require('zlib');
const { execSync } = require('child_process');
const path = require('path');

async function startBot() {
    const sessionData = process.env.SESSION_ID;
    const userJid = process.env.USER_JID;
    const fileId = process.env.FILE_ID; // VOE ID එක හෝ GDrive ID එක
    const voeKey = process.env.VOE_KEY;

    // --- Auth Setup ---
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
                await sendMsg("✅ *Request Received...*");
                await delay(1000);
                await sendMsg("📥 *Download වෙමින් පවතී...*");

                // --- Auto Link Generator Python Script ---
                const pyScript = `
import os, requests, re, sys, subprocess

f_id = "${fileId}"
v_key = "${voeKey}"
ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36"

def generate_direct_link():
    # VOE API හරහා Direct Link එක Generate කිරීම
    # ක්‍රමය 1: file/direct_link (වඩාත් සාර්ථකයි)
    try:
        api = f"https://voe.sx/api/file/direct_link?key={v_key}&file_code={f_id}"
        r = requests.get(api, timeout=10).json()
        if r.get('success'):
            return r['result']['url'], r['result'].get('name', 'video.mp4')
    except: pass

    # ක්‍රමය 2: drive/v2/file/info
    try:
        api = f"https://voe.sx/api/drive/v2/file/info?key={v_key}&file_code={f_id}"
        r = requests.get(api, timeout=10).json()
        if r.get('success'):
            return r['result']['direct_url'], r['result'].get('name', 'video.mp4')
    except: pass
    return None, None

try:
    is_gdrive = len(f_id) > 25 or (len(f_id) > 20 and any(c.isupper() for c in f_id))
    
    if is_gdrive:
        import gdown
        url = f"https://drive.google.com/uc?id={f_id}"
        name = gdown.download(url, quiet=True, fuzzy=True)
        print(name)
        sys.exit(0)
    else:
        # මෙතනදී Bot විසින්ම ලින්ක් එක Generate කරගන්නවා
        d_url, name = generate_direct_link()
        if not d_url:
            sys.exit(1)

        # Generate කරගත් ලින්ක් එකෙන් Curl හරහා බාගැනීම
        cmd = f'curl -L -k -s -A "{ua}" -o "{name}" "{d_url}"'
        res = subprocess.call(cmd, shell=True)
        
        if res == 0 and os.path.exists(name):
            print(name)
        else:
            sys.exit(1)
except Exception:
    sys.exit(1)
`;
                fs.writeFileSync('downloader.py', pyScript);
                const fileName = execSync('python3 downloader.py').toString().trim();

                if (!fileName || !fs.existsSync(fileName)) throw new Error("DL_ERROR");

                await sendMsg("📤 *Upload වෙමින් පවතී...*");

                const ext = path.extname(fileName).toLowerCase();
                const isSub = ['.srt', '.vtt', '.ass'].includes(ext);
                const mime = isSub ? 'text/plain' : (ext === '.mp4' ? 'video/mp4' : 'video/x-matroska');
                const header = isSub ? "💚 *Subtitles Upload Successfully...*" : "💚 *Video Upload Successfully...*";

                await sock.sendMessage(userJid, {
                    document: { url: `./${fileName}` },
                    fileName: fileName,
                    mimetype: mime,
                    caption: `${header}\n\n📦 *File :* ${fileName}\n\n🏷️ *Mflix WhDownloader*\n💌 *Made With Sashika Sandras*`
                });

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
