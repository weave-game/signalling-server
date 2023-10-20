import express from 'express';
import { Server as HttpServer } from 'http';
import WebSocket, { Server as WebSocketServer } from 'ws';
import { Lobby } from './types';

const app = express();
const port = process.env.PORT ?? 8080;

let lobbies: { [lobbyCode: string]: Lobby } = {};

app.get('/api/status', (_, res) => {
  res.json({ message: 'Server is running' });
});

app.get('/api/lobbies', (_, res) => {
  let lobbyInfo: { [id: string]: number } = {};
  Object.entries(lobbies).forEach(([_, lobby]) => {
    lobbyInfo[lobby.lobbyCode] = Object.keys(lobby.clients).length;
  })
  res.json({ message: JSON.stringify(lobbyInfo) });
});

app.post('/api/reset', (_, res) => {
  lobbies = {};
  res.json({ message: 'Reset server' });
});

const httpServer = new HttpServer(app);
httpServer.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});

const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws: WebSocket) => {
  ws.on('message', (message: string) => {
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
        let lobby: Lobby;
        try {
          lobby = getLobby(lobbyCode);
        } catch (error) {
          ws.send(JSON.stringify({ type: 'error', message: (error as Error).message }));
          return;
        }

        const clientId = data.clientId;
        if (!clientId) {
          ws.send(JSON.stringify({ type: 'error', message: 'Unable to join lobby, no ID in message' }));
          return;
        }

        addClientToLobby(lobbyCode, clientId, ws);

        lobby.host.send(JSON.stringify({
          type: 'client-connected',
          clientId: clientId
        }));
        break;
      }

      case 'offer': {
        let lobby: Lobby;
        try {
          lobby = getLobby(lobbyCode);
        } catch (error) {
          ws.send(JSON.stringify({ type: 'error', message: (error as Error).message }));
          return;
        }

        const lobbyClients = lobby.clients;
        if (!lobbyClients?.[data.clientId]) {
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
        let lobby: Lobby;
        try {
          lobby = getLobby(lobbyCode);
        } catch (error) {
          ws.send(JSON.stringify({ type: 'error', message: (error as Error).message }));
          return;
        }

        const clientId = data.clientId;
        if (!clientId) {
          ws.send(JSON.stringify({ type: 'error', message: 'Unable to forward answer, no ID in message' }));
          return;
        }

        lobby.host.send(JSON.stringify({
          type: 'answer',
          answer: data.answer,
          clientId: clientId
        }));

        console.log(`Forwarded answer to host of lobby ${lobbyCode}`);
        break;
      }

      case 'ice-candidate-client': {
        let lobby: Lobby;
        try {
          lobby = getLobby(lobbyCode);
        } catch (error) {
          ws.send(JSON.stringify({ type: 'error', message: (error as Error).message }));
          return;
        }

        const clientId = data.clientId;
        if (!clientId) {
          ws.send(JSON.stringify({ type: 'error', message: 'Unable to forward ICE candidate, no ID in message' }));
          return;
        }

        lobby.host.send(JSON.stringify({
          type: 'ice-candidate',
          candidate: data.candidate,
          clientId: clientId
        }));

        console.log(`Forwarded ICE candidate to host from client with id ${clientId} in lobby ${lobbyCode}`);
        break;
      }

      case 'ice-candidate-host': {
        let lobby: Lobby;
        try {
          lobby = getLobby(lobbyCode);
        } catch (error) {
          ws.send(JSON.stringify({ type: 'error', message: (error as Error).message }));
          return;
        }

        const lobbyClients = lobby.clients;
        if (!lobbyClients?.[data.clientId]) {
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
        let lobby: Lobby;
        try {
          lobby = getLobby(lobbyCode);
        } catch (error) {
          ws.send(JSON.stringify({ type: 'error', message: (error as Error).message }));
          return;
        }

        const lobbyClients = lobby.clients;
        if (!lobbyClients?.[data.clientId]) {
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
        let lobby: Lobby;
        try {
          lobby = getLobby(lobbyCode);
        } catch (error) {
          ws.send(JSON.stringify({ type: 'error', message: (error as Error).message }));
          return;
        }

        const lobbyClients = lobby.clients;
        if (!lobbyClients?.[data.clientId]) {
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
      } else {
        for (let id in lobbies[code].clients) {
          if (lobbies[code].clients[id] === ws) {
            removeClientFromLobby(code, id);
          }
        }
      }
    }
  });

  function createLobby(lobbyCode: string, hostWebSocket: WebSocket): void {
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

  function addClientToLobby(lobbyCode: string, clientId: string, clientWebSocket: WebSocket): void {
    const lobby = getLobby(lobbyCode);

    if (lobby.clients[clientId]) {
      throw new Error('Client ID already exists in this lobby');
    }

    lobby.clients[clientId] = clientWebSocket;
    console.log('Client connected');
  }

  function removeClientFromLobby(lobbyCode: string, clientId: string): void {
    const lobby = getLobby(lobbyCode);

    if (lobby.host) {
      lobby.host.send(JSON.stringify({ type: 'client-disconnected', clientId: clientId }));
    }

    delete lobby.clients[clientId];
    console.log('Client disconnected');
  }

  function removeHostFromLobby(lobbyCode: string) {
    broadcastToLobby(lobbyCode, { type: 'error', message: 'Host disconnected' });
    delete lobbies[lobbyCode];
    console.log('Host disconnected');
  }

  function getLobby(lobbyCode: string) {
    if (lobbies[lobbyCode]) {
      return lobbies[lobbyCode];
    } else {
      throw new Error(`Lobby with code ${lobbyCode} does not exist`);
    }
  }

  function broadcastToLobby(lobbyCode: string, message: any) {
    const lobby = getLobby(lobbyCode);
    Object.entries(lobby.clients).forEach(([_, client]) => {
      client.send(JSON.stringify(message));
    })
  }
});

function pingClients() {
  for (let code in lobbies) {
    const lobby = lobbies[code];

    if (lobby.host && lobby.host.readyState === WebSocket.OPEN) {
      lobby.host.ping();
    }

    for (let id in lobby.clients) {
      const client = lobby.clients[id];
      if (client.readyState === WebSocket.OPEN) {
        client.ping();
      }
    }
  }
}

setInterval(pingClients, 30000);