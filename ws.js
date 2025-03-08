import express from 'express';
import { WebSocketServer } from 'ws';
import Hyperswarm from 'hyperswarm';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

// Set up Express server
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.static(path.join(__dirname, 'public')));

const server = app.listen(3000, () => console.log('Server running on http://localhost:3000'));

// Set up WebSocket server
const wss = new WebSocketServer({ server });
const swarm = new Hyperswarm();

// Function to generate a unique topic for each wallet
const getTopic = (walletAddress) =>
    crypto.createHash('sha256').update(walletAddress).digest();

wss.on('connection', (ws) => {
    console.log('New WebSocket connection');

    ws.on('message', async (msg) => {
        const { wallet, signal } = JSON.parse(msg);
        console.log(`Message from ${wallet}:`, signal);

        const topic = getTopic(wallet);
        const peer = swarm.join(topic, { server: true });

        peer.on('connection', (socket) => {
            socket.write(JSON.stringify({ signal, wallet }));
        });
    });
});

console.log('WebRTC + Hyperswarm Signaling Server Ready!');
