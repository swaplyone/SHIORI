import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { API_BASE_URL } from '../utils/api';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextType>({ socket: null, isConnected: false });

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const { user, token, updateUser } = useAuth();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    // If user is not authenticated, ensure socket is disconnected and null
    if (!token || !user) {
      if (socketRef.current) {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setSocket(null);
      setIsConnected(false);
      return;
    }

    // Connect Socket.IO directly to backend server with authenticated JWT
    const backendUrl = API_BASE_URL || window.location.origin;
    const socketInstance = io(backendUrl, {
      auth: { token },
      transports: ['polling', 'websocket'],
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
      autoConnect: true,
    });

    socketRef.current = socketInstance;
    setSocket(socketInstance);

    socketInstance.on('points:updated', (data: { points: number; added: number; reason: string }) => {
      if (data && typeof data.points === 'number') {
        updateUser({ points: data.points });
      }
    });

    socketInstance.on('connect', () => {
      setIsConnected(true);
      // Auto-join user room upon connection
      if (user?.id) {
        socketInstance.emit('join-user', user.id);
      }
    });

    socketInstance.on('disconnect', () => {
      setIsConnected(false);
    });

    socketInstance.on('connect_error', () => {
      setIsConnected(false);
    });

    return () => {
      socketInstance.removeAllListeners();
      socketInstance.disconnect();
      socketRef.current = null;
    };
  }, [token, user?.id]);

  return (
    <SocketContext.Provider value={{ socket, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);
