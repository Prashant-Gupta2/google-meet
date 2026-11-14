import { FormEvent, useEffect, useRef, useState } from 'react';
import { RealtimeMeetingView } from './RealtimeMeetingView';

type Mode = 'signin' | 'signup';
type User = { email: string; organizationId: number };
type AuthResponse = { message?: string; token?: string; user?: User };

const apiUrl =
  import.meta.env.VITE_API_URL ||
  "https://google-meet-backend-1xih.onrender.com/api";
  
export function MeetingView({ user, code, onLeave }: { user: User; code: string; onLeave: () => void }) {
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const shareVideoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const shareStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [micStatus, setMicStatus] = useState<'checking' | 'working' | 'quiet' | 'muted' | 'blocked'>('checking');
  const [micLevel, setMicLevel] = useState(0);
  const [cameraOn, setCameraOn] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [showPeople, setShowPeople] = useState(true);
  const [admitted, setAdmitted] = useState(false);
  const [mediaError, setMediaError] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);
  const meetingLink = `${window.location.origin}?meeting=${encodeURIComponent(code)}`;

  useEffect(() => {
    let active = true;
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicStatus('blocked');
      setMediaError('This browser does not support camera and microphone access.');
      return () => { active = false; };
    }

    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then((stream) => {
        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        cameraStreamRef.current = stream;
        if (cameraVideoRef.current) cameraVideoRef.current.srcObject = stream;
        const audioContext = new AudioContext();
        audioContextRef.current = audioContext;
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        const source = audioContext.createMediaStreamSource(stream);
        const samples = new Uint8Array(analyser.frequencyBinCount);
        source.connect(analyser);
        const measureMic = () => {
          if (!active) return;
          analyser.getByteTimeDomainData(samples);
          const average = samples.reduce((total, sample) => total + Math.abs(sample - 128), 0) / samples.length;
          const level = Math.min(100, Math.round(average * 4));
          setMicLevel(level);
          setMicStatus(level > 3 ? 'working' : 'quiet');
          requestAnimationFrame(measureMic);
        };
        measureMic();
      })
      .catch(() => {
        setMicStatus('blocked');
        setMediaError('Camera or microphone access was blocked. You can still join the meeting.');
      });

    return () => {
      active = false;
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      void audioContextRef.current?.close();
      shareStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  function toggleMic() {
    const next = !micOn;
    cameraStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = next; });
    setMicOn(next);
    setMicStatus(next ? 'checking' : 'muted');
  }

  function toggleCamera() {
    const next = !cameraOn;
    cameraStreamRef.current?.getVideoTracks().forEach((track) => { track.enabled = next; });
    setCameraOn(next);
  }

  async function shareScreen() {
    if (sharing) return stopScreenShare();
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setMediaError('Screen sharing is not supported by this browser.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      shareStreamRef.current = stream;
      if (shareVideoRef.current) shareVideoRef.current.srcObject = stream;
      stream.getVideoTracks()[0].onended = () => {
        shareStreamRef.current = null;
        setSharing(false);
      };
      setSharing(true);
    } catch {
      setMediaError('Screen sharing was cancelled or blocked.');
    }
  }

  function stopScreenShare() {
    shareStreamRef.current?.getTracks().forEach((track) => track.stop());
    shareStreamRef.current = null;
    setSharing(false);
  }

  async function copyMeetingLink() {
    try {
      await navigator.clipboard.writeText(meetingLink);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 2200);
    } catch {
      setMediaError('Copy was blocked by the browser. Copy the meeting link from the address bar.');
    }
  }

  return (
    <main className="flex min-h-screen flex-col bg-[#202124] text-white">
      <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-400 font-semibold text-slate-950">M</span><div><p className="font-semibold">Meetly</p><p className="text-xs text-slate-400">{code}</p></div></div>
        <div className="flex items-center gap-2">
          <button onClick={copyMeetingLink} className="rounded-lg bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300">{linkCopied ? 'Link copied' : 'Share link'}</button>
          <span className="hidden text-sm text-slate-300 lg:block">{user.email}</span>
          <button onClick={onLeave} className="rounded-lg border border-white/15 px-3 py-2 text-sm text-slate-300 transition hover:bg-white/10">Leave</button>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-4 p-4 lg:flex-row">
        <section className="relative flex min-h-[28rem] flex-1 items-center justify-center overflow-hidden rounded-2xl bg-[#111214]">
          {sharing && <video ref={shareVideoRef} autoPlay playsInline className="absolute inset-0 h-full w-full object-contain" />}
          <video ref={cameraVideoRef} autoPlay muted playsInline className={`${sharing ? 'hidden' : ''} h-full max-h-[calc(100vh-13rem)] w-full object-cover`} />
          {!cameraOn && !sharing && <div className="absolute inset-0 grid place-items-center bg-slate-900"><div className="grid h-24 w-24 place-items-center rounded-full bg-cyan-400 text-4xl font-semibold text-slate-950">{user.email[0].toUpperCase()}</div></div>}
          {mediaError && <p className="absolute bottom-4 left-4 rounded-lg bg-black/60 px-3 py-2 text-xs text-slate-200">{mediaError}</p>}
          <span className="absolute bottom-4 left-4 rounded-lg bg-black/60 px-3 py-2 text-sm">{sharing ? 'You are presenting' : 'You'}</span>
          {sharing && <button onClick={stopScreenShare} className="absolute bottom-4 right-4 rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white shadow-lg hover:bg-red-400">Stop sharing</button>}
          <div className="absolute right-4 top-4 max-w-[18rem] rounded-lg bg-black/60 px-3 py-2 text-xs text-slate-200">
            <p className="font-medium">Invite others</p>
            <p className="mt-1 truncate text-slate-400">{meetingLink}</p>
          </div>
        </section>

        {showPeople && <aside className="w-full rounded-2xl bg-[#292a2d] p-5 lg:w-80">
          <div className="flex items-center justify-between"><h2 className="font-semibold">People</h2><button onClick={() => setShowPeople(false)} className="text-xl text-slate-400 hover:text-white">×</button></div>
          <div className="mt-5 rounded-xl bg-[#343539] p-4"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-cyan-400 font-semibold text-slate-950">{user.email[0].toUpperCase()}</span><div><p className="text-sm">{user.email}</p><p className="text-xs text-cyan-300">You · Admin / Host</p></div></div></div>
          {!admitted && <div className="mt-4 rounded-xl border border-white/10 bg-[#343539] p-4"><p className="text-sm font-medium">Alex wants to join</p><p className="mt-1 text-xs text-slate-400">Waiting in the lobby</p><button onClick={() => setAdmitted(true)} className="mt-4 w-full rounded-lg bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300">Admit</button></div>}
          {admitted && <div className="mt-4 rounded-xl bg-[#343539] p-4"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-violet-400 font-semibold text-slate-950">A</span><div><p className="text-sm">Alex</p><p className="text-xs text-slate-400">Guest · In the meeting</p></div></div></div>}
        </aside>}
      </div>

      <footer className="flex items-center justify-center gap-3 border-t border-white/10 px-4 py-5">
        <div className="mr-2 hidden items-center gap-2 text-xs text-slate-400 sm:flex" title="Microphone input level"><span className={`h-2.5 w-2.5 rounded-full ${micStatus === 'working' ? 'bg-emerald-400' : micStatus === 'blocked' ? 'bg-red-400' : 'bg-amber-400'}`} /><span>{micStatus === 'working' ? 'Mic working' : micStatus === 'quiet' ? 'Mic is quiet' : micStatus === 'muted' ? 'Mic muted' : micStatus === 'blocked' ? 'Mic unavailable' : 'Checking mic…'}</span><span className="flex h-2 w-12 overflow-hidden rounded-full bg-white/15"><span className="bg-emerald-400 transition-all" style={{ width: `${micLevel}%` }} /></span></div>
        <button onClick={toggleMic} className={`grid h-12 w-12 place-items-center rounded-full text-[1.1rem] transition-colors ${micOn ? 'bg-[#343539] hover:bg-[#4a4b50]' : 'bg-red-500 hover:bg-red-400'}`} title={micOn ? 'Mute microphone' : 'Unmute microphone'}>{micOn ? '🎙' : '🔇'}</button>
        <button onClick={toggleCamera} className={`grid h-12 w-12 place-items-center rounded-full text-[1.1rem] transition-colors ${cameraOn ? 'bg-[#343539] hover:bg-[#4a4b50]' : 'bg-red-500 hover:bg-red-400'}`} title={cameraOn ? 'Turn off camera' : 'Turn on camera'}>{cameraOn ? '▣' : '▧'}</button>
        <button onClick={shareScreen} className={`rounded-full px-4 py-3 text-sm font-semibold transition ${sharing ? 'bg-red-500 text-white hover:bg-red-400' : 'bg-[#343539] text-white hover:bg-[#4a4b50]'}`} title={sharing ? 'Stop screen sharing' : 'Share screen'}>{sharing ? 'Stop sharing' : 'Share screen'}</button>
        <button onClick={() => setShowPeople((visible) => !visible)} className="grid h-12 w-12 place-items-center rounded-full bg-[#343539] text-[1.1rem] transition-colors hover:bg-[#4a4b50]" title="People">♙</button>
        <button onClick={onLeave} className="ml-3 rounded-full bg-red-500 px-5 py-3 text-sm font-semibold hover:bg-red-400">End call</button>
      </footer>
    </main>
  );
}

