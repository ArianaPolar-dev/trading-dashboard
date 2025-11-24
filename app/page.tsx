'use client';

import { useState, useMemo } from 'react';
import { AppState, Trade, BalanceMovement } from '../types/trading';
import Sidebar from './Sidebar';
import { usePersistentState } from './usePersistentState';
import { Line, Bar } from 'react-chartjs-2';
import { motion, AnimatePresence } from 'framer-motion';
import annotationPlugin from "chartjs-plugin-annotation";
import {
  Chart, CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, Tooltip
} from 'chart.js';
import { startOfWeek, startOfMonth, addDays, format } from 'date-fns';

Chart.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, Tooltip, annotationPlugin
);

const initialState: AppState = {
  startingBalance: 23.25,
  baseBet: 1.5,
  maxLevel: 3,
  reservedForLevel4: 10,
  payout: 0.85,
  retiroPct: 25,
  semaforoPct: 2,
  semaforoDias: 3,
  trades: [],
  movements: [],
};

export default function HomePage() {
  const [section, setSection] = useState('dashboard');
  const [state, setState] = usePersistentState<AppState>('trading-app-state', initialState);

  // --------- Registro y edición -------------
  const [movementAmount, setMovementAmount] = useState<number>(0);
  const [movementType, setMovementType] = useState<'deposit' | 'withdraw'>('deposit');
  const [showModal, setShowModal] = useState(false);
  const [tradeDay, setTradeDay] = useState<string>(new Date().toISOString().slice(0, 10));

  // --- Serie martingala por día ---
  const seriesByDay = useMemo(() => {
    const map: Record<string, Trade[]> = {};
    state.trades.forEach(t => {
      const day = t.date.slice(0, 10);
      if (!map[day]) map[day] = [];
      map[day].push(t);
    });
    return map;
  }, [state.trades]);

  const today = new Date();
  const startWeek = startOfWeek(today, { weekStartsOn: 1 });
  const startMonth = startOfMonth(today);

  function getRangeArray(startDate: Date, days: number) {
    return Array.from({ length: days }, (_, idx) => format(addDays(startDate, idx), 'yyyy-MM-dd'));
  }
  const weekDates = getRangeArray(startWeek, 7);
  const monthDates = getRangeArray(startMonth, today.getDate());

  function getDailySummary(day: string) {
    const trades = seriesByDay[day] || [];
    if (trades.length === 0) return null;
    const pnl = trades.reduce((acc, t) => {
      const risk = t.amount * Math.pow(2, t.level - 1);
      return acc + (t.result === 'win' ? risk * t.payout : -risk);
    }, 0);
    const maxLevel = Math.max(...trades.map(t => t.level));
    return {
      pnl, win: trades[trades.length - 1]?.result === 'win',
      numOps: trades.length, maxLevel, trades
    };
  }

  // -- Operación/Secuencia diaria --
  const [tradeAmount, setTradeAmount] = useState<number>(initialState.baseBet);
  const [tradeLevel, setTradeLevel] = useState<number>(1);
  const [tradeResult, setTradeResult] = useState<'win' | 'loss'>('win');
  const currentDayTrades = seriesByDay[tradeDay] || [];
  const canAddTrade =
    currentDayTrades.length === 0 ||
    currentDayTrades[currentDayTrades.length - 1].result === 'loss';

  const addTrade = () => {
    if (!tradeAmount || tradeAmount <= 0) return;
    if (!canAddTrade) return;
    const newTrade: Trade = {
      id: typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID() : Math.random().toString(36).slice(2),
      date: tradeDay + 'T12:00:00',
      amount: tradeAmount, level: tradeLevel,
      result: tradeResult, payout: state.payout,
    };
    setState(prev => ({
      ...prev,
      trades: [...prev.trades, newTrade],
    }));
    setTradeAmount(state.baseBet);
    setTradeLevel(tradeResult === 'loss' ? tradeLevel + 1 : 1);
    setTradeResult('win');
  };

  // -- Fondos --
  const addMovement = () => {
    if (!movementAmount || movementAmount <= 0) return;
    setShowModal(true);
  };
  const confirmMovement = () => {
    const newMovement: BalanceMovement = {
      id: typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID() : Math.random().toString(36).slice(2),
      date: new Date().toISOString(),
      type: movementType,
      amount: movementAmount,
    };
    setState(prev => ({ ...prev, movements: [...prev.movements, newMovement], }));
    setMovementAmount(0); setShowModal(false);
  };

  // ----------- Estadísticas/visualizaciones históricas -----------
  const equityHistory = useMemo(() => {
    let bal = state.startingBalance + state.movements.reduce(
      (acc, m) => acc + (m.type === 'deposit' ? m.amount : -m.amount), 0
    );
    let peak = bal;
    let maxDrawdown = 0;
    const byDay: { date: string, equity: number, drawdown: number }[] = [];
    Object.keys(seriesByDay).sort().forEach(day => {
      const summary = getDailySummary(day); if (!summary) return;
      bal += summary.pnl;
      if (bal > peak) peak = bal;
      maxDrawdown = Math.min(maxDrawdown, bal - peak);
      byDay.push({ date: day, equity: bal, drawdown: bal - peak });
    });
    return { byDay, maxDrawdown: Math.abs(maxDrawdown) };
  }, [seriesByDay, state.startingBalance, state.movements]);

  const winrateHistory = useMemo(() =>
    equityHistory.byDay.map(({ date }) => {
      const sum = getDailySummary(date);
      return { date, winrate: sum?.win ? 100 : 0 };
    }), [equityHistory, getDailySummary]);

  // ----------- Proyección ganancia/simulador sencillo ----------
  const [simOps, setSimOps] = useState(6);
  const [simWinrate, setSimWinrate] = useState(0.6);
  const [simAmount, setSimAmount] = useState(state.baseBet);
  const [simPayout, setSimPayout] = useState(state.payout);

  const simulation = useMemo(() => {
    let series = [];
    let balance = state.startingBalance;
    let wins = 0, losses = 0;
    for (let i = 0; i < simOps; i++) {
      const rnd = Math.random();
      if (rnd < simWinrate) {
        balance += simAmount * simPayout; wins++;
      } else {
        balance -= simAmount; losses++;
      }
      series.push(Number(balance.toFixed(2)));
    }
    return { series, wins, losses, last: balance };
  }, [simOps, simWinrate, simAmount, simPayout, state.startingBalance]);

  const simLabel = Array.from({ length: simOps }, (_, i) => `#${i + 1}`);
  const simChart = {
    labels: simLabel,
    datasets: [{
      label: 'Curva Equity (Simulada)',
      data: simulation.series,
      borderColor: 'rgb(176,34,146)',
      backgroundColor: 'rgba(176,34,146,0.12)',
      tension: 0.11,
    }],
  };

  // ----------- Zona de retiro en equity histórico -----------
  const retiroTarget = useMemo(() =>
    state.startingBalance * (1 + (state.retiroPct ?? 25) / 100),
    [state.startingBalance, state.retiroPct]
  );
  const equityHistoryChart = {
    labels: equityHistory.byDay.map(d => d.date),
    datasets: [{
      label: 'Equity',
      data: equityHistory.byDay.map(d => d.equity),
      borderColor: 'rgb(220,38,38)',
      backgroundColor: 'rgba(220,38,38,0.16)',
      tension: 0.15
    }]
  };

  // --- CALCULO PARA canReachLevel4 / canReachMaxLevel ---
  const progressionSum = Array.from({ length: state.maxLevel }).reduce(
    (acc, _, idx) => acc + Math.pow(2, idx), 0
  );
  const requiredForMax = state.baseBet * progressionSum;
  const maxRefLevel = 4;
  const progressionSum4 = Array.from({ length: maxRefLevel }).reduce(
    (acc, _, idx) => acc + Math.pow(2, idx), 0
  );
  const requiredFor4 = state.baseBet * progressionSum4;
  const balanceForCalc =
    state.startingBalance +
    state.movements.reduce((acc, m) => acc + (m.type === 'deposit' ? m.amount : -m.amount), 0) +
    Object.values(seriesByDay)
      .flat()
      .reduce((acc, t) => {
        const risk = t.amount * Math.pow(2, t.level - 1);
        return acc + (t.result === 'win' ? risk * t.payout : -risk);
      }, 0);
  const canReachMaxLevel = balanceForCalc >= requiredForMax + state.reservedForLevel4;
  const canReachLevel4 = balanceForCalc >= requiredFor4 + state.reservedForLevel4;

  // ---------- SEMÁFORO Y REGLAS PERSONALIZADAS -------------
  const semDias = Number(state.semaforoDias ?? 3);
  const semPct = Number(state.semaforoPct ?? 2) / 100;
  const ultimos = equityHistory.byDay.slice(-semDias - 1);
  let prev = ultimos.length > 0 ? ultimos[0].equity : 1;
  let verdes = 0;
  for (let i = 1; i < ultimos.length; i++) {
    const day = ultimos[i];
    const gain = (day.equity - prev) / prev;
    if (gain >= semPct) verdes++;
    prev = day.equity;
  }
  let semaforo = "red";
  if (verdes === semDias) semaforo = "green";
  else if (verdes >= Math.max(1, semDias - 1)) semaforo = "yellow";

  // --- Alertas: solo margen para x2 o varios x3 ---
  const todaySummary = getDailySummary(tradeDay);
  let martiAlert = "";
  if (todaySummary && todaySummary.maxLevel >= 3) martiAlert = "Alerta: Llegaste a x3 en martingala hoy. Observa tu regla de riesgo.";
  else if ((!canReachLevel4 && canReachMaxLevel)) martiAlert = "¡Alerta! Solo margen hasta x2, considera reducir el monto base.";

  // ----------- CALENDARIO/MES -------------
  function CalendarTable({ dates }: { dates: string[] }) {
    return (
      <div className="grid grid-cols-7 gap-2 mb-4">
        {dates.map(day => {
          const dSum = getDailySummary(day);
          return (
            <div key={day}
              className={`rounded p-2 border h-28 flex flex-col items-center justify-center text-center ${
                dSum ? dSum.win
                  ? 'bg-green-950/40 border-green-700'
                  : 'bg-red-950/30 border-red-600'
                  : 'bg-neutral-900 border-neutral-800'
              }`}>
              <div className="text-xs text-neutral-400">{format(day, 'd/M')}</div>
              {dSum
                ? (
                  <>
                    <div className={dSum.pnl >= 0 ? "text-green-400 font-bold" : "text-red-400 font-bold"}>
                      ${dSum.pnl.toFixed(2)}
                    </div>
                    <div className="text-xs">Ops: {dSum.numOps}</div>
                    <div className="text-xs">Nivel máx: x{dSum.maxLevel}</div>
                  </>
                )
                : <div className="text-neutral-700 text-xs">Sin registro</div>
              }
            </div>
          );
        })}
      </div>
    );
  }

  // ----------- UI PRINCIPAL -------------
  return (
    <div className="flex min-h-screen bg-neutral-950 text-white">
      <Sidebar currentSection={section} setSection={setSection} />
      <main className="flex-1 p-6">
        {section === 'dashboard' && (
          <>
            <h1 className="mb-4 text-2xl font-bold">Dashboard Diario</h1>
            <div className="mb-4 flex gap-4">
              <div>
                <span className="block text-xs text-neutral-400 mb-1">Saldo Usable</span>
                <span className="block text-2xl">{balanceForCalc.toFixed(2)}</span>
              </div>
              <div>
                <span className="block text-xs text-neutral-400 mb-1">Semáforo subida monto</span>
                <div className="flex items-center gap-2 select-none">
                  <span className={`w-4 h-4 rounded-full ${semaforo === "green" ? "bg-green-500" : "bg-neutral-800 border"}`}></span>
                  <span className={`w-4 h-4 rounded-full ${semaforo === "yellow" ? "bg-yellow-400" : "bg-neutral-800 border"}`}></span>
                  <span className={`w-4 h-4 rounded-full ${semaforo === "red" ? "bg-red-600" : "bg-neutral-800 border"}`}></span>
                  <span className="text-xs ml-2">{semaforo === "green"
                    ? "Recomendado subir monto base"
                    : semaforo === "yellow"
                    ? "Casi listo"
                    : "No subir"}</span>
                </div>
              </div>
            </div>
            {martiAlert && (
              <div className="mb-4 p-3 bg-yellow-950/80 border-l-4 border-orange-400 text-yellow-200 rounded">{martiAlert}</div>
            )}
            <section className="mb-8 bg-neutral-900 rounded-xl p-4 border border-neutral-700">
              <h2 className="text-lg font-semibold mb-3">Nueva serie de trades para un día</h2>
              <label className="block mb-2 text-sm">Fecha operación:</label>
              <input
                type="date"
                value={tradeDay}
                onChange={e => setTradeDay(e.target.value)}
                className="mb-2 bg-neutral-800 rounded px-3 py-2 mr-4"
              />
              <div className="flex gap-3 mb-2">
                <div>
                  <label className="text-sm mb-1 block">Monto inicial</label>
                  <input
                    type="number"
                    value={tradeAmount}
                    onChange={e => setTradeAmount(Number(e.target.value))}
                    className="bg-neutral-800 rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="text-sm mb-1 block">Nivel martingala</label>
                  <input
                    type="number"
                    min={1}
                    value={tradeLevel}
                    readOnly
                    className="bg-neutral-800 rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="text-sm mb-1 block">Resultado</label>
                  <select
                    value={tradeResult}
                    onChange={e => setTradeResult(e.target.value as 'win' | 'loss')}
                    className="bg-neutral-800 rounded px-3 py-2"
                  >
                    <option value="win">Win</option>
                    <option value="loss">Loss</option>
                  </select>
                </div>
                <button
                  disabled={!canAddTrade}
                  onClick={addTrade}
                  className={`bg-red-600 hover:bg-red-500 transition-colors px-4 py-2 rounded font-semibold self-end ${canAddTrade ? '' : 'opacity-50 cursor-not-allowed'}`}
                >
                  Guardar trade
                </button>
              </div>
              {!canAddTrade && (
                <span className="text-sm text-orange-400">Ya has tenido una serie positiva ese día.</span>
              )}
              <div className="mt-4 text-xs text-neutral-400">
                Solo puedes registrar una serie positiva por día (tu método).
              </div>
              <div className="mt-4">
                {currentDayTrades.length > 0 && (
                  <div>
                    <h3 className="font-bold mb-1">Resumen de la serie del día</h3>
                    {currentDayTrades.map((t, idx) => (
                      <div key={t.id} className="flex gap-2 text-sm mb-1">
                        <span>#{idx + 1} ({t.level}): </span>
                        <span>${t.amount}</span>
                        <span className={t.result === 'win' ? "text-green-400" : "text-red-400"}>{t.result}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
            {/* Simulador Proyección */}
            <section className="bg-neutral-900 rounded-xl p-4 mb-6 border border-neutral-800">
              <h2 className="text-lg font-semibold mb-3">Simulación de Ganancia (Escenario)</h2>
              <div className="grid md:grid-cols-5 gap-4 items-end mb-4">
                <div>
                  <label className="text-xs mb-1 block">Saldo inicial</label>
                  <input type="number" value={state.startingBalance} readOnly className="bg-neutral-800 px-2 py-1 rounded w-full" />
                </div>
                <div>
                  <label className="text-xs mb-1 block">Monto base</label>
                  <input type="number" value={simAmount} onChange={e => setSimAmount(Number(e.target.value))} className="bg-neutral-800 px-2 py-1 rounded w-full" />
                </div>
                <div>
                  <label className="text-xs mb-1 block">Payout</label>
                  <input type="number" value={simPayout} step={0.01} min={0} max={1} onChange={e => setSimPayout(Number(e.target.value))} className="bg-neutral-800 px-2 py-1 rounded w-full" />
                </div>
                <div>
                  <label className="text-xs mb-1 block">Ops planeadas</label>
                  <input type="number" value={simOps} min={1} max={50} onChange={e => setSimOps(Number(e.target.value))} className="bg-neutral-800 px-2 py-1 rounded w-full" />
                </div>
                <div>
                  <label className="text-xs mb-1 block">Winrate</label>
                  <input type="number" value={simWinrate} step={0.01} min={0} max={1}
                    onChange={e => setSimWinrate(Number(e.target.value))} className="bg-neutral-800 px-2 py-1 rounded w-full" />
                </div>
              </div>
              <Line data={simChart} options={{ plugins: { legend: { display: false } }}} />
              <div className="mt-2 text-sm">
                Proyección final: <b className={simulation.last >= state.startingBalance ? "text-green-400" : "text-red-400"}>
                  ${simulation.last.toFixed(2)}
                </b> (Wins: {simulation.wins}, Losses: {simulation.losses})
              </div>
            </section>
          </>
        )}

        {section === 'calendario' && (
          <>
            <h2 className="mb-3 text-xl font-bold">Resumen semanal (últimos 7 días)</h2>
            <CalendarTable dates={weekDates} />
            <h2 className="mb-3 mt-8 text-xl font-bold">Resumen mensual</h2>
            <CalendarTable dates={monthDates} />
            <div className="mt-8 grid md:grid-cols-2 gap-5">
              <div className="bg-neutral-900 rounded-xl p-4">
                <h3 className="text-sm mb-2 font-bold">Equity histórico</h3>
                <Line data={equityHistoryChart} options={{
                  plugins: {
                    annotation: {
                      annotations: {
                        retiroLine: {
                          type: 'line',
                          yMin: retiroTarget,
                          yMax: retiroTarget,
                          borderColor: 'rgb(55,250,100)',
                          borderWidth: 2,
                          label: {
                            content: 'Zona de Retiro',
                            enabled: true,
                            backgroundColor: 'rgb(55,250,100)',
                            position: 'start'
                          }
                        }
                      }
                    }
                  }
                }} />
              </div>
              <div className="bg-neutral-900 rounded-xl p-4">
                <h3 className="text-sm mb-2 font-bold">Winrate diario</h3>
                <Bar data={{
                  labels: winrateHistory.map(d => d.date),
                  datasets: [{
                    label: 'Winrate (%)',
                    data: winrateHistory.map(d => d.winrate),
                    backgroundColor: 'rgba(78,225,72,0.4)'
                  }]
                }} />
              </div>
            </div>
            <div className="mt-8 bg-neutral-900 rounded-xl p-4">
              <h3 className="text-sm mb-2 font-bold">Drawdown máximo histórico</h3>
              <span className="text-lg text-red-400">${equityHistory.maxDrawdown.toFixed(2)}</span>
            </div>
          </>
        )}

        {section === 'fondos' && (
          <section>
            <h2 className="text-lg font-semibold mb-3">Fondos (Depósitos / Retiros)</h2>
            <div className="flex flex-col md:flex-row gap-3 items-end mb-3">
              <div className="flex flex-col flex-1">
                <label className="text-sm mb-1">Monto</label>
                <input
                  type="number"
                  value={movementAmount}
                  onChange={e => setMovementAmount(Number(e.target.value))}
                  className="bg-neutral-800 rounded px-3 py-2 outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="Ej: 50"
                />
              </div>
              <div className="flex flex-col">
                <label className="text-sm mb-1">Tipo</label>
                <select
                  value={movementType}
                  onChange={e =>
                    setMovementType(e.target.value as 'deposit' | 'withdraw')
                  }
                  className="bg-neutral-800 rounded px-3 py-2 outline-none focus:ring-2 focus:ring-red-500"
                >
                  <option value="deposit">Depósito</option>
                  <option value="withdraw">Retiro</option>
                </select>
              </div>
              <button
                onClick={addMovement}
                className="bg-red-600 hover:bg-red-500 transition-colors px-4 py-2 rounded font-semibold"
              >
                Añadir
              </button>
            </div>
            <AnimatePresence>
              {showModal && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  className="fixed inset-0 bg-black/70 flex items-center justify-center z-30"
                  onClick={() => setShowModal(false)}
                >
                  <motion.div
                    className="bg-neutral-900 p-10 rounded shadow-xl"
                    onClick={e => e.stopPropagation()}
                  >
                    <h2 className="mb-4 text-xl font-bold text-red-400">¿Confirmar {movementType === 'deposit' ? 'depósito' : 'retiro'}?</h2>
                    <div className="mb-2 text-lg">{movementAmount} USD</div>
                    <button onClick={confirmMovement} className="bg-red-600 px-4 py-2 rounded mr-3">Sí</button>
                    <button onClick={() => setShowModal(false)} className="bg-neutral-600 px-4 py-2 rounded">No</button>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="mt-4 max-h-56 overflow-y-auto text-sm divide-y divide-neutral-800">
              {state.movements.length === 0 && (
                <p className="text-neutral-500">
                  Aún no hay movimientos registrados.
                </p>
              )}
              {state.movements.map(m => (
                <div key={m.id} className="flex justify-between items-center py-2">
                  <span className="text-neutral-400">{new Date(m.date).toLocaleString()}</span>
                  <span className={m.type === 'deposit' ? 'text-green-400' : 'text-red-400'}>
                    {m.type === 'deposit' ? '+' : '-'}${m.amount.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {section === 'config' && (
          <section>
            <h2 className="text-lg font-semibold mb-3">Configuración avanzada</h2>
            <div className="mb-6">
              <label className="block text-sm mb-2">Balance inicial editable</label>
              <input
                type="number"
                value={state.startingBalance}
                onChange={e => setState(prev => ({ ...prev, startingBalance: Number(e.target.value) }))}
                className="bg-neutral-800 rounded px-3 py-2 outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
            <div className="grid md:grid-cols-4 gap-4 mb-4">
              <div className="flex flex-col">
                <label className="text-sm mb-1">Monto base (martingala)</label>
                <input
                  type="number"
                  value={state.baseBet}
                  onChange={e =>
                    setState(prev => ({ ...prev, baseBet: Number(e.target.value) || 0 }))
                  }
                  className="bg-neutral-800 rounded px-3 py-2 outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
              <div className="flex flex-col">
                <label className="text-sm mb-1">Payout</label>
                <input
                  type="number"
                  step="0.01"
                  value={state.payout}
                  onChange={e =>
                    setState(prev => ({ ...prev, payout: Number(e.target.value) || 0 }))
                  }
                  className="bg-neutral-800 rounded px-3 py-2 outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
              <div className="flex flex-col">
                <label className="text-sm mb-1">Nivel máximo martingala</label>
                <input
                  type="number"
                  min={1}
                  value={state.maxLevel}
                  onChange={e =>
                    setState(prev => ({ ...prev, maxLevel: Math.max(1, Number(e.target.value) || 1) }))
                  }
                  className="bg-neutral-800 rounded px-3 py-2 outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
              <div className="flex flex-col">
                <label className="text-sm mb-1">Colchón mínimo para x4</label>
                <input
                  type="number"
                  value={state.reservedForLevel4}
                  onChange={e =>
                    setState(prev => ({ ...prev, reservedForLevel4: Number(e.target.value) || 0 }))
                  }
                  className="bg-neutral-800 rounded px-3 py-2 outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
            </div>
            <div className="grid md:grid-cols-3 gap-4 mb-2 mt-2">
              <div className="flex flex-col">
                <label className="text-sm mb-1">% objetivo para retiro</label>
                <input
                  type="number"
                  value={state.retiroPct ?? 25}
                  onChange={e => setState(prev => ({ ...prev, retiroPct: Number(e.target.value) }))}
                  className="bg-neutral-800 rounded px-3 py-2 outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div className="flex flex-col">
                <label className="text-sm mb-1">% de ganancia mínima diaria (semaforo verde)</label>
                <input
                  type="number"
                  value={state.semaforoPct ?? 2}
                  onChange={e => setState(prev => ({ ...prev, semaforoPct: Number(e.target.value) }))}
                  className="bg-neutral-800 rounded px-3 py-2 outline-none focus:ring-2 focus:ring-yellow-500"
                />
              </div>
              <div className="flex flex-col">
                <label className="text-sm mb-1">N° días verdes seguidos (semaforo)</label>
                <input
                  type="number"
                  value={state.semaforoDias ?? 3}
                  onChange={e => setState(prev => ({ ...prev, semaforoDias: Number(e.target.value) }))}
                  className="bg-neutral-800 rounded px-3 py-2 outline-none focus:ring-2 focus:ring-yellow-500"
                />
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
