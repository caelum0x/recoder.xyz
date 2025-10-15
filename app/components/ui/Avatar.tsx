export function Avatar({ 
  src, 
  alt, 
  size = 'md',
  fallback 
}: { 
  src?: string; 
  alt?: string; 
  size?: 'sm' | 'md' | 'lg'; 
  fallback?: string;
}) {
  const sizes = { sm: 'w-8 h-8', md: 'w-12 h-12', lg: 'w-16 h-16' };
  
  return (
    <div className={`${sizes[size]} rounded-full bg-gradient-to-br from-orange-500 to-purple-600 flex items-center justify-center overflow-hidden`}>
      {src ? (
        <img src={src} alt={alt} className="w-full h-full object-cover" />
      ) : (
        <span className="text-white font-semibold">
          {fallback || alt?.charAt(0).toUpperCase() || '?'}
        </span>
      )}
    </div>
  );
}
