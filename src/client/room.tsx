/** @jsxImportSource hono/jsx/dom */
/**
 * Room client app for Pairlane.
 * See README.md; pairs with src/ui/room.tsx.
 */

import { render, useCallback, useEffect, useMemo, useRef, useState } from "hono/jsx/dom";
import * as QRCode from "qrcode";
import { getT } from "../i18n/client";

type RoomRole = "offerer" | "answerer" | null;

type RoomMessage =
  | { type: "role"; role: "offerer" | "answerer"; cid: string }
  | { type: "peers"; count: number }
  | { type: "wait"; position?: number }
  | { type: "start"; peerId?: string }
  | { type: "peer-left"; peerId: string }
  | { type: "offer"; from: string; sid: number; sdp: RTCSessionDescriptionInit }
  | { type: "answer"; from: string; sid: number; sdp: RTCSessionDescriptionInit }
  | { type: "candidate"; from: string; sid: number; candidate: RTCIceCandidateInit };

type SignalOut =
  | { type: "offer"; to: string; sid: number; sdp: RTCSessionDescriptionInit }
  | { type: "answer"; to: string; sid: number; sdp: RTCSessionDescriptionInit }
  | { type: "candidate"; to: string; sid: number; candidate: RTCIceCandidateInit };

type ClientMessage = SignalOut | { type: "transfer-done"; peerId: string };

type IncomingMeta = {
  type: "meta";
  name: string;
  size: number;
  mime: string;
  encrypted: boolean;
};

type DoneMessage = { type: "done" };

type BatchMeta = { type: "batch"; totalFiles: number; totalSize: number };

type DataMessage = IncomingMeta | DoneMessage | BatchMeta;

type OutgoingMeta = IncomingMeta;

type PendingCandidate = { sid: number; candidate: RTCIceCandidateInit };

type AnyWebSocket = WebSocket;

type DataChannel = RTCDataChannel;

type BufferLike = ArrayBuffer | Blob;

type RoomCryptoKey = CryptoKey | null;

type DownloadInfo = {
  url: string;
  name: string;
  size: number;
};

type OffererPeer = {
  peerId: string;
  pc: RTCPeerConnection;
  dc: DataChannel | null;
  signalSid: number;
  activeSid: number | null;
  remoteDescSet: boolean;
  pendingCandidates: PendingCandidate[];
  offerInFlight: boolean;
  sending: boolean;
  sent: boolean;
};

const clientId = getClientId();
const t = getT();

const root = document.querySelector("main.container");
const roomId = document.body.dataset.roomId;
const roomMaxConcurrent = Number.parseInt(document.body.dataset.maxConcurrent || "", 10);
const maxConcurrent = Number.isFinite(roomMaxConcurrent) ? roomMaxConcurrent : 3;
if (root && roomId && document.getElementById("roomView")) {
  render(<RoomApp roomId={roomId} maxConcurrent={maxConcurrent} />, root as HTMLElement);
}

type RoomAppProps = {
  roomId: string;
  maxConcurrent: number;
};

