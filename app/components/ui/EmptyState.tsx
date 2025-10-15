export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="text-center py-12">
      {icon && (
        <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-gray-800 border border-gray-700 mb-4">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
      <p className="text-gray-400 mb-6">{description}</p>
      {action && <div>{action}</div>}
    </div>
  );
}
