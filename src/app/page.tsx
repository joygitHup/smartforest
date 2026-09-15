'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';

export default function Home() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (isAuthenticated()) {
      router.replace('/dashboard');
    } else {
      router.replace('/login');
    }
    setChecked(true);
  }, [router]);

  if (!checked) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0a1628]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#3b82f6] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[#8b9bb4]">正在加载...</p>
        </div>
      </div>
    );
  }

  return null;
}
