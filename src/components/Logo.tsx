import { cx } from '../lib/utils';

export default function Logo({ dark = false, size = 'md' }: { dark?: boolean; size?: 'sm' | 'md' | 'lg' }) {
  const img = { sm: 'w-7 h-7', md: 'w-9 h-9', lg: 'w-12 h-12' }[size];
  const txt = { sm: 'text-lg', md: 'text-xl', lg: 'text-3xl' }[size];
  return (
    <span className="inline-flex items-center gap-2.5 select-none">
      <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="Brix Chat logo" className={img} />
      <span className={cx('font-display font-extrabold tracking-tight', txt, dark ? 'text-white' : 'text-slate-900')}>
        Brix<span className="text-brix-500">Chat</span>
      </span>
    </span>
  );
}