function RoomApp({ roomId, maxConcurrent }: RoomAppProps) {
  const [status, setStatus] = useState(t.status.initializing);
  const [role, setRole] = useState<RoomRole>(null);
  const [peers, setPeers] = useState(0);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [currentFileIndex, setCurrentFileIndex] = useState(-1);
  const [sendProgress, setSendProgress] = useState({ sent: 0, total: 0 });
  const [recvProgress, setRecvProgress] = useState({ got: 0, total: 0 });
  const [downloads, setDownloads] = useState<DownloadInfo[]>([]);
  const [dropHover, setDropHover] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [qrCode, setQrCode] = useState<string>("");

  useEffect(() => {
    QRCode.toDataURL(window.location.href, { margin: 2, scale: 8 })
      .then(url => setQrCode(url))
      .catch(err => console.error("QR Error", err));
  }, []);

  const roleRef = useRef<RoomRole>(role);
  const peersRef = useRef(peers);
  const selectedFilesRef = useRef<File[]>([]);
  const sendIntentRef = useRef(false);
  const wsRef = useRef<AnyWebSocket | null>(null);
  const cryptoKeyRef = useRef<RoomCryptoKey>(null);

  const offererPeersRef = useRef<Map<string, OffererPeer>>(new Map());

  const receiverPcRef = useRef<RTCPeerConnection | null>(null);
  const receiverDcRef = useRef<DataChannel | null>(null);
  const receiverPeerIdRef = useRef<string | null>(null);
  const receiverRemoteDescSetRef = useRef(false);
  const receiverPendingCandidatesRef = useRef<PendingCandidate[]>([]);
  const receiverActiveSidRef = useRef<number | null>(null);

  const incomingMetaRef = useRef<IncomingMeta | null>(null);
  const recvChunksRef = useRef<Uint8Array[]>([]);
  const recvBytesRef = useRef(0);
  const downloadUrlRef = useRef<string | null>(null);

  useEffect(() => {
    roleRef.current = role;
    // Add body class for receiver mode styling (affects header etc.)
    if (role === "answerer") {
      document.body.classList.add("receiverMode");
    } else {
      document.body.classList.remove("receiverMode");
    }
  }, [role]);

  useEffect(() => {
    peersRef.current = peers;
  }, [peers]);

  useEffect(() => {
    if (selectedFiles) {
      selectedFilesRef.current = selectedFiles;
    }
  }, [selectedFiles]);

  const resetPeerSends = useCallback(() => {
    if (!offererPeersRef.current) return;
    const peers = offererPeersRef.current;
    if (!peers) return;
    for (const peer of peers.values()) {
      peer.sent = false;
      peer.sending = false;
    }
  }, []);

  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback(() => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToastVisible(true);
    toastTimeoutRef.current = setTimeout(() => {
      setToastVisible(false);
    }, 2000);
  }, []);

  const handleCopyLink = useCallback(() => {
    copyText(location.href);
    showToast();
  }, [showToast]);

  const handleCopyCode = useCallback(() => {
    copyText(roomId);
    showToast();
  }, [roomId, showToast]);

  const handleDragOver = useCallback((ev: DragEvent) => {
    ev.preventDefault();
    setDropHover(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDropHover(false);
  }, []);

  const handleDrop = useCallback((ev: DragEvent) => {
    ev.preventDefault();
    setDropHover(false);
    const incoming = Array.from(ev.dataTransfer?.files || []);
    if (incoming.length > 0) {
      sendIntentRef.current = false;
      resetPeerSends();
      setSelectedFiles(prev => [...prev, ...incoming]);
      setDownloads([]);
      setCurrentFileIndex(-1);
    }
  }, [resetPeerSends]);

  const handleFileInput = useCallback((ev: Event) => {
    const input = ev.currentTarget as HTMLInputElement;
    const incoming = Array.from(input.files || []);
    if (incoming.length > 0) {
      sendIntentRef.current = false;
      resetPeerSends();
      setSelectedFiles(prev => [...prev, ...incoming]);
      setDownloads([]);
      setCurrentFileIndex(-1);
    }
  }, [resetPeerSends]);

  const finalizeDownload = useCallback(async () => {
    const meta = incomingMetaRef.current;
    if (!meta) return;
    setStatus(t.status.generatingFile);

    const chunks = recvChunksRef.current;
    if (!chunks || chunks.length === 0) return;
    const blob = new Blob(chunks as any[], { type: meta.mime });
    const url = URL.createObjectURL(blob);

    setDownloads(prev => [...prev, { url, name: meta.name, size: meta.size }]);
    setStatus(t.status.receiveComplete);
  }, []);

  const sendFilesToPeer = useCallback(async (peer: OffererPeer, files: File[]) => {
    const dc = peer.dc;
    if (!dc) return;

    const totalBatchSize = files.reduce((acc, f) => acc + f.size, 0);
    setStatus(t.status.sending);
    setSendProgress({ sent: 0, total: totalBatchSize });
    let batchSent = 0;

    // Send batch header
    dc.send(JSON.stringify({ type: "batch", totalFiles: files.length, totalSize: totalBatchSize } satisfies BatchMeta));

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setCurrentFileIndex(i);
      const encrypted = !!cryptoKeyRef.current;
      const meta: OutgoingMeta = {
        type: "meta",
        name: file.name,
        size: file.size,
        mime: file.type || "application/octet-stream",
        encrypted,
      };
      
      log("[send] starting file", i + 1, "/", files.length, ":", meta.name);
      dc.send(JSON.stringify(meta));

      const waitDrain = () =>
        new Promise<void>((resolve) => {
          if (dc.bufferedAmount <= dc.bufferedAmountLowThreshold) return resolve();
          dc.onbufferedamountlow = () => {
            dc.onbufferedamountlow = null;
            resolve();
          };
        });

      const chunkSize = 64 * 1024; // Robust 64KB chunk
      let offset = 0;
      while (offset < file.size) {
        const slice = file.slice(offset, offset + chunkSize);
        const buf = await slice.arrayBuffer();
        let payload: ArrayBuffer = buf;
        if (encrypted) payload = await encryptChunk(buf, cryptoKeyRef.current!);
        
        dc.send(payload);
        offset += buf.byteLength;
        batchSent += buf.byteLength;
        
        setSendProgress({ sent: batchSent, total: totalBatchSize });
        if (dc.bufferedAmount > 4 * 1024 * 1024) await waitDrain();
      }

      dc.send(JSON.stringify({ type: "done" } satisfies DoneMessage));
      log("[send] file completed:", meta.name);
    }

    setStatus(t.status.sendComplete);
    peer.sent = true;
    if (wsRef.current) {
      sendWS(wsRef.current, { type: "transfer-done", peerId: peer.peerId });
    }
  }, []);

  const trySendPeer = useCallback(async (peer: OffererPeer, reason: string) => {
    if (!sendIntentRef.current) return;
    if (peer.sending || peer.sent) return;
    const files = selectedFilesRef.current;
    if (!files || files.length === 0) return;
    const dc = peer.dc;
    if (!dc || dc.readyState !== "open") return;

    log("[send] triggered:", reason, "peer:", peer.peerId, "batch size:", files.length);
    peer.sending = true;
    await sendFilesToPeer(peer, files!);
    peer.sending = false;
  }, [sendFilesToPeer]);

  const trySendAll = useCallback((reason: string) => {
    if (!offererPeersRef.current) return;
    const peersMap = offererPeersRef.current;
    if (!peersMap) return;
    for (const peer of peersMap.values()) {
      void trySendPeer(peer, reason);
    }
  }, [trySendPeer]);

  const handleSend = useCallback(async () => {
    trySendAll("manual");
  }, [selectedFiles, trySendAll]);

  const handleClear = useCallback(() => {
    setSelectedFiles([]);
    setCurrentFileIndex(-1);
    setSendProgress({ sent: 0, total: 0 });
    sendIntentRef.current = false;
    resetPeerSends();
  }, [resetPeerSends]);

  const handleViewLocalFile = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    window.open(url, "_blank");
    // Optionally revoke after some time or on unmount
  }, []);

  const handleRemoveFile = useCallback((index: number) => {
    setSelectedFiles(prev => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0) {
        setCurrentFileIndex(-1);
        setSendProgress({ sent: 0, total: 0 });
        sendIntentRef.current = false;
        resetPeerSends();
      }
      return next;
    });
  }, [resetPeerSends]);

  useEffect(() => {
    const boot = async () => {
      setStatus(t.status.connecting);

      const keyParam = new URLSearchParams(location.hash.slice(1)).get("k");
      cryptoKeyRef.current = keyParam ? await importAesKey(b64urlDecode(keyParam)) : null;

      const ws = await connectSignaling(roomId, clientId);
      wsRef.current = ws;

      const wireOffererDataChannel = (peer: OffererPeer, ch: DataChannel) => {
        ch.binaryType = "arraybuffer";
        ch.onopen = () => {
          log("[rtc] datachannel open (peer:", peer.peerId + ")");
          setStatus(t.status.dataChannelReady);
          void trySendPeer(peer, "datachannel-open");
        };
        ch.onclose = () => {
          log("[rtc] datachannel close (peer:", peer.peerId + ")");
        };
        ch.onerror = () => {
          console.warn("[rtc] datachannel error (peer:", peer.peerId + ")");
        };
      };

      const createOffererPeer = (peerId: string) => {
        const existing = offererPeersRef.current!.get(peerId);
        if (existing) return existing;

        const pc = new RTCPeerConnection({
          iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }],
        });

        const peer: OffererPeer = {
          peerId,
          pc,
          dc: null,
          signalSid: 0,
          activeSid: null,
          remoteDescSet: false,
          pendingCandidates: [],
          offerInFlight: false,
          sending: false,
          sent: false,
        };

        pc.onicecandidate = (ev) => {
          if (!ev.candidate) return;
          const sid = peer.activeSid;
          if (sid == null) return;
          if (!wsRef.current) return;
          sendWS(wsRef.current, {
            type: "candidate",
            to: peer.peerId,
            sid,
            candidate: ev.candidate.toJSON(),
          });
        };

        pc.onconnectionstatechange = () => {
          log("[rtc] connectionState:", pc.connectionState, "(peer:", peer.peerId + ")");
        };

        const dc = pc.createDataChannel("file", { ordered: true });
        peer.dc = dc;
        wireOffererDataChannel(peer, dc);

        const currentMap = offererPeersRef.current;
        if (currentMap) currentMap.set(peerId, peer);
        return peer;
      };

      const closeOffererPeer = (peerId: string) => {
        const currentMap = offererPeersRef.current;
        if (!currentMap) return;
        const peer = currentMap.get(peerId);
        if (!peer) return;
        peer.dc?.close();
        peer.pc.close();
        currentMap.delete(peerId);
      };

      const flushOffererCandidates = async (peer: OffererPeer) => {
        const pending = peer.pendingCandidates;
        let i = 0;
        while (i < pending.length) {
          const item = pending[i];
          if (item.sid !== peer.activeSid) {
            pending.splice(i, 1);
            continue;
          }
          pending.splice(i, 1);
          await peer.pc.addIceCandidate(item.candidate);
        }
      };

      const sendOffer = async (peer: OffererPeer) => {
        if (peer.offerInFlight) return;
        if (peer.pc.signalingState !== "stable") return;

        peer.offerInFlight = true;
        const sid = ++peer.signalSid;
        peer.activeSid = sid;

        const offer = await peer.pc.createOffer({ iceRestart: true });
        await peer.pc.setLocalDescription(offer);
        if (wsRef.current) {
          sendWS(wsRef.current, { type: "offer", to: peer.peerId, sid, sdp: peer.pc.localDescription! });
        }
        peer.offerInFlight = false;
      };

      const wireReceiverDataChannel = (ch: DataChannel) => {
        ch.binaryType = "arraybuffer";
        ch.onopen = () => {
          log("[rtc] datachannel open (receiver)");
          setStatus(t.status.dataChannelReady);
        };
        ch.onclose = () => {
          log("[rtc] datachannel close (receiver)");
          setStatus(t.status.dataChannelClosed);
        };
        ch.onerror = () => {
          console.warn("[rtc] datachannel error (receiver)");
          setStatus(t.status.dataChannelError);
        };

        ch.onmessage = async (ev) => {
          if (typeof ev.data === "string") {
            const m = safeJson(ev.data) as DataMessage | null;
            if (!m) return;

            if (m.type === "batch") {
              log("[recv] batch started:", m.totalFiles, "files, total size:", m.totalSize);
              setRecvProgress({ got: 0, total: m.totalSize });
              return;
            }

            if (m.type === "meta") {
              log("[recv] starting:", m.name, "size:", m.size);
              incomingMetaRef.current = m;
              recvChunksRef.current = [];
              // We don't reset recvProgress.got here to keep aggregate progress
              setRecvProgress(prev => ({ ...prev, total: prev.total || m.size }));

              if (m.encrypted && !cryptoKeyRef.current) {
                setStatus(t.status.missingKey);
                return;
              }
              setStatus(t.status.receiving.replace("{name}", m.name));
            }

            if (m.type === "done") {
              log("[recv] completed");
              await finalizeDownload();
            }
            return;
          }

          if (!incomingMetaRef.current) return;
          const ab = await toArrayBuffer(ev.data as BufferLike);

          let plain = ab;
          if (incomingMetaRef.current.encrypted) {
            plain = await decryptChunk(ab, cryptoKeyRef.current);
          }
          const chunks = recvChunksRef.current!;
          chunks.push(new Uint8Array(plain));
          const chunkLen = plain.byteLength;
          setRecvProgress(prev => ({ got: prev.got + chunkLen, total: prev.total }));
        };
      };

      const createReceiverPc = (peerId: string) => {
        if (receiverPcRef.current) return receiverPcRef.current;

        const pc = new RTCPeerConnection({
          iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }],
        });
        receiverPcRef.current = pc;
        receiverPeerIdRef.current = peerId;
        receiverRemoteDescSetRef.current = false;
        receiverPendingCandidatesRef.current = [];

        pc.onicecandidate = (ev) => {
          if (!ev.candidate) return;
          const sid = receiverActiveSidRef.current;
          const to = receiverPeerIdRef.current;
          if (sid == null || !to || !wsRef.current) return;
          sendWS(wsRef.current, {
            type: "candidate",
            to,
            sid,
            candidate: ev.candidate.toJSON(),
          });
        };

        pc.onconnectionstatechange = () => {
          log("[rtc] connectionState:", pc.connectionState, "(receiver)");
        };

        pc.ondatachannel = (ev) => {
          receiverDcRef.current = ev.channel;
          wireReceiverDataChannel(ev.channel);
        };

        return pc;
      };

      const flushReceiverCandidates = async () => {
        const pc = receiverPcRef.current!;
        const sid = receiverActiveSidRef.current!;
        if (!pc || sid == null) return;

        const pending = receiverPendingCandidatesRef.current!;
        let i = 0;
        while (i < pending.length) {
          const item = pending[i];
          if (item.sid !== sid) {
            pending.splice(i, 1);
            continue;
          }
          pending.splice(i, 1);
          await pc.addIceCandidate(item.candidate);
        }
      };

      ws.onmessage = async (ev) => {
        const msg = safeJson(ev.data) as RoomMessage | null;
        if (!msg) return;
        log("[ws] message:", msg.type, "(role:", roleRef.current + ")");

        if (msg.type === "role") {
          roleRef.current = msg.role;
          setRole(msg.role);
          if (msg.role === "offerer") {
            setStatus(t.status.waitingSender);
          } else {
            setStatus(t.status.waitingReceiver);
          }
          return;
        }

        if (msg.type === "peers") {
          peersRef.current = msg.count;
          setPeers(msg.count);
          if (roleRef.current === "offerer" && msg.count > 0) {
            setStatus(t.status.waitingSenderReady);
          }
          return;
        }

        if (msg.type === "wait") {
          if (roleRef.current === "answerer") {
            setStatus(t.status.queued);
          }
          return;
        }

        if (msg.type === "start") {
          if (roleRef.current === "offerer" && msg.peerId) {
            const peersMap = offererPeersRef.current;
            if (peersMap && peersMap.has(msg.peerId)) {
              closeOffererPeer(msg.peerId);
            }
            const peer = createOffererPeer(msg.peerId);
            await sendOffer(peer);
            return;
          }
          if (roleRef.current === "answerer") {
            setStatus(t.status.preparing);
          }
          return;
        }

        if (msg.type === "peer-left") {
          if (roleRef.current === "offerer") {
            closeOffererPeer(msg.peerId);
          }
          return;
        }

        if (msg.type === "offer") {
          if (roleRef.current !== "answerer") return;
          const pc = createReceiverPc(msg.from);
          receiverActiveSidRef.current = msg.sid;
          await pc.setRemoteDescription(msg.sdp);
          receiverRemoteDescSetRef.current = true;
          await flushReceiverCandidates();

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          if (wsRef.current) {
            sendWS(wsRef.current, {
              type: "answer",
              to: msg.from,
              sid: msg.sid,
              sdp: pc.localDescription!,
            });
          }
          return;
        }

        if (msg.type === "answer") {
          if (roleRef.current !== "offerer") return;
          const peersMap = offererPeersRef.current;
          if (!peersMap) return;
          const peer = peersMap.get(msg.from);
          if (!peer) return;
          if (peer.activeSid == null || msg.sid !== peer.activeSid) return;

          await peer.pc.setRemoteDescription(msg.sdp);
          peer.remoteDescSet = true;
          await flushOffererCandidates(peer);
          return;
        }

        if (msg.type === "candidate") {
          if (roleRef.current === "offerer") {
            if (!offererPeersRef.current) return;
            const peer = offererPeersRef.current.get(msg.from);
            if (!peer) return;
            if (peer.activeSid == null || msg.sid !== peer.activeSid) return;

            if (!peer.remoteDescSet) {
              peer.pendingCandidates.push({ sid: msg.sid, candidate: msg.candidate });
            } else {
              await peer.pc.addIceCandidate(msg.candidate);
            }
            return;
          }

          if (roleRef.current === "answerer") {
            if (msg.from !== receiverPeerIdRef.current) return;
            const pc = receiverPcRef.current;
            if (!pc) return;

            if (!receiverRemoteDescSetRef.current) {
              const pending = receiverPendingCandidatesRef.current;
              if (pending) pending.push({ sid: msg.sid, candidate: msg.candidate });
            } else {
              await pc.addIceCandidate(msg.candidate);
            }
          }
        }
      };

      ws.onclose = () => setStatus(t.status.disconnected);
      ws.onerror = () => console.warn("[ws] error");
    };

    boot().catch((e) => {
      setStatus(t.error.generic.replace("{message}", String(e?.message || e)));
    });

    return () => {
      wsRef.current?.close();
      receiverDcRef.current?.close();
      receiverPcRef.current?.close();
      if (offererPeersRef.current) {
        for (const peer of offererPeersRef.current!.values()) {
          peer.dc?.close();
          peer.pc.close();
        }
        offererPeersRef.current.clear();
      }
      if (downloadUrlRef.current) {
        URL.revokeObjectURL(downloadUrlRef.current);
        downloadUrlRef.current = null;
      }
    };
  }, [roomId, finalizeDownload, trySendPeer]);

  const roleLabel = useMemo(() => {
    if (role === "offerer") return t.role.offerer;
    if (role === "answerer") return t.role.answerer;
    return t.role.unknown;
  }, [role]);

  const peersLabel = useMemo(() => `${peers}${t.room.peersUnit}`, [peers]);

  const sendPct = useMemo(
    () => progressPercent(sendProgress.sent, sendProgress.total),
    [sendProgress]
  );
  const sendText = useMemo(
    () => progressText(sendProgress.sent, sendProgress.total),
    [sendProgress]
  );

  const recvPct = useMemo(
    () => progressPercent(recvProgress.got, recvProgress.total),
    [recvProgress]
  );
  const recvText = useMemo(
    () => progressText(recvProgress.got, recvProgress.total),
    [recvProgress]
  );

  const selectedFilesLabel = useMemo(() => {
    if (selectedFiles.length === 0) return "";
    if (selectedFiles.length === 1) return `${selectedFiles[0].name} (${formatBytes(selectedFiles[0].size)})`;
    const totalSize = selectedFiles.reduce((acc, f) => acc + f.size, 0);
    return t.room.selectedCount.replace("{count}", String(selectedFiles.length)).replace("{size}", formatBytes(totalSize));
  }, [selectedFiles]);

  const maxConcurrentLabel = useMemo(
    () => t.room.maxConcurrentLimit.replace("{max}", String(maxConcurrent)),
    [maxConcurrent]
  );

  const canSend = role === "offerer" && selectedFiles.length > 0;
  const showSender = role === "offerer";
  const showReceiver = role === "answerer";

  const sendHint = useMemo(() => {
    if (selectedFiles.length === 0) return t.room.sendHintNoFile;
    if (peers === 0) return t.room.sendHintNoPeer;
    return t.room.sendHintReady;
  }, [selectedFiles, peers]);

  const showSendProgress = sendProgress.total > 0;

  // Step guide logic
  // Note: peers count includes self, so peers > 1 means someone else is connected
  const maxStepRef = useRef(1);

  const guideState = useMemo(() => {
    type GuideState = { step: number; main: string; sub: string; waiting: boolean; complete: boolean };

    const receiverSteps: Record<number, GuideState> = {
      1: { step: 1, main: t.guide.receiverConnecting, sub: t.guide.receiverConnectingSub, waiting: true, complete: false },
      2: { step: 2, main: t.guide.receiverWaitFile, sub: t.guide.receiverWaitFileSub, waiting: true, complete: false },
      3: { step: 3, main: t.guide.receiverReceiving, sub: t.guide.receiverReceivingSub, waiting: false, complete: false },
      4: { step: 4, main: t.guide.receiverComplete, sub: t.guide.receiverCompleteSub, waiting: false, complete: true },
    };

    if (role === "offerer") {
      // Sender: determine current step based on state
      let currentStep = 1;
      let state: GuideState;

      if (sendProgress.sent > 0 && sendProgress.sent >= sendProgress.total && sendProgress.total > 0) {
        currentStep = 4;
        state = { step: 4, main: t.guide.senderComplete, sub: t.guide.senderCompleteSub, waiting: false, complete: true };
      } else if (sendProgress.total > 0) {
        currentStep = 3;
        state = { step: 3, main: t.guide.senderSending, sub: t.guide.senderSendingSub, waiting: false, complete: false };
      } else if (peers > 1 && selectedFiles.length > 0) {
        // Peer connected and file selected - ready to send
        currentStep = 2;
        state = { step: 2, main: t.guide.senderReadyToSend, sub: t.guide.senderReadyToSendSub, waiting: false, complete: false };
      } else if (selectedFiles.length > 0) {
        // File selected but waiting for peer
        currentStep = 1;
        state = { step: 1, main: t.guide.senderWaitPeer, sub: t.guide.senderWaitPeerSub, waiting: true, complete: false };
      } else if (peers > 1) {
        // Peer connected but no file yet
        currentStep = 2;
        state = { step: 2, main: t.guide.senderSelectFile, sub: t.guide.senderSelectFileSub, waiting: false, complete: false };
      } else {
        // Waiting for peer
        currentStep = 1;
        state = { step: 1, main: t.guide.senderShareLink, sub: t.guide.senderShareLinkSub, waiting: true, complete: false };
      }

      // Never go back in step number
      const maxVal = maxStepRef.current || 1;
      if (currentStep > maxVal) {
        maxStepRef.current = currentStep;
      }
      // But always show current state's content (for file selection feedback)
      return { ...state, step: Math.max(state.step, maxStepRef.current || 1) };
    }

    if (role === "answerer") {
      // Receiver steps: 1=connecting, 2=wait file, 3=receiving, 4=complete
      let currentStep = 2;
      if (downloads.length > 0) {
        currentStep = 4;
      } else if (recvProgress.total > 0) {
        currentStep = 3;
      }
      // Never go back
      const maxStepValue = maxStepRef.current! || 1;
      if (currentStep > maxStepValue) {
        maxStepRef.current = currentStep;
      }
      const finalStep = maxStepRef.current! || currentStep;
      return receiverSteps[finalStep as keyof typeof receiverSteps] || receiverSteps[2];
    }

    // Initial connecting state (before role is assigned)
    return receiverSteps[1];
  }, [role, peers, sendProgress, recvProgress, downloads, selectedFiles]);

  const stepLabel = t.guide.stepLabel
    .replace("{current}", String(guideState.step))
    .replace("{total}", "4");

  return (
    <section id="roomView" class="roomLayout">
      <div class="roomCard">
        <div class="roomHeader">
          <div class="roomTitle">
            <div id="status" class="status">{status}</div>
            <h2>
              {t.room.roomLabel} <span id="roomIdLabel" class="mono">{roomId}</span>
            </h2>
          </div>
          <div class="right">
            <button id="copyLinkBtn" class="btn" onClick={handleCopyLink} title={t.room.copyLinkHint}>{t.room.copyLink}</button>
            <button id="copyCodeBtn" class="btn" onClick={handleCopyCode} title={t.room.copyCodeHint}>{t.room.copyCode}</button>
          </div>
        </div>

        <div class="roomGrid">
          <div class="roomSide">
            <div class="kv">
              <div class="field">
                <span class="kv-label">{t.room.roleLabel}</span>
                <span id="roleLabel" class="kv-value">{roleLabel}</span>
              </div>
              <div class="field">
                <span class="kv-label">{t.room.peersLabel}</span>
                <span id="peersLabel" class="kv-value">{peersLabel}</span>
              </div>
            </div>
            <div class="sideCard muted small" style={{ marginTop: '2rem' }}>{t.room.encryptHint}</div>
            <div class="sideCard muted small">{maxConcurrentLabel}</div>

            <div class="qrSection">
              <div id="qrCode" class="qrPlaceholder">
                {qrCode ? <img src={qrCode} alt="QR Code" /> : <div class="muted small">Loading QR...</div>}
              </div>
              <p class="muted tiny centered">{t.room.scanToJoin}</p>
            </div>
          </div>

          <div class="roomMain">
            <div class={`stepGuide${guideState.waiting ? " waiting" : ""}${guideState.complete ? " complete" : ""}`}>
              <div class="stepLabel">{stepLabel}</div>
              <div class="stepMain">{guideState.main}</div>
              <div class="stepSub">{guideState.sub}</div>
            </div>

            <div id="senderPane" class={`pane${showSender ? "" : " hidden"}`}>
              <div
                id="drop"
                class={`drop${dropHover ? " hover" : ""}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <div class="dropTitle">{t.room.dropTitle}</div>
                <div class="muted small">{t.room.dropOr}</div>
                <label class="btn">
                  {t.room.select}
                  <input id="fileInput" type="file" hidden multiple onChange={handleFileInput} />
                </label>
              </div>

              {selectedFiles.length > 0 && (
                <div class="fileList">
                  {selectedFiles.map((f, i) => (
                    <div key={i} class={`fileItem${i === currentFileIndex ? " active" : ""}${i < currentFileIndex ? " done" : ""}`}>
                      <div class="fileInfo">
                        <span class="name">{f.name}</span>
                        <span class="size">{formatBytes(f.size)}</span>
                      </div>
                      <div class="fileActions">
                        <button class="btn small" onClick={() => handleViewLocalFile(f)} title={t.room.view}>
                          {t.room.view}
                        </button>
                        <button class="btn small" onClick={() => handleRemoveFile(i)} title={t.room.remove}>
                          {t.room.remove}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

               <div class="row gap wrap items-center mt-row">
                 <div class="row gap">
                   <button id="sendBtn" class="btn primary" disabled={!canSend} onClick={handleSend} title={sendHint}>
                     {t.room.send}
                   </button>
                   {selectedFiles.length > 0 && (
                     <button class="btn" onClick={handleClear}>
                       Clear
                     </button>
                   )}
                 </div>
                 <div class="muted small" id="fileInfo">{selectedFilesLabel || sendHint}</div>
               </div>

              {showSendProgress && (
                <div class="progress">
                  <div class="bar">
                    <div
                      id="sendBar"
                      class="fill"
                      style={{ width: `${sendPct}%` }}
                    ></div>
                  </div>
                  <div class="muted small" id="sendText">{sendText}</div>
                </div>
              )}
            </div>

            <div id="receiverPane" class={`pane${showReceiver || downloads.length > 0 ? "" : " hidden"}`}>
              {!recvProgress.total && downloads.length === 0 && (
                <div class="muted">{t.room.waiting}</div>
              )}

              {recvProgress.total > 0 && (
                <div class="progress">
                  <div class="bar">
                    <div
                      id="recvBar"
                      class="fill"
                      style={{ width: `${recvPct}%` }}
                    ></div>
                  </div>
                  <div class="muted small" id="recvText">{recvText}</div>
                </div>
              )}

              <div id="downloadArea" class={downloads.length > 0 ? "" : "hidden"} style={{ marginTop: '2rem' }}>
                <div class="fileList">
                  {downloads.map((d, i) => (
                    <div key={i} class="fileItem done">
                      <div class="info">
                        <span class="name">{d.name}</span>
                        <span class="size">{formatBytes(d.size)}</span>
                      </div>
                      <a class="btn small" href={d.url} download={d.name}>{t.room.download}</a>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="foot muted" style={{ padding: '1rem 2rem', borderTop: 'var(--border-width) solid black' }}>{t.home.footer}</div>
      </div>
      <div class={`toast${toastVisible ? " show" : ""}`}>{t.room.copied}</div>
    </section>
  );
}

/** ---------- signaling ---------- */
function wsUrl(path: string) {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}${path}`;
}

function connectSignaling(roomId: string, clientId: string) {
  return new Promise<AnyWebSocket>((resolve, reject) => {
    const url = new URL(wsUrl(`/ws/${roomId}`));
    url.searchParams.set("cid", clientId);
    const ws = new WebSocket(url.toString());
    ws.onopen = () => resolve(ws);
    ws.onerror = () => reject(new Error(t.error.wsConnectionFailed));
  });
}

function sendWS(ws: AnyWebSocket, obj: ClientMessage) {
  ws.send(JSON.stringify(obj));
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** タイムスタンプ付きログ */
function log(...args: unknown[]) {
  const now = new Date();
  const ts = now.toISOString().slice(11, 23); // HH:mm:ss.SSS
  console.info(`[${ts}]`, ...args);
}

/** ---------- UI helpers ---------- */
function progressPercent(sent: number, total: number) {
  return total ? Math.floor((sent / total) * 100) : 0;
}

function progressText(sent: number, total: number) {
  if (!total) return "0%";
  const pct = progressPercent(sent, total);
  return `${pct}% (${formatBytes(sent)} / ${formatBytes(total)})`;
}

async function copyText(s: string) {
  try {
    await navigator.clipboard.writeText(s);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = s;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}

function formatBytes(n: number) {
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  let x = n;
  while (x >= 1024 && i < u.length - 1) {
    x /= 1024;
    i++;
  }
  return `${x.toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

function getClientId() {
  const key = "pairlane-client-id";
  const stored = localStorage.getItem(key);
  if (stored) return stored;
  const id = crypto.randomUUID();
  localStorage.setItem(key, id);
  return id;
}

async function toArrayBuffer(data: BufferLike): Promise<ArrayBuffer> {
  if (data instanceof ArrayBuffer) return data;
  return await data.arrayBuffer();
}

/** ---------- crypto (optional E2E) ---------- */
async function importAesKey(raw: Uint8Array) {
  return crypto.subtle.importKey("raw", raw as any, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

async function encryptChunk(plainAb: ArrayBuffer, key: RoomCryptoKey) {
  if (!key) return plainAb;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as any }, key, plainAb);
  const out = new Uint8Array(12 + ct.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(ct) as any, 12);
  return out.buffer as any;
}

async function decryptChunk(frameAb: ArrayBuffer, key: RoomCryptoKey) {
  if (!key) return frameAb;
  const u8 = new Uint8Array(frameAb);
  const iv = u8.slice(0, 12);
  const ct = u8.slice(12);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as any }, key, ct as any);
  return pt;
}

function b64urlDecode(s: string) {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
