import { redirect } from 'next/navigation'

// The proxy sends anonymous visitors to the consultation page and signed-in
// users to the dashboard; this is only reached when the proxy is bypassed.
export default function HomePage() {
  redirect('/dashboard')
}
