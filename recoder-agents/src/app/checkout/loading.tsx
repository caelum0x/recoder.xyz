import { RecoderLogo } from '@/components/sidebar/recoder-logo';

export default function Loading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[100dvh] gap-6">
      <RecoderLogo size={32} className="animate-pulse" />
      <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
