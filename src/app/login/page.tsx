'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { login } from '@/lib/auth';
import { useAuth } from '@/contexts/AuthContext';
import { useSystemSettings } from '@/contexts/SystemSettingsContext';

export default function LoginPage() {
  const { login: contextLogin } = useAuth();
  const { settings, hydrated } = useSystemSettings();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const platformName =
    (hydrated && settings.general.platformName) || '林智森林智能监控平台';

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const tokens = await login(username, password);
      contextLogin(tokens.access, tokens.refresh);
      window.location.href = '/dashboard';
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败，请重试');
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0a1628] text-[#e8f1ff]">
      {/* 全幅氛围 */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse 90% 70% at 18% 45%, rgba(59,130,246,0.14), transparent 55%),
            radial-gradient(ellipse 60% 50% at 85% 20%, rgba(16,185,129,0.08), transparent 50%),
            radial-gradient(ellipse 50% 40% at 70% 90%, rgba(59,130,246,0.06), transparent 45%),
            #0a1628
          `,
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.22]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(30,58,95,0.55) 1px, transparent 1px),
            linear-gradient(90deg, rgba(30,58,95,0.55) 1px, transparent 1px)
          `,
          backgroundSize: '56px 56px',
        }}
      />
      {/* 左侧雷达环 */}
      <div className="pointer-events-none absolute left-[-8%] top-1/2 hidden h-[720px] w-[720px] -translate-y-1/2 lg:block">
        <div className="absolute inset-[8%] rounded-full border border-[#1e3a5f]/50" />
        <div className="absolute inset-[18%] animate-[pulse_6s_ease-in-out_infinite] rounded-full border border-[#3b82f6]/25" />
        <div className="absolute inset-[30%] rounded-full border border-[#1e3a5f]/40" />
        <div className="absolute inset-[42%] rounded-full border border-[#10b981]/15" />
        <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#3b82f6] shadow-[0_0_20px_#3b82f6]" />
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#3b82f6]/60 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#1e3a5f] to-transparent" />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1280px] flex-col lg:flex-row">
        {/* 左侧：品牌英雄区 */}
        <section
          className={`flex flex-1 flex-col justify-center px-8 py-12 sm:px-12 lg:px-16 xl:px-20 transition-all duration-700 ${
            mounted ? 'translate-x-0 opacity-100' : '-translate-x-4 opacity-0'
          }`}
        >
          <div className="mb-8 flex items-center gap-3">
            <div className="relative flex h-14 w-14 items-center justify-center rounded-xl border border-[#1e3a5f] bg-[#152238] shadow-[0_0_40px_rgba(59,130,246,0.2)]">
              <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-[#10b981] shadow-[0_0_10px_#10b981]" />
              <svg
                className="h-7 w-7 text-[#3b82f6]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.6}
                  d="M12 3c-1.5 3-4 5-7 6 1.8 4.2 5.2 7.2 7 8.5 1.8-1.3 5.2-4.3 7-8.5-3-1-5.5-3-7-6z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.6}
                  d="M12 17v4"
                />
              </svg>
            </div>
            <div className="font-mono text-xs tracking-[0.28em] text-[#3b82f6]">
              SMARTFOREST
            </div>
          </div>

          <h1 className="max-w-[16ch] text-4xl font-semibold leading-[1.15] tracking-tight text-[#e8f1ff] sm:text-5xl xl:text-[3.5rem]">
            {platformName}
          </h1>

          <p className="mt-6 max-w-md text-base leading-relaxed text-[#8b9bb4] sm:text-lg">
            全域感知 · 智能预警 · 一图指挥
          </p>

          <div className="mt-10 hidden h-px w-48 bg-gradient-to-r from-[#3b82f6]/70 to-transparent lg:block" />

          <ul className="mt-8 hidden gap-8 text-sm text-[#8b9bb4] lg:flex">
            <li className="flex flex-col gap-1">
              <span className="font-mono text-[10px] tracking-wider text-[#5a6f8f]">
                PIPELINE
              </span>
              <span className="text-[#e8f1ff]/90">物联接入</span>
            </li>
            <li className="flex flex-col gap-1">
              <span className="font-mono text-[10px] tracking-wider text-[#5a6f8f]">
                ALERT
              </span>
              <span className="text-[#e8f1ff]/90">火情告警</span>
            </li>
            <li className="flex flex-col gap-1">
              <span className="font-mono text-[10px] tracking-wider text-[#5a6f8f]">
                COMMAND
              </span>
              <span className="text-[#e8f1ff]/90">态势处置</span>
            </li>
          </ul>

          <p className="mt-auto hidden pt-16 font-mono text-[10px] tracking-wide text-[#5a6f8f] lg:block">
            FOREST INTELLIGENCE · COMMAND CONSOLE
          </p>
        </section>

        {/* 右侧：登录 */}
        <section
          className={`flex flex-1 items-center justify-center px-6 pb-12 sm:px-10 lg:px-12 lg:pb-0 transition-all delay-100 duration-700 ${
            mounted ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
          }`}
        >
          <div className="w-full max-w-[420px]">
            <div className="rounded-xl border border-[#1e3a5f] bg-[#152238]/90 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-md sm:p-10">
              <div className="mb-8 flex items-end justify-between gap-4 border-b border-[#1e3a5f] pb-5">
                <div>
                  <h2 className="text-xl font-medium text-[#e8f1ff]">身份认证</h2>
                  <p className="mt-1.5 text-xs text-[#8b9bb4]">
                    登录后进入指挥中心
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5 pb-0.5 text-[11px] text-[#8b9bb4]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#10b981] animate-pulse" />
                  运行正常
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label
                    htmlFor="username"
                    className="mb-2 block text-xs text-[#8b9bb4]"
                  >
                    用户名
                  </label>
                  <input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full rounded-lg border border-[#1e3a5f] bg-[#0a1628] px-4 py-3 text-sm text-[#e8f1ff] placeholder:text-[#5a6f8f] outline-none transition-colors focus:border-[#3b82f6] focus:ring-1 focus:ring-[#3b82f6]/40 disabled:opacity-60"
                    placeholder="请输入用户名"
                    required
                    disabled={loading}
                    autoComplete="username"
                  />
                </div>

                <div>
                  <label
                    htmlFor="password"
                    className="mb-2 block text-xs text-[#8b9bb4]"
                  >
                    密码
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-lg border border-[#1e3a5f] bg-[#0a1628] px-4 py-3 text-sm text-[#e8f1ff] placeholder:text-[#5a6f8f] outline-none transition-colors focus:border-[#3b82f6] focus:ring-1 focus:ring-[#3b82f6]/40 disabled:opacity-60"
                    placeholder="请输入密码"
                    required
                    disabled={loading}
                    autoComplete="current-password"
                  />
                </div>

                {error ? (
                  <div className="rounded-lg border border-[#ef4444]/35 bg-[#ef4444]/10 px-3 py-2.5">
                    <p className="text-xs text-[#ef4444]">{error}</p>
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-[#3b82f6] px-4 py-3.5 text-sm font-medium text-white shadow-[0_0_28px_rgba(59,130,246,0.25)] transition-colors hover:bg-[#2563eb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6]/50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <svg
                        className="h-4 w-4 animate-spin"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        aria-hidden
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      认证中…
                    </>
                  ) : (
                    '进入指挥中心'
                  )}
                </button>
              </form>

              <p className="mt-8 text-center text-[11px] leading-relaxed text-[#5a6f8f]">
                账号由组织管理员发放，登录后按组织权限访问数据
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
