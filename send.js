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

    // --- Session Setup ---
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

    // මැසේජ් යවන පොදු function එක
    async function sendMsg(text) {
        await sock.sendMessage(userJid, { text: text });
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection } = update;
        if (connection === 'open') {
            console.log('✅ Bot Connected to WhatsApp');

            try {
                // 1. මුලින්ම පණිවිඩ යවනවා
                await sendMsg("✅ *Request Received...*");
                await delay(1000);
                await sendMsg("📥 *Download වෙමින් පවතී...*");

                // 2. Python Downloader එක (VOE Headers සමඟ)
                const pyScript = `
import os, requests, gdown, re, sys
f_id = "${fileId}"
v_key = "${voeKey}"
headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36'}

try:
    is_gdrive = len(f_id) > 25 or (len(f_id) > 20 and any(c.isupper() for c in f_id))
    if is_gdrive:
        url = f"https://drive.google.com/uc?id={f_id}"
        output = gdown.download(url, quiet=True, fuzzy=True)
        print(output)
    else:
        api_url = f"https://voe.sx/api/drive/v2/file/info?key={v_key}&file_code={f_id}"
        r = requests.get(api_url, headers=headers).json()
        if r.get('success'):
            direct_url = r['result'].get('direct_url')
            if not direct_url: sys.exit(1)
            with requests.get(direct_url, headers=headers, stream=True) as res:
                res.raise_for_status()
                cd = res.headers.get('content-disposition')
                output = re.findall('filename="?([^"]+)"?', cd)[0] if cd else r['result'].get('name', 'file.mkv')
                with open(output, 'wb') as f:
                    for chunk in res.iter_content(chunk_size=1024*1024):
                        if chunk: f.write(chunk)
            print(output)
        else: sys.exit(1)
except Exception:
    sys.exit(1)
`;
                fs.writeFileSync('downloader.py', pyScript);
                
                // Python රන් කරලා ෆයිල් එකේ නම ගන්නවා
                const fileName = execSync('python3 downloader.py').toString().trim();

                if (!fileName || !fs.existsSync(fileName)) throw new Error("Download Failed");

                // 3. Upload ආරම්භය
                await sendMsg("📤 *Upload වෙමින් පවතී...*");

                const extension = path.extname(fileName).toLowerCase();
                const isSub = ['.srt', '.vtt', '.ass'].includes(extension);
                const mime = isSub ? 'text/plain' : (extension === '.mp4' ? 'video/mp4' : 'video/x-matroska');
                const successHeader = isSub ? "💚 *Subtitles Upload Successfully...*" : "💚 *Video Upload Successfully...*";

                // 4. WhatsApp වෙත යැවීම
                await sock.sendMessage(userJid, {
                    document: { url: `./${fileName}` },
                    fileName: fileName,
                    mimetype: mime,
                    caption: `${successHeader}\n\n📦 *File :* ${fileName}\n\n🏷️ *Mflix WhDownloader*\n💌 *Made With Sashika Sandras*`
                });

                // 5. අවසාන සුබපැතුම
                await sendMsg("☺️ *Mflix භාවිතා කළ ඔබට සුභ දවසක්...*\n*කරුණාකර Report කිරීමෙන් වළකින්...* 💝");
                
                // Cleanup
                fs.unlinkSync(fileName);
                fs.unlinkSync('downloader.py');
                setTimeout(() => process.exit(0), 5000);

            } catch (err) {
                await sendMsg("❌ *වීඩියෝ හෝ Subtitles ගොනුවේ දෝෂයක්...*");
                console.error(err);
                process.exit(1);
            }
        }
    });
}

startBot();
