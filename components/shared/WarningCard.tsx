interface Props {
  title: string
  description: string
  severity?: 'low' | 'medium' | 'high'
}

export default function WarningCard({
  title,
  description,
  severity = 'medium',
}: Props) {
  const colorMap = {
    high: 'border-red-800 bg-red-950',
    medium: 'border-amber-800 bg-amber-950',
    low: 'border-blue-800 bg-blue-950',
  }

  const textMap = {
    high: 'text-red-300',
    medium: 'text-amber-300',
    low: 'text-blue-300',
  }

  return (
    <div className={`rounded-lg border p-4 ${colorMap[severity]}`}>
      <p className={`text-sm font-medium ${textMap[severity]}`}>{title}</p>
      <p className="text-xs text-gray-400 mt-1">{description}</p>
    </div>
  )
}
