const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Basic dotenv parser
function loadEnv() {
    try {
        const envPath = path.join(__dirname, '.env');
        if (fs.existsSync(envPath)) {
            const envContent = fs.readFileSync(envPath, 'utf8');
            envContent.split('\n').forEach(line => {
                const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
                if (match) {
                    const key = match[1];
                    let value = match[2] || '';
                    if (value.startsWith('"') && value.endsWith('"')) {
                        value = value.replace(/^"|"$/g, '');
                    }
                    process.env[key] = value.trim();
                }
            });
        }
    } catch (e) {
        console.error('Error loading .env file:', e);
    }
}

loadEnv();

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.GEMINI_API_KEY;

const server = http.createServer((req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    if (req.method === 'POST' && req.url === '/api/chat') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const prompt = data.prompt;

                if (!API_KEY) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: "API key is missing on the server." }));
                    return;
                }

                const payload = JSON.stringify({
                    contents: [
                        { role: "user", parts: [{ text: "You are a professional environmental scientist. Provide concise, 2-sentence expert reports based on decibel readings. Use real-world logic.\n\n" + prompt }] }
                    ]
                });

                const options = {
                    hostname: 'generativelanguage.googleapis.com',
                    path: `/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(payload)
                    }
                };

                const proxyReq = https.request(options, (proxyRes) => {
                    let responseData = '';
                    proxyRes.on('data', (chunk) => responseData += chunk);
                    proxyRes.on('end', () => {
                        try {
                            const data = JSON.parse(responseData);
                            let text = data.candidates?.[0]?.content?.parts?.[0]?.text;
                            if (!text) {
                                text = "AI API Error: " + (data.error?.message || JSON.stringify(data));
                            }
                            // Format response to match expected frontend structure
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({
                                choices: [{ message: { content: text } }]
                            }));
                        } catch (parseErr) {
                            res.writeHead(500, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: "Failed to parse API response." }));
                        }
                    });
                });

                proxyReq.on('error', (e) => {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: "Failed to fetch from Gemini API.", details: e.message }));
                });

                proxyReq.write(payload);
                proxyReq.end();
                
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: "Invalid request body." }));
            }
        });
    } else if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
        const filePath = path.join(__dirname, 'index.html');
        fs.readFile(filePath, (err, content) => {
            if (err) {
                res.writeHead(500);
                res.end('Error loading index.html');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(content);
        });
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
});
