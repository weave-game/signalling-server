import express from 'express';
import { Server as HttpServer } from 'http';
import WebSocket, { Server as WebSocketServer } from 'ws';

const app = express();
const port = process.env.PORT ?? 8080;

const httpServer = new HttpServer(app);
httpServer.listen(port, () => {
	console.log(`Server is listening on port ${port}`);
});

const wss = new WebSocketServer({ server: httpServer });

let lobbyCode: string | null = null;
let host: WebSocket | null = null;
const clients: { [id: string]: WebSocket } = {};

wss.on('connection', (ws: WebSocket) => {
	ws.on('message', (message: string) => {
		let data = JSON.parse(message);

		switch (data.type) {
			case 'register-host':
				if (data.lobby_code) {
					host = ws;
					lobbyCode = data.lobby_code;
					console.log('Host connected')
				} else {
					console.log('Missing lobby code in message')
				}
				break;

			case 'register-client':
				if (data.lobby_code && data.lobby_code === lobbyCode && host) {
					clients[data.id] = ws;
					console.log('Client connected with id ' + data.id)

					host.send(JSON.stringify({
						type: 'client-connected',
						clientId: data.id
					}))
				} else {
					console.log('Unable to register client')
					ws.send(JSON.stringify({type: 'error', message: 'unable to join lobby'}));
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
					console.log('Forwarded offer')
				} else {
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
				} else {
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
					console.log('Forwarded candidate')
				} else {
					console.error('Could not forward candidate, host does not exist');
				}
				break;

			case 'ice-candidate-host':
				console.log('Forwarding ICE candidate to client from host...');

				// Forward the ICE candidate to the correct client.
				let client = clients[data.clientId]
				if (client) {
					client.send(JSON.stringify({
						type: 'ice-candidate',
						candidate: data.candidate
					}));
					console.log('Forwarded candidate');
				} else {
					console.error(`Could not forward candidate, ${data.clientId} does not exist`);
				}
				break;

			default:
				ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
				break;

		}
	});

	ws.on('close', () => {
		if (ws === host) {
			console.log('Host disconnected')
			host = null;
		} else {
			for (let id in clients) {
				if (clients[id] === ws) {
					console.log('Client disconnected')
					delete clients[id];
				}
			}
		}
	});
});
