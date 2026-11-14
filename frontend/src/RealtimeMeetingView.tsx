import { FormEvent, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

type User = { email: string; organizationId: number };
type Participant = { socketId: string; email: string; role: 'admin' | 'guest' };
type Signal = { type: string; sdp?: string; candidate?: RTCIceCandidateInit };
type RemoteVideo = { participant: Participant; stream: MediaStream };

const realtimeUrl = import.meta.env.VITE_REALTIME_URL || (import.meta.env.DEV ? 'http://127.0.0.1:5000' : window.location.origin);

export function RealtimeMeetingView({ user, code, token, createRoom, onLeave, onAuthExpired }: { user: User; code: string; token: string; createRoom: boolean; onLeave: () => void; onAuthExpired: () => void }) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const peersRef = useRef(new Map<string, RTCPeerConnection>());
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [requests, setRequests] = useState<Participant[]>([]);
  const [remoteVideos, setRemoteVideos] = useState<RemoteVideo[]>([]);
  const [waiting, setWaiting] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState('');
  const [invalidMeeting, setInvalidMeeting] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const meetingLink = `${window.location.origin}?meeting=${encodeURIComponent(code)}`;

  useEffect(() => {
    let mounted = true;
    const socket = io(realtimeUrl, { auth: { token }, transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    const removePeer = (socketId: string) => {
      peersRef.current.get(socketId)?.close();
      peersRef.current.delete(socketId);
      setRemoteVideos((videos) => videos.filter((video) => video.participant.socketId !== socketId));
    };

    const createPeer = async (participant: Participant, initiator: boolean) => {
      if (!localStreamRef.current || peersRef.current.has(participant.socketId)) return;
      const peer = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });
      peersRef.current.set(participant.socketId, peer);
      localStreamRef.current.getTracks().forEach((track) => peer.addTrack(track, localStreamRef.current!));
      peer.onicecandidate = ({ candidate }) => {
        if (candidate) socket.emit('webrtc:signal', { targetSocketId: participant.socketId, signal: { type: 'ice', candidate } });
      };
      peer.ontrack = ({ streams }) => {
        const stream = streams[0];
        if (!stream) return;
        setRemoteVideos((videos) => {
          const existing = videos.find((video) => video.participant.socketId === participant.socketId);
          return existing ? videos.map((video) => video.participant.socketId === participant.socketId ? { ...video, stream } : video) : [...videos, { participant, stream }];
        });
      };
      peer.onconnectionstatechange = () => {
        if (['failed', 'closed', 'disconnected'].includes(peer.connectionState)) removePeer(participant.socketId);
      };
      if (initiator) {
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        socket.emit('webrtc:signal', { targetSocketId: participant.socketId, signal: offer });
      }
    };

    socket.on('connect', () => socket.emit(createRoom ? 'meeting:create' : 'meeting:join', code));
    socket.on('connect_error', (connectionError) => {
      if (connectionError.message.toLowerCase().includes('authentication') || connectionError.message.toLowerCase().includes('token')) {
        onAuthExpired();
        return;
      }
      setError(`Unable to connect to the meeting server: ${connectionError.message}`);
    });
    socket.on('meeting:not-found', () => { setInvalidMeeting(true); setError('Meeting not found. Check that the link is correct and the host is still in the meeting.'); });
    socket.on('meeting:already-exists', () => { setInvalidMeeting(true); setError('That meeting code is already in use. Try creating a new meeting.'); });
    socket.on('meeting:joined', ({ participants: roomParticipants }: { role: string; participants: Participant[] }) => {
      setWaiting(false);
      setParticipants(roomParticipants);
      roomParticipants.filter((participant) => participant.socketId !== socket.id).forEach((participant) => void createPeer(participant, false));
    });
    socket.on('meeting:waiting', () => setWaiting(true));
    socket.on('meeting:join-request', (participant: Participant) => setRequests((current) => [...current.filter((item) => item.socketId !== participant.socketId), participant]));
    socket.on('meeting:admitted', ({ participants: roomParticipants }: { participants: Participant[] }) => {
      setWaiting(false);
      setParticipants(roomParticipants);
      roomParticipants.filter((participant) => participant.socketId !== socket.id).forEach((participant) => void createPeer(participant, false));
    });
    socket.on('meeting:participants', (roomParticipants: Participant[]) => setParticipants(roomParticipants));
    socket.on('meeting:peer-joined', (participant: Participant) => void createPeer(participant, true));
    socket.on('meeting:peer-left', removePeer);
    socket.on('meeting:host-promoted', () => setParticipants((current) => current.map((participant) => participant.socketId === socket.id ? { ...participant, role: 'admin' } : participant)));
    socket.on('webrtc:signal', async ({ fromSocketId, signal }: { fromSocketId: string; signal: Signal }) => {
      const participant = participants.find((item) => item.socketId === fromSocketId) ?? { socketId: fromSocketId, email: 'Participant', role: 'guest' as const };
      let peer = peersRef.current.get(fromSocketId);
      if (!peer) {
        await createPeer(participant, false);
        peer = peersRef.current.get(fromSocketId);
      }
      if (!peer) return;
      if (signal.type === 'offer') {
        await peer.setRemoteDescription(signal as RTCSessionDescriptionInit);
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        socket.emit('webrtc:signal', { targetSocketId: fromSocketId, signal: answer });
      } else if (signal.type === 'answer') {
        await peer.setRemoteDescription(signal as RTCSessionDescriptionInit);
      } else if (signal.type === 'ice' && signal.candidate) {
        await peer.addIceCandidate(signal.candidate);
      }
    });

    navigator.mediaDevices?.getUserMedia({ video: true, audio: true }).then((stream) => {
      if (!mounted) return stream.getTracks().forEach((track) => track.stop());
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      // The room request is sent on socket connect; media permission does not change room access.
    }).catch(() => setError('Camera or microphone permission was blocked.'));

    return () => {
      mounted = false;
      socket.emit('meeting:leave');
      socket.disconnect();
      peersRef.current.forEach((peer) => peer.close());
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [code, token, createRoom, onAuthExpired]);

  function admit(socketId: string) {
    socketRef.current?.emit('meeting:admit', socketId);
    setRequests((current) => current.filter((request) => request.socketId !== socketId));
  }

  function toggleMic() {
    const enabled = !micOn;
    localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = enabled; });
    setMicOn(enabled);
  }

  function toggleCamera() {
    const enabled = !cameraOn;
    localStreamRef.current?.getVideoTracks().forEach((track) => { track.enabled = enabled; });
    setCameraOn(enabled);
  }

  function stopScreenShare() {
    const cameraTrack = localStreamRef.current?.getVideoTracks()[0];
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    peersRef.current.forEach((peer) => {
      const sender = peer.getSenders().find((item) => item.track?.kind === 'video');
      if (sender && cameraTrack) void sender.replaceTrack(cameraTrack);
    });
    screenStreamRef.current = null;
    setSharing(false);
  }

  async function toggleScreenShare() {
    if (sharing) return stopScreenShare();
    setError('');
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      const screenTrack = screenStream.getVideoTracks()[0];
      peersRef.current.forEach((peer) => {
        const sender = peer.getSenders().find((item) => item.track?.kind === 'video');
        if (sender) void sender.replaceTrack(screenTrack);
      });
      screenStreamRef.current = screenStream;
      screenTrack.onended = stopScreenShare;
      setSharing(true);
    } catch (shareError) {
      if (shareError instanceof DOMException && (shareError.name === 'AbortError' || shareError.name === 'NotAllowedError')) return;
      setError('Screen sharing is not available in this browser.');
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(meetingLink);
    setLinkCopied(true);
    window.setTimeout(() => setLinkCopied(false), 2000);
  }

  if (waiting) return <main className="grid min-h-screen place-items-center bg-[#202124] px-6 text-center text-white"><div><div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-cyan-400 text-3xl font-semibold text-slate-950">M</div><h1 className="mt-6 text-3xl font-semibold">Waiting for the host</h1><p className="mt-3 text-slate-400">Ask the meeting host to admit you.</p><button onClick={onLeave} className="mt-8 rounded-lg border border-white/20 px-4 py-2 text-sm">Leave</button></div></main>;
  if (invalidMeeting) return <main className="grid min-h-screen place-items-center bg-[#202124] px-6 text-center text-white"><div><div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-red-500/20 text-3xl">!</div><h1 className="mt-6 text-3xl font-semibold">Unable to join meeting</h1><p className="mt-3 max-w-md text-slate-400">{error}</p><button onClick={onLeave} className="mt-8 rounded-lg bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950">Back to dashboard</button></div></main>;

  return (
    <main className="flex min-h-screen flex-col bg-[#202124] text-white">
      <header className="flex items-center justify-between border-b border-white/10 px-5 py-4"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-400 font-semibold text-slate-950">M</span><div><p className="font-semibold">Meetly</p><p className="text-xs text-slate-400">{code}</p></div></div><div className="flex items-center gap-2"><button onClick={copyLink} className="rounded-lg bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950">{linkCopied ? 'Link copied' : 'Share link'}</button><button onClick={onLeave} className="rounded-lg border border-white/20 px-3 py-2 text-sm">Leave</button></div></header>
      {error && <p className="mx-4 mt-4 rounded-lg bg-red-500/20 px-4 py-3 text-sm text-red-200">{error}</p>}
      <div className="grid flex-1 gap-4 p-4 lg:grid-cols-[1fr_20rem]">
        <section className="grid min-h-[28rem] gap-3 sm:grid-cols-2"><div className="relative min-h-[18rem] overflow-hidden rounded-2xl bg-[#111214] sm:col-span-2"><video ref={localVideoRef} autoPlay muted playsInline className={`${cameraOn ? '' : 'hidden'} h-full w-full object-cover`} />{!cameraOn && <div className="grid h-full place-items-center"><span className="grid h-24 w-24 place-items-center rounded-full bg-cyan-400 text-4xl font-semibold text-slate-950">{user.email[0].toUpperCase()}</span></div>}<span className="absolute bottom-3 left-3 rounded bg-black/60 px-2 py-1 text-xs">You · Admin</span>{sharing && <span className="absolute right-3 top-3 rounded bg-cyan-400 px-2 py-1 text-xs font-semibold text-slate-950">Presenting</span>}</div>{remoteVideos.map((video) => <RemoteVideo key={video.participant.socketId} video={video} />)}</section>
        <aside className="rounded-2xl bg-[#292a2d] p-5"><div className="flex justify-between"><h2 className="font-semibold">People ({participants.length})</h2></div>{participants.map((participant) => <div key={participant.socketId} className="mt-4 flex items-center gap-3 rounded-xl bg-[#343539] p-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-violet-400 font-semibold text-slate-950">{participant.email[0].toUpperCase()}</span><div><p className="text-sm">{participant.email}</p><p className="text-xs text-slate-400">{participant.role === 'admin' ? 'Admin / Host' : 'Guest'}</p></div></div>)}{requests.map((request) => <div key={request.socketId} className="mt-4 rounded-xl border border-cyan-400/30 bg-[#343539] p-3"><p className="text-sm">{request.email} wants to join</p><button onClick={() => admit(request.socketId)} className="mt-3 w-full rounded-lg bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950">Admit</button></div>)}</aside>
      </div>
      <footer className="flex flex-wrap items-center justify-center gap-3 border-t border-white/10 px-4 py-5"><button onClick={toggleMic} className={`control-button ${!micOn ? 'bg-red-500' : ''}`}>{micOn ? '🎙' : '🔇'}</button><button onClick={toggleCamera} className={`control-button ${!cameraOn ? 'bg-red-500' : ''}`}>{cameraOn ? '▣' : '▧'}</button><button onClick={toggleScreenShare} className="rounded-full bg-[#343539] px-4 py-3 text-sm font-semibold">{sharing ? 'Stop sharing' : 'Share screen'}</button><button onClick={onLeave} className="rounded-full bg-red-500 px-5 py-3 text-sm font-semibold">End call</button></footer>
    </main>
  );
}

function RemoteVideo({ video }: { video: RemoteVideo }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (ref.current) ref.current.srcObject = video.stream; }, [video.stream]);
  return <div className="relative min-h-[14rem] overflow-hidden rounded-2xl bg-[#111214]"><video ref={ref} autoPlay playsInline className="h-full min-h-[14rem] w-full object-cover" /><span className="absolute bottom-3 left-3 rounded bg-black/60 px-2 py-1 text-xs">{video.participant.email}</span></div>;
}
