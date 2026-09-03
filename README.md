# CollabEdit

A backendless, local-first collaborative text editor designed to run directly from GitHub Pages.

## Features

- Shareable rooms encoded in the URL path
- Direct browser-to-browser synchronization over WebRTC
- Shared state powered by Yjs
- Local browser persistence through IndexedDB
- Participant presence and editable display names
- No accounts, application server, document server, or database
- Responsive desktop and mobile interface with visible connection state

## How it works

GitHub Pages serves the static HTML, CSS, and JavaScript. Each room has a stable path such as `/collabedit/HK9YGF`. The client creates a Yjs document for that room and retains a local copy in IndexedDB.

CollabEdit does not use `y-webrtc`. Cross-device WebRTC still needs a rendezvous mechanism so browsers can exchange SDP and ICE information before the direct connection exists. CollabEdit uses Trystero's MQTT strategy with multiple independent public secure-WebSocket brokers for this discovery step.

The brokers never carry the shared document. After two browsers discover one another, Yjs document state, incremental updates, presence, and cursor information are sent directly over the WebRTC data channel. Trystero encrypts discovery/session data and WebRTC transport is encrypted end to end.

When a peer joins, each side sends its current Yjs state. Yjs merges the states, then subsequent local Yjs updates are broadcast directly to connected peers. IndexedDB continues to provide local persistence when no peer is online.

The connection indicator distinguishes:

- **Finding peers…** — peer discovery is starting.
- **Waiting for peer** — at least one discovery broker is reachable, but nobody else is connected to the room.
- **Connected · N online** — one or more direct WebRTC peers are connected.
- **Discovery unavailable** — no discovery broker became reachable within the timeout.
- **P2P connection failed** — peers found one another, but WebRTC negotiation could not establish a direct connection.
- **Offline · local editing** — the browser is offline; local IndexedDB editing continues.

## Why not pure WebRTC with only a room code?

A browser cannot derive another browser's SDP/ICE information from a six-character room code. Cross-device WebRTC therefore always needs one of these:

- a signaling/rendezvous service,
- a decentralized or multi-broker relay/tracker network,
- or manual offer/answer exchange between users.

The first version of CollabEdit appeared to require no third-party service because `y-webrtc` configured its public signaling service internally. The application itself did not configure or host a backend, but peer discovery still depended on that hidden signaling infrastructure.

## GitHub Pages deployment

1. Open **Settings → Pages** in this repository.
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Select the `main` branch and `/ (root)` folder.
4. Save the configuration.

The site will become available at:

```text
https://bpstr.github.io/collabedit/
```

Opening the site creates a room automatically. Use **Copy link** to invite another participant.

## Privacy and limitations

- Anyone who receives a room URL can join that room.
- Documents are cached locally in each participant's browser through IndexedDB.
- A new browser can receive the current document only while another participant holding that state is online.
- Peer discovery depends on Trystero's public MQTT broker set, but CollabEdit does not operate or require its own backend.
- Strict NATs, corporate firewalls, carrier networks, or browser policies can prevent a direct WebRTC connection. A TURN relay would be required for those cases.
- This prototype loads pinned packages from `esm.sh`; a production deployment may vendor them locally.

## Development

Because the application uses JavaScript modules, run it through a local HTTP server rather than opening `index.html` directly:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.
