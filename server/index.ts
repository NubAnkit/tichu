/**
 * Tichu game server: serves the built client (dist/) and hosts online lobbies over
 * WebSocket at /ws. Run `npm run build && npm start`, or `npm run dev:server` next
 * to `npm run dev` while developing.
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { ClientMsg, ServerMsg, makeCode } from '../src/net/protocol';
import { Room, RoomRegistry } from '../src/net/room';

export function startServer(port: number, opts: { speed?: number; staticDir?: string } = {}) {
  const registry = new RoomRegistry({ speed: opts.speed }, makeCode);
  const staticDir = opts.staticDir;
  const types: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.json': 'application/json',
  };

  const http = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, rooms: registry.rooms.size }));
      return;
    }
    if (!staticDir) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    let file = normalize(join(staticDir, decodeURIComponent(url.pathname)));
    if (!file.startsWith(normalize(staticDir))) {
      res.writeHead(403);
      res.end();
      return;
    }
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(staticDir, 'index.html');
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });

  const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: 16 * 1024 });
  wss.on('connection', (ws: WebSocket) => {
    let room: Room | null = null;
    let memberId: string | null = null;
    const send = (m: ServerMsg) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
    };
    ws.on('message', (raw) => {
      let msg: ClientMsg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return send({ t: 'error', message: 'Bad message' });
      }
      try {
        if (msg.t === 'create' || msg.t === 'join') {
          if (room && memberId) room.disconnect(memberId);
          const code = msg.t === 'join' ? String(msg.code ?? '').toUpperCase().trim() : '';
          const r = msg.t === 'create' ? registry.create() : registry.get(code);
          if (!r) return send({ t: 'error', message: `No lobby with code ${code}` });
          room = r;
          memberId = r.join(String(msg.name ?? ''), send, msg.t === 'join' ? msg.token : undefined).id;
          return;
        }
        if (!room || !memberId) return send({ t: 'error', message: 'Join a lobby first' });
        if (msg.t === 'leave') {
          room.leave(memberId);
          room = null;
          memberId = null;
          return;
        }
        room.handle(memberId, msg);
      } catch (e) {
        console.error('error handling message', e);
        send({ t: 'error', message: 'Server error' });
      }
    });
    ws.on('close', () => {
      if (room && memberId) room.disconnect(memberId);
    });
  });

  const sweeper = setInterval(() => registry.sweep(), 60_000);
  http.listen(port);
  return {
    http,
    registry,
    close: () =>
      new Promise<void>((resolve) => {
        clearInterval(sweeper);
        for (const r of registry.rooms.values()) r.dispose();
        for (const c of wss.clients) c.terminate();
        wss.close();
        http.close(() => resolve());
      }),
  };
}

const isMain = process.argv[1] && /server[\\/]index\.ts$/.test(process.argv[1]);
if (isMain) {
  const port = Number(process.env.PORT ?? 8787);
  const dist = join(process.cwd(), 'dist');
  startServer(port, { staticDir: existsSync(dist) ? dist : undefined });
  console.log(`Tichu server on http://localhost:${port}${existsSync(dist) ? '' : ' (no dist/ — run npm run build to serve the client)'}`);
}
