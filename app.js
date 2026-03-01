// ============================================================
// Виртуальная лабораторная: испытание пластинчатого теплообменника
// Модель основана на методике определения Q, Δt_ln и k (см. практикум)
// и на инженерной модели ε-NTU для расчёта выходных температур.
//
// Входы задаём как: T1 (горячий вход), T3 (холодный вход),
// Vг (горячий расход), Vх фиксированный = 1.2 л/мин, k (Вт/(м2·К)).
// Выходы считаем: T4 (горячий выход), T2 (холодный выход).
// ============================================================

const F = 0.12;     // м2 — площадь теплообмена пластинчатого теплообменника
const VcFixed = 1.2; // л/мин — расход холодного контура (в методике постоянный)
const rho = 1000;   // кг/м3 — для воды, чтобы л/с численно = кг/с

// Таблица теплоёмкости воды (Дж/(кг·К)) по температуре (°C) — слабая зависимость.
// Для модели достаточно линейной интерполяции между узлами.
const cpTable = [
  { t: 0,   cp: 4218 },
  { t: 10,  cp: 4192 },
  { t: 20,  cp: 4182 },
  { t: 40,  cp: 4178 },
  { t: 60,  cp: 4184 },
  { t: 80,  cp: 4196 },
  { t: 100, cp: 4216 },
];

function lerp(a, b, x){ return a + (b - a) * x; }

function cpWater(tC){
  if (tC <= cpTable[0].t) return cpTable[0].cp;
  if (tC >= cpTable[cpTable.length - 1].t) return cpTable[cpTable.length - 1].cp;
  for (let i = 0; i < cpTable.length - 1; i++){
    const a = cpTable[i], b = cpTable[i+1];
    if (tC >= a.t && tC <= b.t){
      const x = (tC - a.t) / (b.t - a.t);
      return lerp(a.cp, b.cp, x);
    }
  }
  return 4180;
}

// ε-NTU для параллельного (прямоток) и противоточного теплообменников
function effectiveness(mode, NTU, Cr){
  if (NTU < 1e-12) return 0;
  // Cr = Cmin/Cmax, 0..1
  if (mode === 'parallel'){
    // ε = (1 - exp(-NTU*(1+Cr))) / (1 + Cr)
    return (1 - Math.exp(-NTU * (1 + Cr))) / (1 + Cr);
  }
  // counter
  if (Math.abs(1 - Cr) < 1e-9){
    // Cr -> 1: ε = NTU / (1 + NTU)
    return NTU / (1 + NTU);
  }
  // ε = (1 - exp(-NTU*(1-Cr))) / (1 - Cr*exp(-NTU*(1-Cr)))
  const a = Math.exp(-NTU * (1 - Cr));
  return (1 - a) / (1 - Cr * a);
}

// Логарифмический температурный напор Δt_ln
function dtlm(mode, ThIn, ThOut, TcIn, TcOut){
  // Прямоток:
  // Δt1 = ThIn - TcIn
  // Δt2 = ThOut - TcOut
  // Противоток:
  // Δt1 = ThIn - TcOut
  // Δt2 = ThOut - TcIn
  const d1 = (mode === 'parallel') ? (ThIn - TcIn) : (ThIn - TcOut);
  const d2 = (mode === 'parallel') ? (ThOut - TcOut) : (ThOut - TcIn);

  // Защита от нулей/смены знака (в учебном режиме не допускаем пересечения)
  const eps = 1e-9;
  const d1s = Math.max(d1, eps);
  const d2s = Math.max(d2, eps);

  if (Math.abs(d1s - d2s) < 1e-9) return d1s;
  return (d1s - d2s) / Math.log(d1s / d2s);
}

function lpmToKgPerSec(lpm){
  // л/мин -> л/с -> кг/с (ρ=1000, в методике это допущение)
  return (lpm / 60.0); // численно кг/с
}

// ---- DOM
const els = {
  mode: document.getElementById('mode'),
  ThIn: document.getElementById('ThIn'),
  TcIn: document.getElementById('TcIn'),
  Vh: document.getElementById('Vh'),
  k: document.getElementById('k'),
  loss: document.getElementById('loss'),

  ThInVal: document.getElementById('ThInVal'),
  TcInVal: document.getElementById('TcInVal'),
  VhVal: document.getElementById('VhVal'),
  VcVal: document.getElementById('VcVal'),
  kVal: document.getElementById('kVal'),
  lossVal: document.getElementById('lossVal'),

  modeName: document.getElementById('modeName'),
  epsVal: document.getElementById('epsVal'),
  Qcold: document.getElementById('Qcold'),
  dtlm: document.getElementById('dtlm'),
  kCalc: document.getElementById('kCalc'),
  ThOut: document.getElementById('ThOut'),
  TcOut: document.getElementById('TcOut'),

  resetBtn: document.getElementById('resetBtn'),
};

// ---- Chart
let chart;

