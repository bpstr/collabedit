# CollabEdit

A backendless collaborative text editor designed to run directly from GitHub Pages.

## Features

- Shareable rooms encoded in the URL fragment
- Peer-to-peer synchronization with WebRTC
- Shared state powered by Yjs
- Local browser persistence through IndexedDB
- Participant presence and editable display names
- No accounts, application server, or database
- Responsive desktop and mobile interface

## How it works

GitHub Pages serves the static HTML, CSS, and JavaScript. The room identifier is stored after `#` in the URL, so it is not sent to the web server. Browsers use `y-webrtc` signaling infrastructure to discover peers, then synchronize a Yjs document over WebRTC. A local copy is retained in IndexedDB.

The public signaling service is used only for peer discovery. For stronger availability guarantees, configure your own compatible signaling server in `app.js`.

## GitHub Pages deployment

1. Open **Settings → Pages** in this repository.
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Select the `main` branch and `/ (root)` folder.
4. Save the configuration.

The site will become available at:

```text
https://bpstr.github.io/collabedit/
```

Opening the site creates a room automatically. Use **Copy invite link** to invite another participant.

## Privacy and limitations

- Anyone who receives a room URL can join that room.
- Documents are cached locally in each participant's browser.
- A participant must be online for a new browser with no cached copy to receive the current document.
- WebRTC connectivity can be restricted by some corporate networks, firewalls, or browser privacy settings.
- This prototype loads pinned packages from `esm.sh`; a production deployment may vendor them locally.

## Development

Because the application uses JavaScript modules, run it through a local HTTP server rather than opening `index.html` directly:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.
