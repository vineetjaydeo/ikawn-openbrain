export function StreamingIndicator() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingTop: 8 }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 5,
            height: 5,
            borderRadius: 5,
            backgroundColor: '#6B6B6B',
            animation: `blink 1.2s infinite ${i * 0.2}s`,
          }}
        />
      ))}
      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  )
}
