export default function MemoryBrowser() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <span
        className="mb-4 text-4xl"
        style={{ color: '#FFC01C' }}
        aria-hidden="true"
      >
        {'\u2726'}
      </span>
      <h1
        className="text-xl font-semibold tracking-tight text-white"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        Memory Browser
      </h1>
      <p className="mt-3 max-w-sm text-sm text-[#71717a] leading-relaxed">
        Browse and search through Lucy's memory. Coming soon.
      </p>
    </div>
  )
}
