import { Server as SocketIOServer, Socket } from 'socket.io';
import http from 'http';
import { verifyToken , SENDER_TYPE } from '../common';

let io: SocketIOServer | null = null;

export const initializeSocket = (server: http.Server): SocketIOServer => {
    io = new SocketIOServer(server, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST'],
        },
        pingTimeout: 60000,
        pingInterval: 25000,
    });

    io.use((socket: Socket, next) => {
        try {
            const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization;
            if (!token) {
                return next(new Error('Authentication token required'));
            }

            const decoded = verifyToken(token);
            if (!decoded) {
                return next(new Error('Invalid authentication token'));
            }

            (socket as any).user = decoded;
            next();
        } catch (error) {
            next(new Error('Authentication failed'));
        }
    });

    io.on('connection', (socket: Socket) => {
        const user = (socket as any).user;
        console.log(`[Socket] User connected: ${user?._id} (${user?.role})`);

        if (user?._id) {
            socket.join(`user_${user._id}`);
        }

        if (user?.role === 'admin') {
            socket.join('admin_support');
            console.log(`[Socket] Admin ${user._id} joined admin_support room`);
        }

        socket.on('join_ticket', (data: { ticketId: string }) => {
            if (data.ticketId) {
                socket.join(`ticket_${data.ticketId}`);
                console.log(`[Socket] User ${user?._id} joined ticket room: ticket_${data.ticketId}`);
            }
        });

        socket.on('leave_ticket', (data: { ticketId: string }) => {
            if (data.ticketId) {
                socket.leave(`ticket_${data.ticketId}`);
            }
        });

        socket.on('typing', (data: { ticketId: string; isTyping: boolean }) => {
            if (data.ticketId) {
                socket.to(`ticket_${data.ticketId}`).emit('user_typing', {
                    userId: user?._id,
                    senderType: user?.role === 'admin' ? SENDER_TYPE.ADMIN : SENDER_TYPE.USER,
                    isTyping: data.isTyping,
                });
            }
        });

        socket.on('disconnect', (reason) => {
            console.log(`[Socket] User disconnected: ${user?._id}, reason: ${reason}`);
        });

        socket.on('error', (error) => {
            console.error(`[Socket] Error for user ${user?._id}:`, error);
        });
    });
    console.log('[Socket] Socket.IO initialized successfully');
    return io;
};

export const getSocketInstance = (): SocketIOServer | null => {
    return io;
};
