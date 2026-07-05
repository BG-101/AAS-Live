import { io } from "socket.io-client";
import { API_URL } from "./api";

// En dev: API_URL = "http://localhost:3001"
// En prod: API_URL = "" -> io usa window.location.origin automáticamente
const SOCKET_URL = API_URL || window.location.origin;

export const createSocket = () => io(SOCKET_URL, { withCredentials: true });
