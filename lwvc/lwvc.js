let ws = null;
let pingInterval = null;

function base64UrlEncode(bytes) {
    let str = "";
    for (const b of bytes) {
        str += String.fromCharCode(b);
    }
    return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function signJwt(secret) {
    const header = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
    const payload = base64UrlEncode(new TextEncoder().encode(JSON.stringify({})));
    const data = `${header}.${payload}`;

    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );

    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
    return `${data}.${base64UrlEncode(new Uint8Array(sig))}`;
}

async function connectToWssc() {
    let serverAddr = document.getElementById("serverAddr").value;
    let serverPort = document.getElementById("serverPort").value;
    let vsicName = document.getElementById("vsicName").value;
    let jwtSecret = document.getElementById("jwtSecret").value;

    if (!jwtSecret) {
        printLine("[lwvc] jwt secret is required");
        return;
    }

    const useTls = document.getElementById("useTls").checked;
    const protocol = useTls ? "wss" : "ws";

    let token;
    try {
        token = await signJwt(jwtSecret);
    } catch (err) {
        console.error("[lwvc] failed to sign jwt: ", err);
        printLine("[lwvc] failed to sign jwt");
        return;
    }

    ws = new WebSocket(`${protocol}://${serverAddr}:${serverPort}/?token=${encodeURIComponent(token)}`);

    ws.onopen = () => {
        console.log("[lwvc] successfully opened connection to wssc server");

        ws.send(JSON.stringify({
            type: "hello",
            data: vsicName
        }));

        pingInterval = setInterval(() => {
            if (ws?.readyState === WebSocket.OPEN) {
                console.log("ping")
                ws.send(JSON.stringify({ type: "ping" }));
            }
        }, 30000);
    };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            handleWsMessage(data);
        } catch (err) {
            console.error("[lwvc] invalid json: ", event.data);
        }
    };

    ws.onclose = () => {
        console.log("[lwvc] disconnected from websocket");

        if (pingInterval) {
            clearInterval(pingInterval);
            pingInterval = null;
        }

        ws = null;
    };

    ws.onerror = (err) => {
        console.error("[lwvc] websocket error: ", err);
    };
}

function sendMessage(msg) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.error("[lwvc] ws not ready");
        return;
    }

    ws.send(JSON.stringify({ type: "msg", data: msg }));
}

function handleWsMessage(msg) {
    switch (msg.type) {
        case "connected":
            break;
        case "hello":
            console.log("[lwvc] server echoed hello with name: ", msg.data);
            printLine(`[lwvc] connected with username ${msg.data}`)
            break;

        case "motd":
            console.log(`[lwvc] recieved motd line: ${msg.data}`);
            printLine(msg.data)
            break;

        case "msg":
            printLine(msg.data)
            break;

        case "pong":
            break;

        case "cya":
            break;

        case "error":
            console.error(msg.data);
            printLine(msg.data)
            break;

        default:
            console.warn("Unknown message type:", msg);
    }
}

function printLine(text) {
    const log = document.getElementById("messages");

    const line = document.createElement("div");
    line.textContent = text;

    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
}

document.getElementById("send").addEventListener("keydown", (e) => {
    if (e.key !== "Enter") {
        return;
    }

    e.preventDefault();

    const input = e.target;
    const msg = input.value.trim();
    if (!msg) {
        return;
    }

    sendMessage(msg);
    input.value = "";
});