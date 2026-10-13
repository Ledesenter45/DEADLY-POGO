'use strict';

const http = require('node:http');
const { randomInt } = require('node:crypto');
const { Server } = require('socket.io');

const PORT = Number(process.env.PORT) || 3000;
const MAX_PLAYERS = 8;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const rooms = new Map();

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('DEADLY POGO multiplayer server is running.\n');
});

const io = new Server(server, {
  cors: {
    // Set ALLOWED_ORIGINS on Render to comma-separated site origins for production.
    // If unset, allow browser origins for initial setup/testing.
    origin: process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
      : true,
    methods: ['GET', 'POST']
  },
  maxHttpBufferSize: 16 * 1024,
  pingInterval: 25000,
  pingTimeout: 20000
});

function validLevel(value) {
  return Number.isInteger(value) && value >= 0 && value <= 100;
}
function makeCode() {
  let code;
  do {
    code = Array.from({ length: 6 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('');
  } while (rooms.has(code));
  return code;
}
function safeName(socket) {
  if (!socket.data.playerName) socket.data.playerName = 'Player-' + randomInt(100, 1000);
  return socket.data.playerName;
}
function lobbySnapshot(room, socketId) {
  return {
    code: room.code,
    level: room.level,
    isHost: room.hostId === socketId,
    players: [...room.players.entries()].map(([id, p]) => ({
      id,
      name: p.name,
      state: p.state
    }))
  };
}
function sendLobbyState(room) {
  for (const id of room.players.keys()) {
    io.to(id).emit('lobbyState', lobbySnapshot(room, id));
  }
}
function leaveRoom(socket) {
  const code = socket.data.roomCode;
  if (!code) return;
  const room = rooms.get(code);
  socket.data.roomCode = null;
  socket.leave(code);
  if (!room) return;

  room.players.delete(socket.id);
  if (room.players.size === 0) {
    rooms.delete(code);
    return;
  }
  if (room.hostId === socket.id) {
    room.hostId = room.players.keys().next().value;
    io.to(code).emit('hostChanged', { isHost: false, hostId: room.hostId });
  }
  io.to(code).emit('playerLeft', { id: socket.id, count: room.players.size });
  sendLobbyState(room);
}

io.on('connection', socket => {
  safeName(socket);

  socket.on('hostRoom', (payload = {}, ack = () => {}) => {
    leaveRoom(socket);
    const level = validLevel(payload.level) ? payload.level : 0;
    const code = makeCode();
    const room = {
      code,
      hostId: socket.id,
      level,
      started: false,
      players: new Map([[socket.id, { name: safeName(socket), state: null }]])
    };
    rooms.set(code, room);
    socket.data.roomCode = code;
    socket.join(code);
    ack({ ok: true, code, level, players: 1, maxPlayers: MAX_PLAYERS });
    sendLobbyState(room);
  });

  socket.on('joinRoom', (payload = {}, ack = () => {}) => {
    const code = String(payload.code || '').trim().toUpperCase();
    if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) {
      ack({ ok: false, error: 'Enter a valid 6-character invite code.' }); return;
    }
    const room = rooms.get(code);
    if (!room) { ack({ ok: false, error: 'Room not found. Check the code or ask the host to create a new room.' }); return; }
    if (room.players.size >= MAX_PLAYERS) { ack({ ok: false, error: 'That room is full (8 players maximum).' }); return; }
    if (socket.data.roomCode === code) { ack({ ok: true, code, level: room.level, players: room.players.size }); return; }
    leaveRoom(socket);
    room.players.set(socket.id, { name: safeName(socket), state: null });
    socket.data.roomCode = code;
    socket.join(code);
    ack({ ok: true, code, level: room.level, players: room.players.size, maxPlayers: MAX_PLAYERS });
    io.to(code).emit('playerJoined', { id: socket.id, name: safeName(socket), count: room.players.size });
    sendLobbyState(room);
    if (room.started) socket.emit('gameStarted', { code, level: room.level });
  });

  socket.on('startGame', (_payload = {}, ack = () => {}) => {
    const code = socket.data.roomCode;
    const room = code && rooms.get(code);
    if (!room) { ack({ ok: false, error: 'Create or join a lobby first.' }); return; }
    if (room.hostId !== socket.id) { ack({ ok: false, error: 'Only the host can start the co-op game.' }); return; }
    room.started = true;
    for (const player of room.players.values()) player.state = null;
    io.to(code).emit('gameStarted', { code, level: room.level });
    ack({ ok: true });
  });

  socket.on('playerState', payload => {
    const code = socket.data.roomCode;
    const room = code && rooms.get(code);
    if (!room || !room.started || !payload || typeof payload !== 'object') return;
    const now = Date.now();
    if (socket.data.lastStateAt && now - socket.data.lastStateAt < 40) return;
    socket.data.lastStateAt = now;
    const x = Number(payload.x), y = Number(payload.y), th = Number(payload.th);
    if (![x, y, th].every(Number.isFinite) || Math.abs(x) > 1_000_000 || Math.abs(y) > 1_000_000 || Math.abs(th) > 1000) return;
    const state = {
      x, y, th,
      state: ['playing', 'dead', 'win'].includes(payload.state) ? payload.state : 'playing',
      level: room.level
    };
    const player = room.players.get(socket.id);
    if (!player) return;
    player.state = state;
    socket.to(code).volatile.emit('playerState', { id: socket.id, name: player.name, state: { ...state, seen: now } });
  });

  socket.on('leaveRoom', () => leaveRoom(socket));
  socket.on('disconnect', () => leaveRoom(socket));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`DEADLY POGO multiplayer server listening on port ${PORT}`);
});
