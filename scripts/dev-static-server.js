#!/usr/bin/env node
const fs = require('fs');
const http = require('http');
const net = require('net');
const path = require('path');
const { URL } = require('url');

const ROOT = process.cwd();
const PORT = Number(process.env.PORT || 3011);
const HOST = process.env.HOST || '0.0.0.0';
const BACKEND = new URL(process.env.DEV_BACKEND_ORIGIN || 'http://127.0.0.1:3111');

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
    if (req.url.startsWith('/api/') || req.url.startsWith('/socket.io/')) {
        proxyHttp(req, res);
        return;
    }
    serveStatic(req, res);
});

server.on('upgrade', (req, socket, head) => {
    socket.on('error', () => {});
    if (!req.url.startsWith('/socket.io/')) {
        socket.destroy();
        return;
    }
    const backendSocket = net.connect(Number(BACKEND.port || 80), BACKEND.hostname, () => {
        backendSocket.write(buildUpgradeRequest(req));
        if (head && head.length) backendSocket.write(head);
        socket.pipe(backendSocket);
        backendSocket.pipe(socket);
    });
    backendSocket.on('error', () => socket.destroy());
    backendSocket.on('close', () => socket.destroy());
    socket.on('close', () => backendSocket.destroy());
});

server.listen(PORT, HOST, () => {
    console.log(`Dev static/proxy server on http://${HOST}:${PORT}, backend ${BACKEND.origin}`);
});

function proxyHttp(req, res) {
    const options = {
        hostname: BACKEND.hostname,
        port: BACKEND.port || 80,
        path: req.url,
        method: req.method,
        headers: { ...req.headers, host: BACKEND.host },
    };
    const proxyReq = http.request(options, proxyRes => {
        res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
        proxyRes.pipe(res);
    });
    proxyReq.on('error', err => {
        res.writeHead(502, { 'Content-Type': 'text/plain' });
        res.end(`Backend proxy error: ${err.message}`);
    });
    req.pipe(proxyReq);
}

function serveStatic(req, res) {
    const requested = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const relative = requested === '/' ? '/index.html' : requested;
    const fullPath = path.normalize(path.join(ROOT, relative));
    if (!fullPath.startsWith(ROOT)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }
    fs.stat(fullPath, (err, stat) => {
        if (err || !stat.isFile()) {
            res.writeHead(404);
            res.end('Not found');
            return;
        }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(fullPath)] || 'application/octet-stream' });
        fs.createReadStream(fullPath).pipe(res);
    });
}

function buildUpgradeRequest(req) {
    const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
    for (const [key, value] of Object.entries(req.headers)) {
        lines.push(`${key}: ${value}`);
    }
    return `${lines.join('\r\n')}\r\n\r\n`;
}
