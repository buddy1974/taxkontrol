'use client'

import { useState } from 'react'

interface Props {
  term: string
  explanation: string
  children?: React.ReactNode
}

export default function GermanTermTooltip({ term, explanation, children }: Props) {
  const [show, setShow] = useState(false)

  return (
    <span className="relative inline-block">
      <span
        className="border-b border-dashed border-gray-500 cursor-help text-gray-300"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onTouchStart={() => setShow(!show)}
      >
        {children ?? term}
      </span>
      {show && (
        <span className="absolute bottom-full left-0 mb-2 z-50 w-64 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 shadow-xl">
          <span className="font-medium text-white">{term}</span>
          <br />
          {explanation}
        </span>
      )}
    </span>
  )
}
