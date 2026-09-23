interface ValueCardProps {
  title: string
  mainValue: string
  mainColor?: string
  subtitle: string
  subtitleValue?: string
  subtitleColor?: string
  icon?: string
}

export function ValueCard({
  title,
  mainValue,
  mainColor,
  subtitle,
  subtitleValue,
  subtitleColor = 'text-gray-500 dark:text-gray-400',
  icon,
}: ValueCardProps) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">{title}</p>
      <p className={`text-2xl font-bold ${mainColor || 'text-gray-900 dark:text-gray-100'}`}>
        {mainValue}
      </p>
      <p className={`text-sm mt-1 flex items-center gap-1 ${subtitleColor}`}>
        {icon && <span>{icon}</span>}
        {subtitleValue && (
          <span className="font-medium">{subtitleValue}</span>
        )}
        {subtitle && <span>{subtitle}</span>}
      </p>
    </div>
  )
}
