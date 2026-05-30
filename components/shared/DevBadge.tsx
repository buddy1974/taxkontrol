// Server component — rendered only in development when DEV_BYPASS_LOGIN=true
export default function DevBadge() {
  return (
    <div className="fixed top-0 right-0 z-[9999] m-2 bg-amber-500 text-black text-xs font-bold px-2 py-1 rounded shadow-lg pointer-events-none select-none">
      DEV MODE
    </div>
  )
}
