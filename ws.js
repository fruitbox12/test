import express from 'express';
import { Server } from 'socket.io';
import { createServer } from 'http';
import Hyperswarm from 'hyperswarm';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
});

// Optional Hyperswarm usage
const swarm = new Hyperswarm();
function getTopic(walletAddress) {
  return crypto.createHash('sha256').update(walletAddress).digest();
}

// Store multiple sockets per wallet:  wallet => Set<Socket>
const walletPeers = new Map();

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
  console.log('New Socket.io connection:', socket.id);

  socket.on('join', (wallet) => {
    if (!wallet) return;
    const normalized = wallet.toLowerCase();
    console.log('Wallet joined:', normalized);

    if (!walletPeers.has(normalized)) {
      walletPeers.set(normalized, new Set());
      // Optionally join the Hyperswarm topic if you want
      const topic = getTopic(normalized);
      swarm.join(topic, { server: true });
    }

    // Add this socket to the set for that wallet
    walletPeers.get(normalized).add(socket);
  });

  // Relay SDP signals (offer/answer)
  socket.on('signal', (data) => {
    if (!data.wallet || !data.signal) return;
    const normalized = data.wallet.toLowerCase();
    console.log(`Relaying SDP signal to wallet: ${normalized}`);

    if (walletPeers.has(normalized)) {
      for (const recipientSocket of walletPeers.get(normalized)) {
        // don't send back to the same socket that sent it
        if (recipientSocket.id !== socket.id) {
          recipientSocket.emit('signal', data);
        }
      }
    } else {
      console.warn(`No socket set found for wallet ${normalized}`);
    }
  });

  // Relay ICE candidates
  socket.on('candidate', (data) => {
    if (!data.wallet || !data.candidate) return;
    const normalized = data.wallet.toLowerCase();
    console.log(`Relaying ICE candidate to wallet: ${normalized}`);

    if (walletPeers.has(normalized)) {
      for (const recipientSocket of walletPeers.get(normalized)) {
        if (recipientSocket.id !== socket.id) {
          recipientSocket.emit('candidate', data);
        }
      }
    } else {
      console.warn(`No socket set found for wallet ${normalized}`);
    }
  });

  // On disconnect, remove this socket from whichever wallet set it's in
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    for (const [wallet, socketSet] of walletPeers.entries()) {
      if (socketSet.has(socket)) {
        socketSet.delete(socket);
        console.log(`Removed socket ${socket.id} from wallet ${wallet}`);
        if (socketSet.size === 0) {
          walletPeers.delete(wallet);
          console.log(`No more connections for wallet ${wallet}, removed from map`);
        }
        break;
      }
    }
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
