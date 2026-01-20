# FluxShare

<div align="center">
  <img src="public/image.png" alt="FluxShare Logo" width="100%" style="border-radius: 10px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);" />

  <br />
  <br />

  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
  [![Cloudflare Workers](https://img.shields.io/badge/Cloudflare_Workers-F38020?style=flat-square&logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
  [![Hono](https://img.shields.io/badge/Hono-E36002?style=flat-square&logo=hono&logoColor=white)](https://hono.dev/)
  [![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
  [![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)

  <p>
    <b>Secure, Serverless, Peer-to-Peer File Sharing.</b>
    <br />
    Transfer files of any size directly between devices. No servers. No limits. No logs.
  </p>

  <p>
    <a href="https://fluxshare.fahadakas-batterylowinteractive.workers.dev"><strong>🚀 View Live Demo</strong></a>
    ·
    <a href="https://github.com/FahadAkash/Flux_Share/issues">🪲 Report Bug</a>
    ·
    <a href="https://github.com/FahadAkash/Flux_Share/issues">💡 Request Feature</a>
  </p>
</div>

<br />

## 📋 Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Security Model](#security-model)
- [Architecture & Tech Stack](#architecture--tech-stack)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Local Development](#local-development)
- [Deployment](#deployment)
- [Configuration](#configuration)
- [Project Structure](#project-structure)
- [Contributing](#contributing)
- [License](#license)

---

## � Overview

**FluxShare** is a next-generation file sharing tool designed for the privacy-conscious Web. It eliminates the middleman by establishing a direct **Peer-to-Peer (P2P)** connection between the sender and receiver using WebRTC.

Unlike traditional services, FluxShare **never stores your files**. The server acts only as a signaling relay to establish connections. Once connected, data flows directly between browsers, encrypted and fast.

## ✨ Key Features

- **🔒 End-to-End Encryption**: 
  - Each session generates a unique encryption key.
  - The key is stored in the URL fragment (`#`) and is **never sent to the server**.
  - Files are encrypted using **AES-GCM** before transmission.
  
- **⚡ Blazing Fast P2P**: 
  - Direct browser-to-browser transfer via **WebRTC DataChannels**.
  - No bandwidth throttling or server bottlenecks.
  - **Local Network Optimization**: Transfers happen over LAN if devices are on the same network.

- **☁️ 100% Serverless**: 
  - Built on **Cloudflare Workers**.
  - Signaling handled by **Durable Objects**.
  - Zero infrastructure management.

- **♾️ No Limits**: 
  - **No File Size Limit**: Stream gigabytes or terabytes directly.
  - **Cross-Platform**: Works on any modern browser (Chrome, Firefox, Safari, Edge).

- **📱 User Friendly**: 
  - Instant Room Creation.
  - **QR Code** support for easy mobile sharing.
  - Drag-and-drop interface.

## 🛡️ Security Model

FluxShare is built with a "trust-no-one" architecture:

1.  **Ephemeral Rooms**: Rooms are temporary and exist only as long as the connection is active.
2.  **Fragment-Based Security**: The encryption/decryption key is contained in the URL hash (fragment). Browsers strictly do not send the fragment to the server.
3.  **Transient Signaling**: The Cloudflare Worker only relays WebRTC offer/answer signals. It does not inspect or store payload data.

## 🛠️ Architecture & Tech Stack

This project leverages the "Edge-First" paradigm for minimum latency and maximum scalability.

| Component | Technology | Description |
| :--- | :--- | :--- |
| **Runtime** | [Cloudflare Workers](https://workers.cloudflare.com/) | Global serverless execution environment. |
| **Framework** | [Hono](https://hono.dev/) | Ultrafast web framework for the Edges. |
| **State** | [Durable Objects](https://developers.cloudflare.com/durable-objects/) | Manages WebSocket connections and signaling state. |
| **Frontend** | [Vite](https://vitejs.dev/) + [Hono JSX](https://hono.dev/guides/jsx) | Server-Side Rendering (SSR) with hydration. |
| **P2P** | [WebRTC](https://webrtc.org/) | Real-time communication standard for data. |
| **Language** | [TypeScript](https://www.typescriptlang.org/) | Type-safe development across the full stack. |

## 🚀 Getting Started

### Prerequisites

Ensure you have the following installed:
- **[Node.js](https://nodejs.org/)** (v18.17.1 or later)
- **[npm](https://www.npmjs.com/)**

### Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/FahadAkash/Flux_Share.git
    cd Flux_Share
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

### Local Development

Start the development server with hot-reload:

```bash
npm run dev
```

- App URL: `http://localhost:5173`
- The backend runs on Cloudflare Workers environment locally via Miniflare (integrated into Vite).

## ☁️ Deployment

Deploying to Cloudflare is seamless.

1.  **Login to Cloudflare:**
    ```bash
    npx wrangler login
    ```

2.  **Deploy:**
    ```bash
    npm run deploy
    ```
    This command builds the assets and pushes the Worker to your Cloudflare account.

## ⚙️ Configuration

The project is configured via `wrangler.jsonc`.

- **Rate Limits**: Configured to prevent abuse on room creation (`ROOM_RATE_LIMITER`).
- **Durable Objects**: The `Room` class is bound to the `ROOM` namespace.
- **Assets**: Static assets from `./dist/client` are served automatically.

To customize:
1.  Open `wrangler.jsonc`.
2.  Update `name` or `account_id` if using a specific Cloudflare account.
3.  Adjust `ratelimits` if you need higher throughput for room creation.

## 📂 Project Structure

```
Flux_Share/
├── src/
│   ├── client/           # Client-side hydration & logic
│   ├── ui/               # JSX UI Components (Shared/SSR)
│   ├── i18n/             # Internationalization
│   ├── room.ts           # Durable Object (Signaling flow)
│   └── index.tsx         # Main Hono App (Worker Entry)
├── public/               # Static assets (images, favicon)
├── wrangler.jsonc        # Cloudflare configuration
└── vite.config.ts        # Vite build configuration
```

## 🤝 Contributing

Contributions are what make the open-source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

1.  Fork the Project
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the Branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.
