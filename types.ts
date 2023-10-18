import WebSocket from 'ws';

export interface Lobby {
    lobbyCode: string;
    host: WebSocket | null;
    clients: { [id: string]: WebSocket };
}