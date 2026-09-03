# CollabEdit

A backendless, local-first collaborative text editor designed to run directly from GitHub Pages.

## Features

- Shareable rooms encoded in the URL path
- Direct browser-to-browser synchronization over WebRTC
- Shared state powered by Yjs
- Local browser persistence through IndexedDB
- Participant presence and editable display names
- No accounts, application server, or document database
- Responsive desktop and mobile interface with visible connection state

## How it works

GitHub Pages serves the static HTML, CSS, and JavaScript. Each room has a stable path such as `/collabedit/HK9YGF`. The client creates a Yjs document for that room and retains a local copy in IndexedDB.

Live collaboration uses `y-webrtc`. Public signaling servers are contacted only so two browsers can exchange WebRTC offers, answers, and ICE candidates and discover each other. Once the connection is established, document updates are exchanged directly between the browsers; the signaling servers are not document storage and are not in the document data path.

The room ID is also used as the `y-webrtc` password so signaling messages are encrypted for that room. The prototype currently uses the public Fly.io Yjs signaling endpoints in Europe and the US for redundancy.

The connection indicator is deliberately peer-aware:

- **Connecting / Finding peers** — the WebRTC provider is starting and looking for signaling connectivity.
- **P2P ready · waiting for peer** — signaling is available, but no other participant is currently connected.
- **Connected · N online** — at least one real peer/presence connection exists.
- **Signaling unavailable** — no public signaling endpoint became reachable within the timeout.
- **Offline · local editing** — the browser is offline; IndexedDB editing continues locally.

This avoids treating the `y-webrtc` provider `status` event as proof that another peer is connected. That event only indicates that the provider is active and looking for peers.

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
- A new browser can receive the current document only while another participant holding that document is online.
- Public signaling availability affects whether new peers can discover one another.
- WebRTC connectivity may still be restricted by strict NATs, corporate firewalls, or browser privacy/network policies because this prototype does not provide a TURN relay.
- This prototype loads pinned packages from `esm.sh`; a production deployment may vendor them locally.

## Development

Because the application uses JavaScript modules, run it through a local HTTP server rather than opening `index.html` directly:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.
