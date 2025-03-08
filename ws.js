import express from 'express';
import { Server } from 'socket.io';
import { createServer } from 'http';
import Hyperswarm from 'hyperswarm';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

// Setup paths
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Create Express and HTTP server
const app = express();
const server = createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Serve static files (the frontend) from a "public" directory (adjust as needed)
app.use(express.static(path.join(__dirname, 'public')));

// Hyperswarm for topic-based discovery (optional, as your original code shows)
const swarm = new Hyperswarm();

// Helper: Generate a unique topic for each wallet
const getTopic = (walletAddress) => 
  crypto.createHash('sha256').update(walletAddress).digest();

// Track wallet-socket connections
const walletPeers = new Map();

// Socket.io main
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  // Client joins swarm/room with their wallet
  socket.on('join', (wallet) => {
    if (!wallet) return;
    console.log(`Wallet ${wallet} joined`);

    const topic = getTopic(wallet);
    swarm.join(topic, { server: true });

    // Keep track of this mapping
    walletPeers.set(wallet, socket);
  });

  // Relay SDP signals (offer/answer)
  socket.on('signal', (data) => {
    if (!data.wallet || !data.signal) return;
    console.log(`Relaying SDP signal to wallet: ${data.wallet}`);

    const recipientSocket = walletPeers.get(data.wallet);
    if (recipientSocket) {
      recipientSocket.emit('signal', data);
    } else {
      console.warn(`No socket found for wallet ${data.wallet}`);
    }
  });

  // Relay ICE candidates
  socket.on('candidate', (data) => {
    if (!data.wallet || !data.candidate) return;
    console.log(`Relaying ICE candidate to wallet: ${data.wallet}`);

    const recipientSocket = walletPeers.get(data.wallet);
    if (recipientSocket) {
      recipientSocket.emit('candidate', data);
    } else {
      console.warn(`No socket found for wallet ${data.wallet}`);
    }
  });

  // On disconnect
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    // Optionally, remove from walletPeers if you like:
    // For example:
    // for (let [wallet, s] of walletPeers.entries()) {
    //   if (s === socket) {
    //     walletPeers.delete(wallet);
    //   }
    // }
  });
});

// Start server
const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
