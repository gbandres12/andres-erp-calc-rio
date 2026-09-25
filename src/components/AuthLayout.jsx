import React from "react";

const BACKGROUND_URL =
  "https://media.base44.com/images/public/68ea91a66a9614db4a82043d/f5c114651_ChatGPTImage25desetde202611_41_41.png";

export default function AuthLayout({ icon: Icon, title, subtitle, footer, children }) {
  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 py-10 overflow-hidden">
      {/* Foto de fundo — porto/fazenda */}
      <div
        className="absolute inset-0 bg-cover bg-center scale-105"
        style={{ backgroundImage: `url(${BACKGROUND_URL})` }}
        aria-hidden="true"
      />
      {/* Véu escuro para legibilidade */}
      <div
        className="absolute inset-0 bg-slate-950/60"
        aria-hidden="true"
      />
      {/* Suave gradiente inferior */}
      <div
        className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-slate-950/70 to-transparent"
        aria-hidden="true"
      />

      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/95 shadow-lg shadow-black/20 backdrop-blur mb-4">
            <Icon className="w-7 h-7 text-slate-900" aria-hidden="true" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white drop-shadow-md">{title}</h1>
          {subtitle && <p className="text-white/80 mt-2 drop-shadow-sm">{subtitle}</p>}
        </div>

        <div className="rounded-2xl border border-white/40 bg-white/90 shadow-2xl shadow-black/30 backdrop-blur-md p-8">
          {children}
        </div>

        {footer && (
          <p className="text-center text-sm text-white/70 mt-6 drop-shadow-sm">{footer}</p>
        )}
      </div>
    </div>
  );
}