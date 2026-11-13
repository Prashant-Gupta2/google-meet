import type { Server as HttpServer } from 'node:http';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { env } from '../config/env.js';

type User = { id: number; email: string };
type Participant = User & { socketId: string; role: 'admin' | 'guest' };
type Room = { hostId: string; participants: Map<string, Participant>; waiting: Map<string, Participant> };

function publicParticipants(room: Room): Participant[] {
  return [...room.participants.values()];
}

export function attachSignaling(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: { origin: env.clientUrl, methods: ['GET', 'POST'] },
  });
  const rooms = new Map<string, Room>();

  io.use((socket, next) => {
    const token = socket.handshake.auth.token as string | undefined;
    if (!token) return next(new Error('Authentication required'));
    try {
      const payload = jwt.verify(token, env.jwtSecret);
      if (typeof payload === 'string' || (typeof payload.sub !== 'string' && typeof payload.sub !== 'number') || typeof payload.email !== 'string') {
        return next(new Error('Invalid authentication token'));
      }
      const userId = Number(payload.sub);
      if (!Number.isInteger(userId) || userId <= 0) return next(new Error('Invalid authentication token'));
      socket.data.user = { id: userId, email: payload.email } satisfies User;
      return next();
    } catch {
      return next(new Error('Invalid authentication token'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user as User;
    let currentRoomId: string | undefined;

    socket.on('meeting:create', (rawRoomId: string) => joinRoom(rawRoomId, true));
    socket.on('meeting:join', (rawRoomId: string) => joinRoom(rawRoomId, false));

    function joinRoom(rawRoomId: string, createRoom: boolean): void {
      const roomId = rawRoomId.trim().toLowerCase();
      if (!roomId || currentRoomId) return;
      currentRoomId = roomId;
      let room = rooms.get(roomId);
      if (!room) {
        if (!createRoom) {
          currentRoomId = undefined;
          socket.emit('meeting:not-found');
          return;
        }
        const participant: Participant = { ...user, socketId: socket.id, role: 'admin' };
        room = { hostId: socket.id, participants: new Map([[socket.id, participant]]), waiting: new Map() };
        rooms.set(roomId, room);
        socket.join(roomId);
        socket.emit('meeting:joined', { role: 'admin', participants: publicParticipants(room) });
        return;
      }

      if (createRoom) {
        currentRoomId = undefined;
        socket.emit('meeting:already-exists');
        return;
      }

      const participant: Participant = { ...user, socketId: socket.id, role: 'guest' };
      room.waiting.set(socket.id, participant);
      socket.emit('meeting:waiting');
      io.to(room.hostId).emit('meeting:join-request', participant);
    }

    socket.on('meeting:admit', (guestSocketId: string) => {
      if (!currentRoomId) return;
      const room = rooms.get(currentRoomId);
      if (!room || room.hostId !== socket.id) return;
      const guest = room.waiting.get(guestSocketId);
      if (!guest) return;
      room.waiting.delete(guestSocketId);
      room.participants.set(guestSocketId, guest);
      const guestSocket = io.sockets.sockets.get(guestSocketId);
      guestSocket?.join(currentRoomId);
      guestSocket?.emit('meeting:admitted', { participants: publicParticipants(room) });
      socket.to(currentRoomId).emit('meeting:peer-joined', guest);
      io.to(currentRoomId).emit('meeting:participants', publicParticipants(room));
    });

    socket.on('webrtc:signal', ({ targetSocketId, signal }: { targetSocketId: string; signal: unknown }) => {
      if (!currentRoomId) return;
      const room = rooms.get(currentRoomId);
      if (!room?.participants.has(socket.id)) return;
      io.to(targetSocketId).emit('webrtc:signal', { fromSocketId: socket.id, signal });
    });

    socket.on('meeting:leave', () => removeSocket());
    socket.on('disconnect', () => removeSocket());

    function removeSocket(): void {
      if (!currentRoomId) return;
      const room = rooms.get(currentRoomId);
      if (!room) return;
      room.waiting.delete(socket.id);
      const wasParticipant = room.participants.delete(socket.id);
      if (wasParticipant) {
        socket.to(currentRoomId).emit('meeting:peer-left', socket.id);
        if (room.hostId === socket.id) {
          const nextHost = room.participants.values().next().value as Participant | undefined;
          if (nextHost) {
            room.hostId = nextHost.socketId;
            nextHost.role = 'admin';
            io.to(nextHost.socketId).emit('meeting:host-promoted');
          } else {
            rooms.delete(currentRoomId);
            currentRoomId = undefined;
            return;
          }
        }
        io.to(currentRoomId).emit('meeting:participants', publicParticipants(room));
      }
      currentRoomId = undefined;
    }
  });

  return io;
}
