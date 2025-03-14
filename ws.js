import { WebSocketServer } from 'ws';
import { ethers } from 'ethers';
import hyperswarm from 'hyperswarm';
import { createHash } from 'crypto';

const wss = new WebSocketServer({ port: 3000 });
console.log('WebSocket signaling server running on ws://localhost:3000');

// In-memory store for clients: walletAddress -> WebSocket
const clients = new Map();

// Set up Hyperswarm for decentralized signaling
const swarm = new hyperswarm();

// Listen for incoming P2P connections via Hyperswarm
swarm.on('connection', (socket, info) => {
  console.log('Hyperswarm got a connection', info);
  socket.on('data', data => {
    try {
      const msg = JSON.parse(data.toString());
      // Route message to local client if available
      const targetAddr = msg.target;
      const clientWs = clients.get(targetAddr?.toLowerCase());
      if (clientWs) {
        clientWs.send(JSON.stringify(msg));
      }
    } catch (err) {
      console.error('Failed to parse incoming P2P data:', err);
    }
  });
});

// Utility: join Hyperswarm topic for a given address
function joinDHTTopic(address) {
  const topic = createHash('sha256').update(address).digest();
  swarm.join(topic, { server: true, client: true });
}

// Verify a signed message using ethers.js
function verifySignature(message, address, signature) {
  try {
    const recovered = ethers.utils.verifyMessage(message, signature);
    return recovered.toLowerCase() === address.toLowerCase();
  } catch {
    return false;
  }
}

// Fixed login message – in production, use a one-time nonce instead
const LOGIN_MESSAGE = "Sign this message to log in to the P2P call app";

wss.on('connection', ws => {
  console.log('New WebSocket connection');
  ws.on('message', async data => {
    try {
      const msg = JSON.parse(data);
      switch (msg.type) {
        case 'login': {
          const { address, signature } = msg;
          if (!address || !signature) {
            ws.send(JSON.stringify({ type: 'error', error: 'Missing address or signature' }));
            return;
          }
          if (verifySignature(LOGIN_MESSAGE, address, signature)) {
            clients.set(address.toLowerCase(), ws);
            ws.address = address.toLowerCase();
            joinDHTTopic(address);
            console.log(`Wallet ${address} authenticated`);
            ws.send(JSON.stringify({ type: 'login-success', address }));
          } else {
            console.log(`Failed login attempt for ${address}`);
            ws.send(JSON.stringify({ type: 'error', error: 'Authentication failed' }));
          }
          break;
        }
        case 'call': {
          // Initiate a call: A calling B
          const { target } = msg;
          const from = ws.address;
          if (!from) {
            ws.send(JSON.stringify({ type: 'error', error: 'Not logged in' }));
            break;
          }
          if (!target) {
            ws.send(JSON.stringify({ type: 'error', error: 'No target specified' }));
            break;
          }
          const targetWs = clients.get(target.toLowerCase());
          if (targetWs) {
            // Notify target of the incoming call
            targetWs.send(JSON.stringify({ type: 'incoming-call', from }));
            ws.send(JSON.stringify({ type: 'call-ack', target }));
          } else {
            // Target is not connected to this server, look up via DHT
            console.log(`Target ${target} not on this server, looking up via DHT...`);
            const topic = createHash('sha256').update(target).digest();
            swarm.join(topic, { client: true, server: false });
            ws.send(JSON.stringify({ type: 'call-ack', target }));
          }
          break;
        }
        case 'offer':
        case 'answer':
        case 'ice-candidate': {
          // Relay WebRTC signaling messages between peers
          const { target, sdp, candidate } = msg;
          const from = ws.address;
          if (!from) {
            ws.send(JSON.stringify({ type: 'error', error: 'Not logged in' }));
            break;
          }
          if (!target) {
            ws.send(JSON.stringify({ type: 'error', error: 'No target specified' }));
            break;
          }
          const relayMsg = { type: msg.type, from, sdp, candidate, target };
          const targetWs = clients.get(target.toLowerCase());
          if (targetWs) {
            targetWs.send(JSON.stringify(relayMsg));
          } else {
            console.log(`Relaying ${msg.type} to ${target} via DHT`);
            for (const conn of swarm.connections) {
              try {
                conn.write(Buffer.from(JSON.stringify(relayMsg)));
              } catch (err) {
                console.error('Error writing to DHT connection', err);
              }
            }
          }
          break;
        }
      }
    } catch (err) {
      console.error("Error handling message:", err);
    }
  });

  ws.on('close', () => {
    if (ws.address) {
      clients.delete(ws.address);
    }
  });
});
