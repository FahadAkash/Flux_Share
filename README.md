# FluxShare

FluxShare is a secure, serverless peer-to-peer (P2P) file sharing application built on Cloudflare Workers and WebRTC. It allows you to transfer files of any size directly between devices without storing them on a server.

**Live Demo:** [fluxshare.fahadakas-batterylowinteractive.workers.dev](https://fluxshare.fahadakas-batterylowinteractive.workers.dev)

## Features

- **P2P Transfer**: Direct browser-to-browser data transfer via WebRTC.
- **End-to-End Encryption**: Files are encrypted using AES-GCM. The key is part of the URL fragment and never sent to the server.
- **Serverless Architecture**: Powered by Cloudflare Workers and Durable Objects for signaling.
- **No File Size Limits**: Since files stream directly between peers, there are no server-imposed size limits.
- **Cross-Platform**: Works on any device with a modern web browser.
- **QR Code Sharing**: Easily join rooms by scanning a QR code.
- **Local Network Optimization**: Prioritizes local connections when possible.

## How It Works

1.  **Create a Room**: Open FluxShare to generate a unique, secure room.
2.  **Share**: Send the Room Link or show the QR code to the receiver.
3.  **Connect**: Once the receiver joins, a secure P2P connection is established.
4.  **Transfer**: Drag and drop files to send them instantly.

## Architecture

FluxShare utilizes a modern, edge-first stack:

*   **Signaling Server**: Hosted on Cloudflare Workers using [Hono](https://hono.dev/).
*   **State Management**: [Cloudflare Durable Objects](https://developers.cloudflare.com/durable-objects/) manage room state and WebSocket connections for signaling.
*   **Frontend**: Built with [React](https://react.dev/) and [Vite](https://vitejs.dev/) for fast, SSR-enabled delivery.
*   **P2P Layer**: [WebRTC](https://webrtc.org/) DataChannels for file transmission.

## Development

### Prerequisites

*   [Node.js](https://nodejs.org/) (v18+ recommended)
*   [npm](https://www.npmjs.com/)

### Installation

Clone the repository and install dependencies:

```bash
npm install
```

### Local Development

Start the local development server:

```bash
npm run dev
```

The application will be available at `http://localhost:5173`.

### Deployment

To deploy to your own Cloudflare account:

1.  Ensure you have [Wrangler](https://developers.cloudflare.com/workers/wrangler/install-and-update/) installed and authenticated.
2.  Run the deploy script:

```bash
npm run deploy
```

## Configuration

The project uses a `wrangler.jsonc` file for Cloudflare configuration. You may need to update the `name` or `account_id` fields if deploying to a different environment.

## License

MIT
