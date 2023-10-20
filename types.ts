import WebSocket from 'ws';

export interface Lobby {
    lobbyCode: string;
    host: WebSocket;
    clients: { [id: string]: WebSocket };
}