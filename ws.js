import express from 'express';
import { Server } from 'socket.io';
import { createServer } from 'http';
import Hyperswarm from 'hyperswarm';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

// -- Basic setup
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
});

// -- Hyperswarm for topic-based discovery (optional, as in your original snippet)
const swarm = new Hyperswarm();
function getTopic(walletAddress) {
  return crypto.createHash('sha256').update(walletAddress).digest();
}

// -- Keep track of which wallet is connected to which socket
const walletPeers = new Map();

// -- Serve static files from /public so we can load index.html and any assets
app.use(express.static(path.join(__dirname, 'public')));

// -- Handle all Socket.IO logic
io.on('connection', (socket) => {
  console.log('New Socket.io connection:', socket.id);

  // A wallet "joins" by telling us its address
  socket.on('join', (wallet) => {
    if (!wallet) return;
    const normalized = wallet.toLowerCase();
    console.log('Wallet joined:', normalized);

    // Remember this socket for future calls to this wallet
    walletPeers.set(normalized, socket);

    // Also join the Hyperswarm topic (optional)
    const topic = getTopic(normalized);
    swarm.join(topic, { server: true });
  });

  // Relay SDP signals (offer/answer)
  socket.on('signal', (data) => {
    if (!data.wallet || !data.signal) return;
    const normalized = data.wallet.toLowerCase();
    console.log(`Relaying SDP signal to wallet: ${normalized}`);

    const recipientSocket = walletPeers.get(normalized);
    if (recipientSocket) {
      recipientSocket.emit('signal', data);
    } else {
      console.warn(`No socket found for wallet ${normalized}`);
    }
  });

  // Relay ICE candidates
  socket.on('candidate', (data) => {
    if (!data.wallet || !data.candidate) return;
    const normalized = data.wallet.toLowerCase();
    console.log(`Relaying ICE candidate to wallet: ${normalized}`);

    const recipientSocket = walletPeers.get(normalized);
    if (recipientSocket) {
      recipientSocket.emit('candidate', data);
    } else {
      console.warn(`No socket found for wallet ${normalized}`);
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    // Optionally remove from walletPeers:
    for (const [wallet, s] of walletPeers.entries()) {
      if (s === socket) {
        walletPeers.delete(wallet);
        console.log(`Removed wallet ${wallet} from peers map`);
        break;
      }
    }
  });
});

// -- Start server on port 3000
const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
