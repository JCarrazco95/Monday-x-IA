import { useState } from "react";

// Logo de MAXIRent. Usa el SVG oficial; si no carga, cae a un placeholder.
// Para producción/offline, descarga el archivo y guárdalo en
// frontend/public/maxirent-logo.svg, luego cambia LOGO_SRC a "/maxirent-logo.svg".
const LOGO_SRC = "https://www.maxirent.com.mx/img/comunes/maxirent-logo.svg";

export function Logo({ className = "h-8 w-auto", showText = true }: { className?: string; showText?: boolean }) {
  const [err, setErr] = useState(false);

  if (err) {
    return (
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent-2 text-base font-bold text-white">M</div>
        {showText && <span className="text-sm font-semibold leading-tight">MAXIRent</span>}
      </div>
    );
  }

  return <img src={LOGO_SRC} alt="MAXIRent" className={className} onError={() => setErr(true)} />;
}
