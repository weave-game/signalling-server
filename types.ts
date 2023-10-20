import type WebSocket from 'ws'

export interface Lobby {
  lobbyCode: string
  host: WebSocket
  clients: Record<string, WebSocket>
}
