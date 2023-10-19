"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const ws_1 = require("ws");
const app = (0, express_1.default)();
const port = (_a = process.env.PORT) !== null && _a !== void 0 ? _a : 8080;
let lobbies = {};
app.get('/api/status', (_, res) => {
    res.json({ message: 'Server is running' });
});
app.get('/api/lobbies', (_, res) => {
    let lobbyInfo = {};
    Object.entries(lobbies).forEach(([_, lobby]) => {
        lobbyInfo[lobby.lobbyCode] = Object.keys(lobby.clients).length;
    });
    res.json({ message: JSON.stringify(lobbyInfo) });
});
app.post('/api/reset', (_, res) => {
    lobbies = {};
    res.json({ message: 'Reset server' });
});
const httpServer = new http_1.Server(app);
httpServer.listen(port, () => {
    console.log(`Server is listening on port ${port}`);
});
const wss = new ws_1.Server({ server: httpServer });
wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        let data = JSON.parse(message);
        const lobbyCode = data.lobbyCode;
        if (!lobbyCode) {
            ws.send(JSON.stringify({ type: 'error', message: 'Missing lobby code' }));
            console.log('Missing lobby code in message');
            return;
        }
        switch (data.type) {
            case 'register-host': {
                createLobby(lobbyCode, ws);
                break;
            }
            case 'register-client': {
                let lobby;
                try {
                    lobby = getLobby(lobbyCode);
                }
                catch (error) {
                    ws.send(JSON.stringify({ type: 'error', message: error.message }));
                    return;
                }
                const clientId = data.clientId;
                if (!clientId) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Unable to join lobby, no ID in message' }));
                    return;
                }
                addClientToLobby(lobbyCode, clientId, ws);
                // @ts-expect-error - Host will not be null
                lobby.host.send(JSON.stringify({
                    type: 'client-connected',
                    clientId: clientId
                }));
                break;
            }
            case 'offer': {
                let lobby;
                try {
                    lobby = getLobby(lobbyCode);
                }
                catch (error) {
                    ws.send(JSON.stringify({ type: 'error', message: error.message }));
                    return;
                }
                const lobbyClients = lobby.clients;
                if (!(lobbyClients === null || lobbyClients === void 0 ? void 0 : lobbyClients[data.clientId])) {
                    console.error(`Could not forward offer, client ${data.clientId} does not exist in lobby ${lobbyCode}`);
                    return;
                }
                let client = lobbyClients[data.clientId];
                client.send(JSON.stringify({
                    type: 'offer',
                    offer: data.offer
                }));
                console.log(`Forwarded offer to client with id ${data.clientId}`);
                break;
            }
            case 'answer': {
                let lobby;
                try {
                    lobby = getLobby(lobbyCode);
                }
                catch (error) {
                    ws.send(JSON.stringify({ type: 'error', message: error.message }));
                    return;
                }
                const clientId = data.clientId;
                if (!clientId) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Unable to forward answer, no ID in message' }));
                    return;
                }
                // @ts-expect-error - Host will not be null
                lobby.host.send(JSON.stringify({
                    type: 'answer',
                    answer: data.answer,
                    clientId: clientId
                }));
                console.log(`Forwarded answer to host of lobby ${lobbyCode}`);
                break;
            }
            case 'ice-candidate-client': {
                let lobby;
                try {
                    lobby = getLobby(lobbyCode);
                }
                catch (error) {
                    ws.send(JSON.stringify({ type: 'error', message: error.message }));
                    return;
                }
                const clientId = data.clientId;
                if (!clientId) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Unable to forward ICE candidate, no ID in message' }));
                    return;
                }
                // @ts-expect-error - Host will not be null
                lobby.host.send(JSON.stringify({
                    type: 'ice-candidate',
                    candidate: data.candidate,
                    clientId: clientId
                }));
                console.log(`Forwarded ICE candidate to host from client with id ${clientId} in lobby ${lobbyCode}`);
                break;
            }
            case 'ice-candidate-host': {
                let lobby;
                try {
                    lobby = getLobby(lobbyCode);
                }
                catch (error) {
                    ws.send(JSON.stringify({ type: 'error', message: error.message }));
                    return;
                }
                const lobbyClients = lobby.clients;
                if (!(lobbyClients === null || lobbyClients === void 0 ? void 0 : lobbyClients[data.clientId])) {
                    console.error(`Unable to forward ICE candidate, client ${data.clientId} in lobby ${lobbyCode} does not exist`);
                    return;
                }
                let client = lobbyClients[data.clientId];
                client.send(JSON.stringify({
                    type: 'ice-candidate',
                    candidate: data.candidate
                }));
                console.log(`Forwarded ICE candidate from host to client with id ${data.clientId} in lobby ${lobbyCode}`);
                break;
            }
            case 'message':
                let lobby;
                try {
                    lobby = getLobby(lobbyCode);
                }
                catch (error) {
                    ws.send(JSON.stringify({ type: 'error', message: error.message }));
                    return;
                }
                const lobbyClients = lobby.clients;
                if (!(lobbyClients === null || lobbyClients === void 0 ? void 0 : lobbyClients[data.clientId])) {
                    console.error(`Could not forward message, client ${data.clientId} in lobby ${lobbyCode} does not exist`);
                    return;
                }
                let client = lobbyClients[data.clientId];
                client.send(JSON.stringify({
                    type: 'message',
                    message: data.message
                }));
                console.log(`Forwarded message from host to client with id ${data.clientId} in lobby ${lobbyCode}`);
                break;
            case 'color-change': {
                let lobby;
                try {
                    lobby = getLobby(lobbyCode);
                }
                catch (error) {
                    ws.send(JSON.stringify({ type: 'error', message: error.message }));
                    return;
                }
                const lobbyClients = lobby.clients;
                if (!(lobbyClients === null || lobbyClients === void 0 ? void 0 : lobbyClients[data.clientId])) {
                    console.error(`Could not forward color-change, client ${data.clientId} in lobby ${lobbyCode} does not exist`);
                    return;
                }
                let client = lobbyClients[data.clientId];
                client.send(JSON.stringify({
                    type: 'color-change',
                    color: data.color
                }));
                console.log(`Forwarded color-change from the host to client with id ${data.clientId} in lobby ${lobbyCode}`);
                break;
            }
            default:
                ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
                break;
        }
    });
    ws.on('close', () => {
        for (let code in lobbies) {
            if (lobbies[code].host === ws) {
                removeHostFromLobby(code);
                break;
            }
            else {
                for (let id in lobbies[code].clients) {
                    if (lobbies[code].clients[id] === ws) {
                        removeClientFromLobby(code, id);
                    }
                }
            }
        }
    });
    function createLobby(lobbyCode, hostWebSocket) {
        if (lobbies[lobbyCode]) {
            throw new Error('Lobby already exists');
        }
        lobbies[lobbyCode] = {
            lobbyCode: lobbyCode,
            host: hostWebSocket,
            clients: {}
        };
        console.log(`Lobby created with code ${lobbyCode}`);
    }
    function addClientToLobby(lobbyCode, clientId, clientWebSocket) {
        const lobby = getLobby(lobbyCode);
        if (lobby.clients[clientId]) {
            throw new Error('Client ID already exists in this lobby');
        }
        lobby.clients[clientId] = clientWebSocket;
        console.log('Client connected');
    }
    function removeClientFromLobby(lobbyCode, clientId) {
        const lobby = getLobby(lobbyCode);
        if (lobby.host) {
            lobby.host.send(JSON.stringify({ type: 'client-disconnected', clientId: clientId }));
        }
        delete lobby.clients[clientId];
        console.log('Client disconnected');
    }
    function removeHostFromLobby(lobbyCode) {
        broadcastToLobby(lobbyCode, { type: 'error', message: 'Host disconnected' });
        delete lobbies[lobbyCode];
        console.log('Host disconnected');
    }
    function getLobby(lobbyCode) {
        if (lobbies[lobbyCode] && lobbies[lobbyCode].host) {
            return lobbies[lobbyCode];
        }
        else {
            throw new Error(`Lobby with code ${lobbyCode} does not exist or does not have a host`);
        }
    }
    function broadcastToLobby(lobbyCode, message) {
        const lobby = getLobby(lobbyCode);
        Object.entries(lobby.clients).forEach(([_, client]) => {
            client.send(JSON.stringify(message));
        });
    }
});
