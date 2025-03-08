import express from 'express';
import { Server } from 'socket.io';
import { createServer } from 'http';
import Hyperswarm from 'hyperswarm';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

// Set up Express and HTTP server
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));

const swarm = new Hyperswarm();

// Generate unique topic for each wallet
const getTopic = (walletAddress) =>
    crypto.createHash('sha256').update(walletAddress).digest();

// Track sockets and topics
const walletPeers = new Map();

io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    socket.on('join', (wallet) => {
        if (!wallet) return;
        console.log(`Wallet ${wallet} joined the swarm`);

        const topic = getTopic(wallet);
        swarm.join(topic, { server: true });

        walletPeers.set(wallet, socket); // Track wallet-socket mapping
    });

    socket.on('signal', (data) => {
        if (!data.wallet || !data.signal) return;
        console.log(`Relaying signal to ${data.wallet}`);

        const recipientSocket = walletPeers.get(data.wallet);
        if (recipientSocket) {
            recipientSocket.emit('signal', data);
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

server.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});