export function App() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [organizationId, setOrganizationId] = useState('1');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<User | null>(() => {
    const savedUser = localStorage.getItem('meetly_user');
    if (!savedUser) return null;
    try { return JSON.parse(savedUser) as User; } catch { return null; }
  });
  const [meetingCode, setMeetingCode] = useState('');
  const [dashboardMessage, setDashboardMessage] = useState('');
  const [activeMeetingCode, setActiveMeetingCode] = useState(() => new URLSearchParams(window.location.search).get('meeting') ?? '');
  const [authToken, setAuthToken] = useState(() => localStorage.getItem('meetly_token') ?? '');
  const [creatingMeeting, setCreatingMeeting] = useState(false);

  function changeMode(nextMode: Mode) {
    setMode(nextMode);
    setError('');
    setSuccess('');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const endpoint = mode === 'signin' ? '/auth/signin' : '/auth/signup';
      const body = mode === 'signin'
        ? { email, password }
        : { email, password, organizationId: Number(organizationId) };
      const response = await fetch(`${apiUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as AuthResponse;

      if (!response.ok || !data.token) {
        throw new Error(data.message ?? 'Something went wrong. Please try again.');
      }

      localStorage.setItem('meetly_token', data.token);
      localStorage.setItem('meetly_user', JSON.stringify(data.user ?? { email, organizationId: Number(organizationId) }));
      setAuthToken(data.token);
      setUser(data.user ?? { email, organizationId: Number(organizationId) });
      setPassword('');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to connect to the server.');
    } finally {
      setLoading(false);
    }
  }

  function signOut() {
    localStorage.removeItem('meetly_token');
    localStorage.removeItem('meetly_user');
    setUser(null);
    setAuthToken('');
    setDashboardMessage('');
  }

  function expireSession() {
    localStorage.removeItem('meetly_token');
    localStorage.removeItem('meetly_user');
    setAuthToken('');
    setUser(null);
    setActiveMeetingCode('');
    setError('Your session expired. Please sign in again.');
  }

  function createMeeting() {
    setCreatingMeeting(true);
    setActiveMeetingCode(Math.random().toString(36).slice(2, 5) + '-' + Math.random().toString(36).slice(2, 6) + '-' + Math.random().toString(36).slice(2, 5));
  }

  function joinMeeting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (meetingCode.trim()) {
      setCreatingMeeting(false);
      setActiveMeetingCode(meetingCode.trim());
    }
    else setDashboardMessage('Enter a meeting code to join.');
  }

  if (user && activeMeetingCode && authToken) return <RealtimeMeetingView user={user} code={activeMeetingCode} token={authToken} createRoom={creatingMeeting} onLeave={() => setActiveMeetingCode('')} onAuthExpired={expireSession} />;

  if (user) {
    return (
      <main className="min-h-screen bg-slate-50 text-slate-900">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <div className="flex items-center gap-3 text-lg font-semibold tracking-tight">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-400 text-slate-950">M</span>
              Meetly
            </div>
            <div className="flex items-center gap-4">
              <span className="hidden text-sm text-slate-500 sm:block">{user.email}</span>
              <button onClick={signOut} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50">Sign out</button>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-6xl px-6 py-12">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-cyan-600">Your meeting space</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">Good to see you.</h1>
            <p className="mt-4 text-lg text-slate-500">Start a meeting or join one with a code.</p>
          </div>

          <section className="mt-10 grid gap-5 md:grid-cols-2">
            <button onClick={createMeeting} className="group rounded-2xl bg-slate-950 p-7 text-left text-white shadow-xl shadow-slate-900/10 transition hover:-translate-y-0.5 hover:bg-slate-800">
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-cyan-400 text-2xl text-slate-950">＋</span>
              <h2 className="mt-7 text-xl font-semibold">New meeting</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">Start an instant meeting and invite others.</p>
            </button>

            <form onSubmit={joinMeeting} className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-slate-100 text-xl">↗</span>
              <h2 className="mt-7 text-xl font-semibold">Join with a code</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">Enter the meeting code shared with you.</p>
              <div className="mt-5 flex gap-2">
                <input value={meetingCode} onChange={(event) => setMeetingCode(event.target.value)} className="mt-0 block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-400/20" placeholder="abc-defg-hij" aria-label="Meeting code" />
                <button className="rounded-xl bg-cyan-500 px-5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400">Join</button>
              </div>
            </form>
          </section>

          {dashboardMessage && <p className="mt-6 rounded-xl bg-cyan-50 px-4 py-3 text-sm font-medium text-cyan-800">{dashboardMessage}</p>}

          <section className="mt-12 rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
            <h2 className="font-semibold">Upcoming meetings</h2>
            <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-5">
              <div><p className="font-medium">No upcoming meetings</p><p className="mt-1 text-sm text-slate-500">Your scheduled meetings will appear here.</p></div>
              <span className="hidden rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500 sm:block">Organization {user.organizationId}</span>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="relative mx-auto flex min-h-screen max-w-7xl items-center px-6 py-12 lg:px-12">
        <div className="pointer-events-none absolute -left-40 -top-40 h-96 w-96 rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 right-0 h-[28rem] w-[28rem] rounded-full bg-violet-600/20 blur-3xl" />
        <section className="relative grid w-full gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="max-w-xl">
            <div className="mb-10 flex items-center gap-3 text-sm font-semibold tracking-[0.2em] text-cyan-300 uppercase">
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-cyan-400 text-lg text-slate-950 shadow-lg shadow-cyan-500/20">M</span>
              Meetly
            </div>
            <p className="mb-5 text-sm font-semibold tracking-[0.25em] text-slate-400 uppercase">Meet clearly. Work beautifully.</p>
            <h1 className="text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">Make room for better conversations.</h1>
            <p className="mt-7 max-w-md text-lg leading-8 text-slate-400">A calm, focused space for your team to meet, share ideas, and move work forward.</p>
            <div className="mt-10 flex items-center gap-6 text-sm text-slate-400">
              <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-400" />Secure by default</span>
              <span>Simple to start</span>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/[0.07] p-2 shadow-2xl shadow-black/30 backdrop-blur-xl">
            <div className="rounded-[1.6rem] bg-slate-50 p-7 text-slate-900 sm:p-9">
              <div className="mb-8 flex gap-1 rounded-xl bg-slate-100 p-1">
                <button className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${mode === 'signin' ? 'bg-white shadow-sm' : 'text-slate-500'}`} onClick={() => changeMode('signin')}>Sign in</button>
                <button className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${mode === 'signup' ? 'bg-white shadow-sm' : 'text-slate-500'}`} onClick={() => changeMode('signup')}>Create account</button>
              </div>
              <h2 className="text-2xl font-semibold tracking-tight">{mode === 'signin' ? 'Welcome back' : 'Start your workspace'}</h2>
              <p className="mt-2 text-sm text-slate-500">{mode === 'signin' ? 'Sign in to continue to your meetings.' : 'Create an account to join your organization.'}</p>

              <form className="mt-7 space-y-4" onSubmit={submit}>
                {mode === 'signup' && <label className="block text-sm font-medium">Organization ID<input required min="1" type="number" value={organizationId} onChange={(event) => setOrganizationId(event.target.value)} className="mt-2 block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-400/20" /></label>}
                <label className="block text-sm font-medium">Email address<input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-400/20" placeholder="you@company.com" /></label>
                <label className="block text-sm font-medium">Password<input required minLength={8} type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-400/20" placeholder="At least 8 characters" /></label>
                {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
                {success && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</p>}
                <button disabled={loading} className="mt-2 w-full rounded-xl bg-slate-950 px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60">{loading ? 'Please wait…' : mode === 'signin' ? 'Sign in to Meetly' : 'Create my account'}</button>
              </form>
              <p className="mt-6 text-center text-xs text-slate-400">By continuing, you agree to our terms and privacy policy.</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
