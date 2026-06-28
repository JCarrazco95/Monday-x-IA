import { useState } from "react";
import { Check, ShieldCheck, TrendingUp, Wallet, CheckCircle2, Phone } from "lucide-react";
import { api } from "../lib/api";
import { Logo } from "../components/Logo";

// ===========================================================================
//  Landing page de demo de MAXIRent.
//  Al enviar, el lead se crea en Monday y el análisis IA se dispara solo.
// ===========================================================================

const EMPTY = { nombre: "", razonSocial: "", email: "", telefono: "", mensaje: "" };

const BENEFICIOS = [
  { icon: ShieldCheck, t: "Mantenimiento y seguro incluidos" },
  { icon: TrendingUp, t: "Flota escalable por proyecto" },
  { icon: Wallet, t: "100% deducible" }
];

export function LandingPage() {
  const [form, setForm] = useState({ ...EMPTY });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre.trim() && !form.razonSocial.trim()) {
      setError("Por favor ingresa tu nombre o el de tu empresa.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      await api.intake(form);
      setSent(true);
      setForm({ ...EMPTY });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg text-text">
      <header className="border-b border-border bg-surface/90 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <Logo className="h-8 w-auto" />
          <a href="tel:8112922222" className="ml-auto flex items-center gap-1.5 text-xs text-text-muted hover:text-text">
            <Phone size={14} /> Renta de flotas para empresas
          </a>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-10 px-6 py-12 lg:grid-cols-2 lg:py-20">
        <div className="flex flex-col justify-center">
          <h1 className="text-4xl font-bold leading-tight">
            La flota que tu empresa necesita, <span className="text-accent">sin inmovilizar capital</span>.
          </h1>
          <p className="mt-4 text-text-muted">
            Pick-ups, vans y camiones en renta flexible. Cotiza en minutos y un asesor te contacta con la mejor opción para tu operación.
          </p>
          <ul className="mt-6 flex flex-col gap-2.5 text-sm">
            {BENEFICIOS.map((b) => {
              const Icon = b.icon;
              return (
                <li key={b.t} className="flex items-center gap-2.5">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-success/15 text-success"><Icon size={14} /></span>
                  {b.t}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
          {sent ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-success/15 text-success"><CheckCircle2 size={30} /></div>
              <h2 className="text-lg font-semibold">¡Gracias! Recibimos tu solicitud.</h2>
              <p className="mt-2 text-sm text-text-muted">Un asesor de MAXIRent te contactará muy pronto con tu cotización.</p>
              <button onClick={() => setSent(false)} className="mt-6 rounded-lg border border-border px-4 py-2 text-sm text-text-muted hover:text-text">
                Enviar otra solicitud
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold">Cotiza tu flota</h2>
              <Input label="Nombre*" value={form.nombre} onChange={set("nombre")} placeholder="Tu nombre" />
              <Input label="Empresa (razón social)" value={form.razonSocial} onChange={set("razonSocial")} placeholder="Ej. Construcciones del Norte SA de CV" />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Email" value={form.email} onChange={set("email")} placeholder="tu@empresa.com" type="email" />
                <Input label="Teléfono" value={form.telefono} onChange={set("telefono")} placeholder="55 1234 5678" />
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-text-muted">¿Qué necesitas?</span>
                <textarea value={form.mensaje} onChange={set("mensaje")} rows={3} placeholder="Ej. Necesitamos 3 pick-ups 4x4 por 6 meses para un proyecto en Monterrey." className="rounded-lg border border-border bg-bg px-3 py-2 text-sm placeholder:text-text-muted/60 focus:outline-none focus:ring-1 focus:ring-accent" />
              </label>

              {error && <p className="text-sm text-danger">{error}</p>}

              <button type="submit" disabled={sending} className="mt-1 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent/90 disabled:opacity-50">
                {sending ? "Enviando…" : "Solicitar cotización"}
              </button>
              <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-text-muted">
                <Check size={12} /> Tu lead se registra en Monday y el análisis IA se ejecuta automáticamente.
              </p>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}

function Input({ label, value, onChange, placeholder, type = "text" }: {
  label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; placeholder?: string; type?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-text-muted">{label}</span>
      <input type={type} value={value} onChange={onChange} placeholder={placeholder} className="h-10 rounded-lg border border-border bg-bg px-3 text-sm placeholder:text-text-muted/60 focus:outline-none focus:ring-1 focus:ring-accent" />
    </label>
  );
}
