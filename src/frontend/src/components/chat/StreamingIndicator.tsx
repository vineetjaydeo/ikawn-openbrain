import { motion } from 'motion/react'

const dots = [0, 1, 2] as const

export function StreamingIndicator() {
  return (
    <div className="flex items-center gap-1 pt-2">
      {dots.map((i) => (
        <motion.div
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-primary"
          animate={{ y: [0, -6, 0] }}
          transition={{
            duration: 0.6,
            repeat: Infinity,
            delay: i * 0.15,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  )
}
