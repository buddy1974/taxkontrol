import { redirect } from 'next/navigation'

export default function HomePage() {
  redirect('/contact?system=taxkontrol&request=consultation')
}
