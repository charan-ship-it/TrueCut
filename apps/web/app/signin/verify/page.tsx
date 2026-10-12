import { TrueCutMark } from '../../../components/icons';
import VerifyButton from './VerifyButton';
import { safePath } from '@/lib/emailsignin';
export const dynamic = 'force-dynamic';

// The emailed link lands here. Signing in takes a click: mail scanners that open every link in an email
// would otherwise use the one-time link up before the person gets to it.
export default function Verify({ searchParams }: { searchParams: { email?: string; token?: string; callbackUrl?: string } }) {
  const { email, token } = searchParams;
  return (
    <div className="signin">
      <div className="signin-card">
        <TrueCutMark size={44} />
        <h1 className="serif">TrueCut</h1>
        {email && token
          ? <VerifyButton email={email} token={token} callbackUrl={safePath(searchParams.callbackUrl)} />
          : <><p className="signin-err">This sign-in link is incomplete. Copy the whole link from the email, or ask for a new one.</p><a className="btn" href="/signin">Back to sign-in</a></>}
      </div>
    </div>
  );
}
