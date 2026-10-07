"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, apiPost, formatMoney, uuid } from "@/lib/client";

type QatType = { id: string; name: string; defaultPrice: string };
type Party = { id: string; name: string; phone: string | null; balance: string };
type CartItem = { qatTypeId: string | null; qatTypeName: string; quantity: number; unitPrice: number };
type QueueOp = {
  clientUuid: string;
  entity: "sale" | "purchase";
  createdAt: string;
  payload: Record<string, unknown>;
};

const QUEUE_KEY = "qat_offline_queue";

function readQueue(): QueueOp[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]") as QueueOp[];
  } catch {
    return [];
  }
}

function writeQueue(ops: QueueOp[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(ops));
}

export default function PosPage() {
  const [mode, setMode] = useState<"sale" | "purchase">("sale");
  const [types, setTypes] = useState<QatType[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [search, setSearch] = useState("");
  const [partyId, setPartyId] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [activeType, setActiveType] = useState<QatType | null>(null);
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("0");
  const [paid, setPaid] = useState("0");
  const [target, setTarget] = useState<"qty" | "price" | "paid">("price");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(0);

  const partyEndpoint = mode === "sale" ? "/api/v1/customers" : "/api/v1/suppliers";

  const loadParties = useCallback(async () => {
    const rows = await apiGet<Party[]>(`${partyEndpoint}?q=${encodeURIComponent(search)}`);
    setParties(rows);
  }, [partyEndpoint, search]);

  useEffect(() => {
    apiGet<QatType[]>("/api/v1/qat-types").then(setTypes).catch(() => undefined);
  }, []);

  useEffect(() => {
    loadParties().catch(() => undefined);
    setPartyId(null);
  }, [loadParties]);

  useEffect(() => {
    setPending(readQueue().length);
  }, []);

  const total = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
    [cart],
  );
  const remaining = Math.max(total - Number(paid || 0), 0);

  function tap(value: string) {
    const setter = target === "qty" ? setQty : target === "price" ? setPrice : setPaid;
    const current = target === "qty" ? qty : target === "price" ? price : paid;
    if (value === "C") return setter("0");
    if (value === "←") return setter(current.length <= 1 ? "0" : current.slice(0, -1));
    setter(current === "0" ? value : current + value);
  }

  function addToCart() {
    if (!activeType) return setMessage("اختر نوع القات أولاً");
    const q = Number(qty || 0);
    const p = Number(price || 0);
    if (q <= 0 || p <= 0) return setMessage("أدخل الكمية والسعر");
    setCart((c) => [
      ...c,
      { qatTypeId: activeType.id, qatTypeName: activeType.name, quantity: q, unitPrice: p },
    ]);
    setQty("1");
    setPrice("0");
    setMessage(null);
  }

  async function flushQueue() {
    const ops = readQueue();
    if (!ops.length) return;
    try {
      const res = await apiPost<{ summary: { applied: number; duplicate: number; failed: number } }>(
        "/api/v1/sync/batch",
        { deviceId: "web-pos", operations: ops },
      );
      writeQueue([]);
      setPending(0);
      setMessage(
        `تمت المزامنة: ${res.summary.applied} عملية (مكررة ${res.summary.duplicate}، فاشلة ${res.summary.failed})`,
      );
    } catch {
      setMessage("لا يوجد اتصال — ستتم المزامنة لاحقاً");
    }
  }

  useEffect(() => {
    const handler = () => void flushQueue();
    window.addEventListener("online", handler);
    return () => window.removeEventListener("online", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit() {
    if (!cart.length) return setMessage("السلة فارغة");
    const paidNum = Number(paid || 0);
    if (paidNum < total && !partyId) {
      return setMessage(mode === "sale" ? "البيع الآجل يتطلب عميل" : "الشراء الآجل يتطلب مورد");
    }
    setBusy(true);
    const clientUuid = uuid();
    const payload: Record<string, unknown> = {
      items: cart,
      paidAmount: paidNum,
      clientUuid,
      ...(mode === "sale" ? { customerId: partyId } : { supplierId: partyId }),
    };

    try {
      await apiPost(mode === "sale" ? "/api/v1/sales" : "/api/v1/purchases", payload);
      setMessage(`✅ تم حفظ ${mode === "sale" ? "فاتورة البيع" : "فاتورة الشراء"} بمبلغ ${formatMoney(total)}`);
      setCart([]);
      setPaid("0");
      loadParties().catch(() => undefined);
    } catch (error) {
      const ops = readQueue();
      ops.push({ clientUuid, entity: mode, createdAt: new Date().toISOString(), payload });
      writeQueue(ops);
      setPending(ops.length);
      setMessage(
        `📴 تم الحفظ محلياً (${error instanceof Error ? error.message : "غير متصل"}) — بانتظار المزامنة`,
      );
      setCart([]);
      setPaid("0");
    } finally {
      setBusy(false);
    }
  }

  async function quickAddParty() {
    const name = search.trim();
    if (name.length < 2) return setMessage("اكتب الاسم في خانة البحث ثم أضف");
    const row = await apiPost<Party>(partyEndpoint, { name });
    setParties((p) => [row, ...p]);
    setPartyId(row.id);
    setMessage(`تمت إضافة ${row.name}`);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
      <section className="space-y-3">
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-emerald-950/60 p-1">
          {(["sale", "purchase"] as const).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setCart([]);
              }}
              className={`rounded-lg py-2 text-sm font-black ${mode === m ? "bg-emerald-500 text-emerald-950" : "text-emerald-200"}`}
            >
              {m === "sale" ? "🧾 بيع" : "📦 شراء"}
            </button>
          ))}
        </div>

        <div className="card">
          <p className="label">أنواع القات</p>
          <div className="flex flex-wrap gap-2">
            {types.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setActiveType(t);
                  setPrice(String(Math.round(Number(t.defaultPrice))));
                  setTarget("qty");
                }}
                className={`chip ${activeType?.id === t.id ? "chip-active" : ""}`}
              >
                {t.name}
              </button>
            ))}
            {types.length === 0 && <p className="text-xs text-emerald-200/50">أضف أنواع القات من الإعدادات</p>}
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            {([
              ["qty", "الكمية", qty],
              ["price", "السعر", price],
              ["paid", "المدفوع", paid],
            ] as const).map(([key, label, value]) => (
              <button
                key={key}
                onClick={() => setTarget(key)}
                className={`rounded-xl border p-2 text-center ${
                  target === key ? "border-emerald-400 bg-emerald-500/15" : "border-emerald-500/20 bg-emerald-950/50"
                }`}
              >
                <span className="block text-[10px] text-emerald-200/60">{label}</span>
                <span className="block text-lg font-black text-emerald-100">{value}</span>
              </button>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "←"].map((k) => (
              <button
                key={k}
                onClick={() => tap(k)}
                className="rounded-xl bg-emerald-900/50 py-3 text-lg font-black text-emerald-100 active:scale-95"
              >
                {k}
              </button>
            ))}
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <button onClick={() => tap("C")} className="btn-ghost">
              مسح
            </button>
            <button onClick={addToCart} className="btn-primary">
              + إضافة للسلة
            </button>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="card">
          <p className="label">{mode === "sale" ? "العميل" : "المورد"}</p>
          <div className="flex gap-2">
            <input
              className="field"
              placeholder="بحث بالاسم أو الجوال..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button onClick={quickAddParty} className="btn-ghost shrink-0">
              + جديد
            </button>
          </div>
          <div className="scroll-x mt-2 flex gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setPartyId(null)}
              className={`chip shrink-0 ${partyId === null ? "chip-active" : ""}`}
            >
              نقدي بدون حساب
            </button>
            {parties.map((p) => (
              <button
                key={p.id}
                onClick={() => setPartyId(p.id)}
                className={`chip shrink-0 ${partyId === p.id ? "chip-active" : ""}`}
              >
                {p.name}
                {Number(p.balance) !== 0 && (
                  <span className="mr-1 text-[10px] opacity-70">({formatMoney(p.balance)})</span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black text-emerald-100">السلة</h2>
            {pending > 0 && (
              <button onClick={flushQueue} className="rounded-lg bg-amber-500/20 px-2 py-1 text-[11px] font-bold text-amber-200">
                📴 {pending} بانتظار المزامنة — مزامنة الآن
              </button>
            )}
          </div>
          <ul className="mt-2 space-y-2">
            {cart.map((item, index) => (
              <li
                key={`${item.qatTypeName}-${index}`}
                className="flex items-center justify-between rounded-xl bg-emerald-900/30 px-3 py-2 text-sm"
              >
                <span className="text-emerald-100">
                  {item.qatTypeName} × {item.quantity}
                </span>
                <span className="flex items-center gap-2">
                  <span className="font-black text-emerald-300">
                    {formatMoney(item.quantity * item.unitPrice)}
                  </span>
                  <button
                    onClick={() => setCart((c) => c.filter((_, i) => i !== index))}
                    className="text-xs text-rose-300"
                  >
                    حذف
                  </button>
                </span>
              </li>
            ))}
            {cart.length === 0 && <li className="text-xs text-emerald-200/50">لم تتم إضافة أصناف بعد</li>}
          </ul>

          <div className="mt-3 space-y-1 border-t border-emerald-500/15 pt-3 text-sm">
            <div className="flex justify-between">
              <span className="text-emerald-200/60">الإجمالي</span>
              <span className="font-black text-emerald-200">{formatMoney(total)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-emerald-200/60">المدفوع</span>
              <span className="font-black text-sky-300">{formatMoney(Number(paid || 0))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-emerald-200/60">المتبقي (آجل)</span>
              <span className="font-black text-amber-300">{formatMoney(remaining)}</span>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button onClick={() => setPaid(String(total))} className="btn-ghost">
              دفع كامل نقداً
            </button>
            <button onClick={submit} disabled={busy} className="btn-primary">
              {busy ? "جارٍ الحفظ..." : "حفظ الفاتورة"}
            </button>
          </div>

          {message && (
            <p className="mt-3 rounded-lg bg-emerald-500/10 p-2 text-xs text-emerald-200">{message}</p>
          )}
        </div>
      </section>
    </div>
  );
}
