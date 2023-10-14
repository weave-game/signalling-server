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
const httpServer = new http_1.Server(app);
httpServer.listen(port, () => {
    console.log(`Server is listening on port ${port}`);
});
const wss = new ws_1.Server({ server: httpServer });
let lobbyCode = null;
let host = null;
const clients = {};
wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        let data = JSON.parse(message);
        switch (data.type) {
            case 'register-host':
                if (data.lobby_code) {
                    host = ws;
                    lobbyCode = data.lobby_code;
                    console.log('Host connected');
                }
                else {
                    console.log('Missing lobby code in message');
                }
                break;
            case 'register-client':
                if (data.lobby_code && data.lobby_code === lobbyCode && host) {
                    clients[data.id] = ws;
                    console.log('Client connected with id ' + data.id);
                    host.send(JSON.stringify({
                        type: 'client-connected',
                        clientId: data.id
                    }));
                }
                else {
                    console.log('Unable to register client');
                    ws.send(JSON.stringify({ type: 'error', message: 'unable to join lobby' }));
                }
                break;
            case 'offer':
                console.log(`Forwarding offer to client with id ${data.clientId} ... `);
                if (clients[data.clientId]) {
                    let client = clients[data.clientId];
                    client.send(JSON.stringify({
                        type: 'offer',
                        offer: data.offer
                    }));
                    console.log('Forwarded offer');
                }
                else {
                    console.error(`Could not forward offer, ${data.clientId} does not exist`);
                }
                break;
            case 'answer':
                console.log('Forwarding answer to host');
                if (host) {
                    host.send(JSON.stringify({
                        type: 'answer',
                        answer: data.answer,
                        clientId: data.clientId
                    }));
                }
                else {
                    console.error('Could not forward answer, host does not exist');
                }
                break;
            case 'ice-candidate-client':
                console.log(`Forwarding ICE candidate to host from client with id ${data.clientId}...`);
                // Forward the ICE candidate to the host.
                if (host) {
                    host.send(JSON.stringify({
                        type: 'ice-candidate',
                        candidate: data.candidate,
                        clientId: data.clientId
                    }));
                    console.log('Forwarded candidate');
                }
                else {
                    console.error('Could not forward candidate, host does not exist');
                }
                break;
            case 'ice-candidate-host':
                console.log('Forwarding ICE candidate to client from host...');
                // Forward the ICE candidate to the correct client.
                if (clients[data.clientId]) {
                    let client = clients[data.clientId];
                    client.send(JSON.stringify({
                        type: 'ice-candidate',
                        candidate: data.candidate
                    }));
                    console.log('Forwarded candidate');
                }
                else {
                    console.error(`Could not forward candidate, ${data.clientId} does not exist`);
                }
                break;
            case 'message':
                console.log('Forwarding message to client from host...');
                // Forward message to the correct client.
                if (clients[data.clientId]) {
                    let client = clients[data.clientId];
                    client.send(JSON.stringify({
                        type: 'message',
                        message: data.message
                    }));
                    console.log('Forwarded message');
                }
                else {
                    console.error(`Could not forward message, ${data.clientId} does not exist`);
                }
                break;
            default:
                ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
                break;
        }
    });
    ws.on('close', () => {
        if (ws === host) {
            console.log('Host disconnected');
            host = null;
        }
        else {
            for (let id in clients) {
                if (clients[id] === ws) {
                    console.log('Client disconnected');
                    delete clients[id];
                }
            }
        }
    });
});
