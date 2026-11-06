'use strict';
/* Thin PeerJS wrapper: one host, up to 3 clients, all peer-to-peer.
   The only server involved is PeerJS's free public "matchmaking" broker, used just to
   introduce browsers to each other. Game traffic flows directly between players. */
const Net = {
  peer: null, role: null, code: null,
  conns: {},          // host: connId -> DataConnection
  hostConn: null,     // client: connection to host
  cb: {},

  // Dev/testing hook:  ?signal=localhost:9000  points at a local `peerjs` server.
  peerOpts() {
    const o = { debug: 1, config: { iceServers: [
      { urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' }] } };
    const sig = new URLSearchParams(location.search).get('signal');
    if (sig) { const [h, p] = sig.split(':'); o.host = h; o.port = +p; o.path = '/'; o.secure = false; }
    return o;
  },

  makeCode() {
    const A = 'ABCDEFGHJKMNPQRSTUVWXYZ';           // no I / L / O to avoid mix-ups
    let s = ''; for (let i = 0; i < 4; i++) s += A[Math.floor(Math.random() * A.length)];
    return s;
  },

  // ----- host -----
  host(cb, tries = 0) {
    this.close(); this.cb = cb; this.role = 'host';
    const code = this.makeCode();
    const peer = this.peer = new Peer('ocl-' + code, this.peerOpts());
    peer.on('open', () => { this.code = code; cb.onOpen && cb.onOpen(code); });
    peer.on('connection', (conn) => {
      conn.on('open', () => { this.conns[conn.peer] = conn; cb.onJoin && cb.onJoin(conn.peer, conn); });
      conn.on('data', (m) => cb.onMsg && cb.onMsg(conn.peer, m));
      const gone = () => { if (this.conns[conn.peer] === conn) { delete this.conns[conn.peer]; cb.onLeave && cb.onLeave(conn.peer); } };
      conn.on('close', gone); conn.on('error', gone);
    });
    peer.on('error', (err) => {
      if (err.type === 'unavailable-id' && tries < 8) { peer.destroy(); this.host(cb, tries + 1); return; }
      cb.onError && cb.onError(err);
    });
    peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) { /* ignore */ } });
  },

  // ----- client -----
  join(code, cb) {
    this.close(); this.cb = cb; this.role = 'client'; this.code = code;
    const peer = this.peer = new Peer(undefined, this.peerOpts());
    let opened = false;
    const timer = setTimeout(() => { if (!opened) cb.onError && cb.onError({ type: 'timeout' }); }, 15000);
    peer.on('open', () => {
      const conn = this.hostConn = peer.connect('ocl-' + code, { reliable: true, serialization: 'json' });
      conn.on('open', () => { opened = true; clearTimeout(timer); cb.onOpen && cb.onOpen(); });
      conn.on('data', (m) => cb.onMsg && cb.onMsg(m));
      conn.on('close', () => cb.onClose && cb.onClose());
      conn.on('error', () => cb.onClose && cb.onClose());
    });
    peer.on('error', (err) => { clearTimeout(timer); cb.onError && cb.onError(err); });
  },

  sendHost(msg) { const c = this.hostConn; if (c && c.open) c.send(msg); },
  sendTo(id, msg) { const c = this.conns[id]; if (c && c.open) c.send(msg); },
  broadcast(msg) { for (const id in this.conns) { const c = this.conns[id]; if (c.open) c.send(msg); } },
  kick(id) { const c = this.conns[id]; if (c) { delete this.conns[id]; setTimeout(() => c.close(), 200); } },

  close() {
    try { if (this.peer) this.peer.destroy(); } catch (e) { /* ignore */ }
    this.peer = null; this.role = null; this.conns = {}; this.hostConn = null; this.cb = {};
  },
};
