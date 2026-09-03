# CollabEdit

A local-first collaborative text editor designed to run directly from GitHub Pages.

## Features

- Shareable rooms encoded in the URL path
- Real-time synchronization through Yjs WebSocket transport
- Shared state powered by Yjs
- Local browser persistence through IndexedDB
- Participant presence and editable display names
- No accounts or application database
- Responsive desktop and mobile interface with visible connection state

## How it works

GitHub Pages serves the static HTML, CSS, and JavaScript. Each room has a stable path such as `/collabedit/HK9YGF`. The client creates a Yjs document for that room, retains a local copy in IndexedDB, and synchronizes live updates through `y-websocket`.

The hosted demo currently uses the public Yjs WebSocket demo endpoint at `wss://demos.yjs.dev/ws`. This avoids the unreliable public `y-webrtc` signaling path that could leave rooms stuck at `Connecting…`, but the public demo endpoint is not intended as production infrastructure. Replace `WEBSOCKET_SERVER` in `app.js` with a controlled Yjs-compatible WebSocket service for production use.

The connection indicator distinguishes connecting, synchronizing, connected, reconnecting, offline, and unavailable states. Participant presence continues to use Yjs awareness.

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
- The public Yjs demo WebSocket endpoint provides live synchronization but should not be treated as durable remote storage.
- Availability of the hosted demo depends on the public synchronization endpoint until a dedicated service is configured.
- This prototype loads pinned packages from `esm.sh`; a production deployment may vendor them locally.

## Development

Because the application uses JavaScript modules, run it through a local HTTP server rather than opening `index.html` directly:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.
