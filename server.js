const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");
const os = require("os");

const port = Number(process.env.PORT || 3000);
const root = __dirname;
const clients = new Set();
const roles = new Map();

const wins = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

let state = freshGame();

function freshGame(score = { X: 0, O: 0 }) {
  return {
    board: Array(9).fill(""),
    currentPlayer: "X",
    score,
    roundOver: false,
    message: null,
  };
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".ico": "image/x-icon",
    ".json": "application/json; charset=utf-8",
  }[ext] || "application/octet-stream";
}

function ipToNumber(address) {
  return address.split(".").reduce((total, part) => total * 256 + Number(part), 0);
}

function connectionCode(address) {
  return `${String(ipToNumber(address)).padStart(10, "0")}${String(port).padStart(5, "0")}`;
}

function isPrivateAddress(address) {
  const [first, second] = address.split(".").map(Number);
  return first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
}

function codePayload() {
  const addresses = localAddresses().sort((a, b) => Number(isPrivateAddress(b)) - Number(isPrivateAddress(a)));
  const codes = addresses.map((address) => ({
    address,
    url: `http://${address}:${port}`,
    code: connectionCode(address),
  }));

  return {
    port,
    code: codes[0]?.code || null,
    codes,
  };
}

function serveFile(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);

  if (urlPath === "/connection-code") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(codePayload()));
    return;
  }

  const requested = urlPath === "/" ? "/velha.html" : urlPath;
  const filePath = path.normalize(path.join(root, requested));

  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("Acesso negado");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Arquivo nao encontrado");
      return;
    }

    res.writeHead(200, { "Content-Type": contentType(filePath) });
    res.end(data);
  });
}

function assignPlayer() {
  const used = new Set([...roles.values()].filter(Boolean));
  if (!used.has("X")) {
    return "X";
  }
  if (!used.has("O")) {
    return "O";
  }
  return null;
}

function encodeFrame(message) {
  const payload = Buffer.from(message);
  const header = [];
  header.push(0x81);

  if (payload.length < 126) {
    header.push(payload.length);
  } else if (payload.length < 65536) {
    header.push(126, (payload.length >> 8) & 255, payload.length & 255);
  } else {
    header.push(127, 0, 0, 0, 0, (payload.length >> 24) & 255, (payload.length >> 16) & 255, (payload.length >> 8) & 255, payload.length & 255);
  }

  return Buffer.concat([Buffer.from(header), payload]);
}

function decodeFrames(buffer) {
  const messages = [];
  let offset = 0;

  while (offset + 2 <= buffer.length) {
    const first = buffer[offset++];
    const second = buffer[offset++];
    const opcode = first & 0x0f;
    const masked = Boolean(second & 0x80);
    let length = second & 0x7f;

    if (length === 126) {
      if (offset + 2 > buffer.length) break;
      length = buffer.readUInt16BE(offset);
      offset += 2;
    } else if (length === 127) {
      if (offset + 8 > buffer.length) break;
      const high = buffer.readUInt32BE(offset);
      const low = buffer.readUInt32BE(offset + 4);
      length = high * 2 ** 32 + low;
      offset += 8;
    }

    const mask = masked ? buffer.subarray(offset, offset + 4) : null;
    offset += masked ? 4 : 0;

    if (offset + length > buffer.length) break;

    const payload = buffer.subarray(offset, offset + length);
    offset += length;

    if (opcode === 8) {
      messages.push({ type: "close" });
      continue;
    }

    if (opcode !== 1) {
      continue;
    }

    if (mask) {
      for (let index = 0; index < payload.length; index++) {
        payload[index] ^= mask[index % 4];
      }
    }

    messages.push({ type: "text", text: payload.toString("utf8") });
  }

  return messages;
}

function send(socket, payload) {
  if (!socket.destroyed) {
    socket.write(encodeFrame(JSON.stringify(payload)));
  }
}

function publicState() {
  return {
    board: state.board,
    currentPlayer: state.currentPlayer,
    score: state.score,
    roundOver: state.roundOver,
    message: state.message,
  };
}

function broadcast() {
  for (const socket of clients) {
    send(socket, { type: "state", state: publicState() });
  }
}

function finishRound(message, type, winner) {
  state.roundOver = true;
  state.message = { text: message, type };
  if (winner) {
    state.score[winner]++;
  }
}

function handleMove(socket, index) {
  const player = roles.get(socket);

  if (!Number.isInteger(index) || index < 0 || index > 8 || !player || state.roundOver || player !== state.currentPlayer || state.board[index]) {
    return;
  }

  state.board[index] = player;

  const won = wins.some(([a, b, c]) => state.board[a] && state.board[a] === state.board[b] && state.board[b] === state.board[c]);
  if (won) {
    finishRound(`Jogador <strong>${player}</strong> venceu!`, "success", player);
    broadcast();
    return;
  }

  if (!state.board.includes("")) {
    finishRound("Empate! Ninguem venceu esta rodada.", "warning");
    broadcast();
    return;
  }

  state.currentPlayer = player === "X" ? "O" : "X";
  state.message = null;
  broadcast();
}

function handleMessage(socket, message) {
  let data;

  try {
    data = JSON.parse(message);
  } catch {
    return;
  }

  if (data.type === "move") {
    handleMove(socket, Number(data.index));
  }

  if (data.type === "newRound") {
    state = freshGame(state.score);
    broadcast();
  }

  if (data.type === "newGame") {
    state = freshGame();
    broadcast();
  }
}

function localAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((item) => item && item.family === "IPv4" && !item.internal)
    .map((item) => item.address);
}

const server = http.createServer(serveFile);

server.on("upgrade", (req, socket) => {
  if (req.headers.upgrade?.toLowerCase() !== "websocket") {
    socket.destroy();
    return;
  }

  const accept = crypto
    .createHash("sha1")
    .update(`${req.headers["sec-websocket-key"]}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");

  socket.write(
    [
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${accept}`,
      "",
      "",
    ].join("\r\n")
  );

  clients.add(socket);
  roles.set(socket, assignPlayer());
  send(socket, { type: "welcome", player: roles.get(socket), state: publicState() });

  socket.on("data", (buffer) => {
    for (const frame of decodeFrames(buffer)) {
      if (frame.type === "close") {
        socket.end();
        return;
      }
      handleMessage(socket, frame.text);
    }
  });

  socket.on("close", () => {
    clients.delete(socket);
    roles.delete(socket);
  });

  socket.on("error", () => {
    clients.delete(socket);
    roles.delete(socket);
  });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Servidor do Jogo da Velha rodando em http://localhost:${port}`);
  for (const item of codePayload().codes) {
    console.log(`Codigo para conectar: ${item.code} (${item.url})`);
  }
});
