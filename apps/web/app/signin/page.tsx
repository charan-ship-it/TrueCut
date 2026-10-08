import { TrueCutMark } from '../../components/icons';
import SignInButton from './SignInButton';
export const dynamic = 'force-dynamic';

const ERRORS: Record<string, string> = {
  AccessDenied: 'That account isn’t on the TrueCut team. Sign in with your work Google account.',
  Configuration: 'Sign-in isn’t set up on this server yet. Ask whoever runs TrueCut to add the Google keys.',
  OAuthCallback: 'Google sign-in didn’t finish. Please try again.',
};

export default function SignIn({ searchParams }: { searchParams: { error?: string; callbackUrl?: string } }) {
  const domains = (process.env.ALLOWED_EMAIL_DOMAINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const err = searchParams.error ? ERRORS[searchParams.error] || 'Sign-in failed. Please try again.' : '';
  const cb = searchParams.callbackUrl && searchParams.callbackUrl.startsWith('/') ? searchParams.callbackUrl : '/';
  return (
    <div className="signin">
      <div className="signin-card">
        <TrueCutMark size={44} />
        <h1 className="serif">TrueCut</h1>
        <p className="muted">Fact-checked motion videos and founder-talk edits, directed in a conversation.</p>
        <SignInButton callbackUrl={cb} />
        {domains.length > 0 && <p className="dim xs">For {domains.map((d) => '@' + d).join(', ')} accounts</p>}
        {err && <p className="signin-err">{err}</p>}
      </div>
    </div>
  );
}