function makeChart(){
  const ctx = document.getElementById('mainChart');
  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        { label: 'Прямоток', data: [], borderWidth: 2, pointRadius: 0 },
        { label: 'Противоток', data: [], borderWidth: 2, pointRadius: 0 },
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'nearest', intersect: false },
      plugins: {
        legend: { position: 'top' },
        tooltip: { callbacks: {
          label: (ctx) => `${ctx.dataset.label}: ε = ${ctx.parsed.y.toFixed(3)}`
        }}
      },
      scales: {
        x: {
          title: { display: true, text: 'Vг, л/мин' },
          ticks: { maxTicksLimit: 8 }
        },
        y: {
          title: { display: true, text: 'Эффективность ε' },
          min: 0,
          max: 1
        }
      }
    }
  });

  // фиксируем высоту контейнера canvas (иначе может схлопнуться)
  ctx.parentElement.style.height = '360px';
}

function formatTemp(t){ return `${t.toFixed(1)} °C`; }
function formatW(Q){ return `${(Q/1000).toFixed(2)} кВт`; }
function formatK(x){ return `${x.toFixed(2)} °C`; }
function formatKcoef(k){ return `${Math.round(k)} Вт/(м²·К)`; }

function computeOnce(mode, ThIn, TcIn, VhLpm, kInput, lossPct){
  // расходы
  const mh = lpmToKgPerSec(VhLpm);
  const mc = lpmToKgPerSec(VcFixed);

  // теплоёмкости при средних температурах (первое приближение: по входам)
  const cph = cpWater(ThIn);
  const cpc = cpWater(TcIn);

  const Ch = mh * cph;
  const Cc = mc * cpc;

  const Cmin = Math.min(Ch, Cc);
  const Cmax = Math.max(Ch, Cc);
  const Cr = Cmin / Cmax;

  // UA = kF
  const UA = kInput * F;
  const NTU = UA / Cmin;

  const eps = effectiveness(mode, NTU, Cr);

  const Qmax = Cmin * (ThIn - TcIn);
  const Q = eps * Qmax; // Вт — «идеально переданное» в теплообменнике (без внешних потерь)

  // вводим потери: полезная теплота, полученная холодным контуром
  const loss = Math.min(Math.max(lossPct, 0), 100) / 100;
  const Qcold = (1 - loss) * Q;

  const ThOut = ThIn - Q / Ch;
  const TcOut = TcIn + Qcold / Cc;

  const dt = dtlm(mode, ThIn, ThOut, TcIn, TcOut);
  const kCalc = Qcold / (F * dt);

  return { mh, mc, cph, cpc, Ch, Cc, Cmin, Cmax, Cr, UA, NTU, eps, Q, Qcold, ThOut, TcOut, dt, kCalc };
}

function updateUI(){
  const mode = els.mode.value;
  const ThIn = parseFloat(els.ThIn.value);
  const TcIn = parseFloat(els.TcIn.value);
  const Vh = parseFloat(els.Vh.value);
  const kInput = parseFloat(els.k.value);
  const loss = parseFloat(els.loss.value);

  // values on controls
  els.ThInVal.textContent = ThIn.toFixed(0);
  els.TcInVal.textContent = TcIn.toFixed(0);
  els.VhVal.textContent = Vh.toFixed(1);
  els.VcVal.textContent = VcFixed.toFixed(1);
  els.kVal.textContent = Math.round(kInput);
  els.lossVal.textContent = loss.toFixed(0);

  // compute for current mode
  const r = computeOnce(mode, ThIn, TcIn, Vh, kInput, loss);

  els.modeName.textContent = (mode === 'parallel') ? 'Прямоток' : 'Противоток';
  els.epsVal.textContent = r.eps.toFixed(3);
  els.Qcold.textContent = formatW(r.Qcold);
  els.dtlm.textContent = formatK(r.dt);
  els.kCalc.textContent = formatKcoef(r.kCalc);
  els.ThOut.textContent = formatTemp(r.ThOut);
  els.TcOut.textContent = formatTemp(r.TcOut);

  // update chart: ε(Vг) for both modes, keeping other params same
  const xs = [];
  const ysP = [];
  const ysC = [];

  for (let v = 0.2; v <= 3.0001; v += 0.1){
    xs.push(v.toFixed(1));
    ysP.push(computeOnce('parallel', ThIn, TcIn, v, kInput, loss).eps);
    ysC.push(computeOnce('counter',  ThIn, TcIn, v, kInput, loss).eps);
  }

  chart.data.labels = xs;
  chart.data.datasets[0].data = ysP;
  chart.data.datasets[1].data = ysC;
  chart.update('none');
}

function bind(){
  ['change','input'].forEach(evt => {
    els.mode.addEventListener(evt, updateUI);
    els.ThIn.addEventListener(evt, updateUI);
    els.TcIn.addEventListener(evt, updateUI);
    els.Vh.addEventListener(evt, updateUI);
    els.k.addEventListener(evt, updateUI);
    els.loss.addEventListener(evt, updateUI);
  });

  els.resetBtn.addEventListener('click', () => {
    els.mode.value = 'counter';
    els.ThIn.value = 55;
    els.TcIn.value = 20;
    els.Vh.value = 1.5;
    els.k.value = 2500;
    els.loss.value = 5;
    updateUI();
  });
}

makeChart();
bind();
updateUI();
