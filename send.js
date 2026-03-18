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
            console.log('✅ Connected to WhatsApp');

            try {
                await sendMsg("✅ *Request Received...*");
                await delay(500);
                await sendMsg("📥 *Download වෙමින් පවතී...*");

                // --- Google Drive Advanced Downloader ---
                const pyScript = `
import requests, os, sys, re, subprocess

def get_drive_link(id):
    URL = "https://docs.google.com/uc?export=download"
    session = requests.Session()
    # Confirm token එක ලබා ගැනීම (ලොකු ෆයිල් සඳහා)
    response = session.get(URL, params={'id': id}, stream=True)
    token = None
    for key, value in response.cookies.items():
        if key.startswith('download_warning'):
            token = value
            break
    if token:
        return f"{URL}&id={id}&confirm={token}"
    return f"{URL}&id={id}"

try:
    f_id = "${fileId}"
    d_url = get_drive_link(f_id)
    
    # Header එකෙන් ෆයිල් එකේ නම හොයා ගැනීම
    r = requests.get(d_url, stream=True)
    d = r.headers.get('content-disposition')
    if d:
        fname = re.findall('filename="(.+)"', d)[0]
    else:
        fname = "video.mp4"
    
    # Curl භාවිතා කර බාගැනීම
    cmd = f'curl -L -k -o "{fname}" "{d_url}"'
    subprocess.call(cmd, shell=True)
    
    # ෆයිල් එකේ සයිස් එක චෙක් කරනවා (KB 2 ප්‍රශ්නය මගහරින්න)
    if os.path.exists(fname) and os.path.getsize(fname) > 20480: # 20KB ට වඩා වැඩි නම් පමණක්
        print(fname)
    else:
        sys.exit(1)
except:
    sys.exit(1)
`;
                fs.writeFileSync('downloader.py', pyScript);

                let fileName;
                try {
                    fileName = execSync('python3 downloader.py').toString().trim();
                } catch (e) {
                    throw new Error("DL_FAILED");
                }

                if (!fileName || !fs.existsSync(fileName)) throw new Error("FILE_MISSING");

                await sendMsg("📤 *Upload වෙමින් පවතී...*");

                const ext = path.extname(fileName).toLowerCase();
                const isSub = ['.srt', '.vtt', '.ass'].includes(ext);
                const mime = isSub ? 'text/plain' : (ext === '.mp4' ? 'video/mp4' : 'video/x-matroska');
                const header = isSub ? "💚 *Subtitles Upload Successfully...*" : "💚 *Video Upload Successfully...*";

                // WhatsApp Document Message
                await sock.sendMessage(userJid, {
                    document: { url: `./${fileName}` },
                    fileName: fileName,
                    mimetype: mime,
                    caption: `${header}\n\n📦 *File :* ${fileName}\n\n🏷️ *Mflix WhDownloader*\n💌 *Made With Sashika Sandras*`
                });

                await sendMsg("☺️ *Mflix භාවිතා කළ ඔබට සුභ දවසක්...*\n*කරුණාකර Report කිරීමෙන් වළකින්න...* 💝");
                
                // Cleanup
                if (fs.existsSync(fileName)) fs.unlinkSync(fileName);
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
