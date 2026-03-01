const F = 0.12;
const LAB_TITLE = 'Испытание пластинчатого теплообменника';

const cpTable = [
  { t: 0, cp: 4218 }, { t: 10, cp: 4192 }, { t: 20, cp: 4182 },
  { t: 40, cp: 4178 }, { t: 60, cp: 4184 }, { t: 80, cp: 4196 }, { t: 100, cp: 4216 }
];

const $ = (id) => document.getElementById(id);
const els = {
  mode: $('mode'), ThIn: $('ThIn'), TcIn: $('TcIn'), Vh: $('Vh'), Vc: $('Vc'), k: $('k'), loss: $('loss'),
  ThInVal: $('ThInVal'), TcInVal: $('TcInVal'), VhVal: $('VhVal'), VcVal: $('VcVal'), kVal: $('kVal'), lossVal: $('lossVal'),
  modeName: $('modeName'), epsVal: $('epsVal'), Qcold: $('Qcold'), Qhot: $('Qhot'), ThOut: $('ThOut'), TcOut: $('TcOut'), dtlm: $('dtlm'), kCalc: $('kCalc'),
  currentTable: $('currentTable'), journalTable: $('journalTable'), analytics: $('analytics'),
  runBtn: $('runBtn'), addJournalBtn: $('addJournalBtn'), clearJournalBtn: $('clearJournalBtn'), exportBtn: $('exportBtn'), resetBtn: $('resetBtn')
};

let chart;
let lastInputs = null;
let lastResult = null;
let journal = [];

function lerp(a, b, x) { return a + (b - a) * x; }
function cpWater(t) {
  if (t <= cpTable[0].t) return cpTable[0].cp;
  if (t >= cpTable[cpTable.length - 1].t) return cpTable[cpTable.length - 1].cp;
  for (let i = 0; i < cpTable.length - 1; i++) {
    const a = cpTable[i], b = cpTable[i + 1];
    if (t >= a.t && t <= b.t) return lerp(a.cp, b.cp, (t - a.t) / (b.t - a.t));
  }
  return 4180;
}

function lpmToKgSec(lpm) { return lpm / 60; }

function effectiveness(mode, NTU, Cr) {
  if (mode === 'parallel') return (1 - Math.exp(-NTU * (1 + Cr))) / (1 + Cr);
  if (Math.abs(1 - Cr) < 1e-9) return NTU / (1 + NTU);
  const a = Math.exp(-NTU * (1 - Cr));
  return (1 - a) / (1 - Cr * a);
}

function dtlm(mode, ThIn, ThOut, TcIn, TcOut) {
  const d1 = mode === 'parallel' ? (ThIn - TcIn) : (ThIn - TcOut);
  const d2 = mode === 'parallel' ? (ThOut - TcOut) : (ThOut - TcIn);
  const a = Math.max(d1, 1e-8), b = Math.max(d2, 1e-8);
  if (Math.abs(a - b) < 1e-10) return a;
  return (a - b) / Math.log(a / b);
}

function modeName(mode) { return mode === 'parallel' ? 'Прямоток' : 'Противоток'; }
function fmt(n, d = 2) { return Number(n).toFixed(d); }

function getInputs() {
  return {
    mode: els.mode.value,
    ThIn: parseFloat(els.ThIn.value),
    TcIn: parseFloat(els.TcIn.value),
    Vh: parseFloat(els.Vh.value),
    Vc: parseFloat(els.Vc.value),
    k: parseFloat(els.k.value),
    loss: parseFloat(els.loss.value)
  };
}

function compute(inputs) {
  const mh = lpmToKgSec(inputs.Vh);
  const mc = lpmToKgSec(inputs.Vc);
  const cph = cpWater(inputs.ThIn);
  const cpc = cpWater(inputs.TcIn);
  const Ch = mh * cph;
  const Cc = mc * cpc;
  const Cmin = Math.min(Ch, Cc);
  const Cmax = Math.max(Ch, Cc);
  const Cr = Cmin / Cmax;
  const UA = inputs.k * F;
  const NTU = UA / Math.max(Cmin, 1e-9);
  const eps = effectiveness(inputs.mode, NTU, Cr);
  const Qmax = Cmin * (inputs.ThIn - inputs.TcIn);
  const Qhot = eps * Qmax;
  const Qcold = Qhot * (1 - Math.min(Math.max(inputs.loss, 0), 100) / 100);
  const ThOut = inputs.ThIn - Qhot / Math.max(Ch, 1e-9);
  const TcOut = inputs.TcIn + Qcold / Math.max(Cc, 1e-9);
  const dTln = dtlm(inputs.mode, inputs.ThIn, ThOut, inputs.TcIn, TcOut);
  const kCalc = Qcold / Math.max(F * dTln, 1e-9);
  return { mh, mc, cph, cpc, Ch, Cc, Cr, NTU, eps, Qhot, Qcold, ThOut, TcOut, dTln, kCalc };
}

function renderCurrentTable(inputs, result) {
  const rows = [
    ['Схема движения', '—', modeName(inputs.mode)],
    ['Температура горячего входа', 'T1', `${fmt(inputs.ThIn, 1)} °C`],
    ['Температура горячего выхода', 'T4', `${fmt(result.ThOut, 1)} °C`],
    ['Температура холодного входа', 'T3', `${fmt(inputs.TcIn, 1)} °C`],
    ['Температура холодного выхода', 'T2', `${fmt(result.TcOut, 1)} °C`],
    ['Расход горячего', 'Vг', `${fmt(inputs.Vh, 2)} л/мин`],
    ['Расход холодного', 'Vх', `${fmt(inputs.Vc, 2)} л/мин`],
    ['Теплота по горячему', 'Qг', `${fmt(result.Qhot, 0)} Вт`],
    ['Теплота по холодному', 'Qх', `${fmt(result.Qcold, 0)} Вт`],
    ['Логарифмический температурный напор', 'Δtln', `${fmt(result.dTln, 2)} °C`],
    ['Коэффициент теплопередачи расчетный', 'kрасч', `${fmt(result.kCalc, 0)} Вт/(м²·К)`]
  ];

  els.currentTable.innerHTML = rows.map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('');
}

function renderJournal() {
  if (!journal.length) {
    els.journalTable.innerHTML = '<tr><td colspan="10">Журнал пуст. Выполните эксперимент и добавьте запись.</td></tr>';
    return;
  }
  els.journalTable.innerHTML = journal.map((e, i) => `
    <tr>
      <td>${i + 1}</td><td>${e.time}</td><td>${modeName(e.inputs.mode)}</td>
      <td>${fmt(e.inputs.ThIn, 1)}</td><td>${fmt(e.inputs.TcIn, 1)}</td>
      <td>${fmt(e.inputs.Vh, 2)}</td><td>${fmt(e.inputs.Vc, 2)}</td>
      <td>${fmt(e.result.eps, 3)}</td><td>${fmt(e.result.Qcold, 0)}</td><td>${fmt(e.result.kCalc, 0)}</td>
    </tr>
  `).join('');
}

function renderAnalytics(inputs, result) {
  const imbalance = Math.abs(result.Qhot - result.Qcold) / Math.max(Math.abs(result.Qhot), 1e-9) * 100;
  const epsBand = result.eps >= 0.7 ? 'высокая' : result.eps >= 0.5 ? 'удовлетворительная' : 'пониженная';
  const balanceBand = imbalance <= 8 ? 'баланс тепловых потоков согласован' : imbalance <= 15 ? 'наблюдается умеренное расхождение теплового баланса' : 'наблюдается значительное расхождение теплового баланса';

  const recMode = inputs.mode === 'counter'
    ? 'Режим противотока выбран корректно: при дальнейших опытах рекомендуется удерживать его как базовый для достижения максимального температурного напора.'
    : 'Рекомендуется сравнить результаты с противоточным режимом при тех же расходах: как правило, это повышает ε и уменьшает требуемую поверхность теплообмена.';

  const recFouling = result.kCalc < inputs.k * 0.75
    ? 'Расчетный коэффициент kрасч заметно ниже заданного — возможна имитация загрязнения поверхностей или рост термических сопротивлений. Целесообразно повысить турбулизацию потока (увеличить расход).'
    : 'Сопоставление kрасч и заданного k показывает стабильный режим теплообмена без выраженной деградации теплопередачи.';

  els.analytics.innerHTML = `
    <p><strong>Экспертная оценка:</strong> эффективность ε = <b>${fmt(result.eps, 3)}</b>, что соответствует уровню «<b>${epsBand}</b>» для учебного пластинчатого аппарата.</p>
    <p><strong>Диагностика:</strong> Qг = <b>${fmt(result.Qhot, 0)} Вт</b>, Qх = <b>${fmt(result.Qcold, 0)} Вт</b>, расхождение <b>${fmt(imbalance, 1)}%</b>; ${balanceBand}.</p>
    <p><strong>Параметры теплопередачи:</strong> Δtln = <b>${fmt(result.dTln, 2)} °C</b>, kрасч = <b>${fmt(result.kCalc, 0)} Вт/(м²·К)</b>.</p>
    <p><strong>Профессиональные рекомендации инженера-теплотехника:</strong></p>
    <ul>
      <li>${recMode}</li>
      <li>${recFouling}</li>
      <li>Для научно достоверной обработки выполните серию не менее 5 опытов со ступенчатым изменением Vг и Vх, затем анализируйте тренд ε(Vг) и kрасч(V).</li>
    </ul>
  `;
}

function updateChart(inputs) {
  const labels = [];
  const parallel = [];
  const counter = [];

  for (let v = 0.2; v <= 3.001; v += 0.1) {
    labels.push(v.toFixed(1));
    parallel.push(compute({ ...inputs, mode: 'parallel', Vh: v }).eps);
    counter.push(compute({ ...inputs, mode: 'counter', Vh: v }).eps);
  }
  const current = compute(inputs).eps;

  chart.data.labels = labels;
  chart.data.datasets[0].data = parallel;
  chart.data.datasets[1].data = counter;
  chart.data.datasets[2].data = [{ x: inputs.Vh.toFixed(1), y: current }];
  chart.update('none');
}

function runExperiment() {
  const inputs = getInputs();
  if (inputs.ThIn <= inputs.TcIn + 1) {
    els.ThIn.value = String(inputs.TcIn + 5);
  }
  const normalized = getInputs();
  const result = compute(normalized);
  lastInputs = { ...normalized };
  lastResult = { ...result };

  els.ThInVal.textContent = `${fmt(normalized.ThIn, 0)} °C`;
  els.TcInVal.textContent = `${fmt(normalized.TcIn, 0)} °C`;
  els.VhVal.textContent = `${fmt(normalized.Vh, 1)} л/мин`;
  els.VcVal.textContent = `${fmt(normalized.Vc, 1)} л/мин`;
  els.kVal.textContent = `${fmt(normalized.k, 0)} Вт/(м²·К)`;
  els.lossVal.textContent = `${fmt(normalized.loss, 0)} %`;

  els.modeName.textContent = modeName(normalized.mode);
  els.epsVal.textContent = fmt(result.eps, 3);
  els.Qcold.textContent = fmt(result.Qcold / 1000, 2);
  els.Qhot.textContent = fmt(result.Qhot / 1000, 2);
  els.ThOut.textContent = fmt(result.ThOut, 1);
  els.TcOut.textContent = fmt(result.TcOut, 1);
  els.dtlm.textContent = fmt(result.dTln, 2);
  els.kCalc.textContent = fmt(result.kCalc, 0);

  renderCurrentTable(normalized, result);
  renderAnalytics(normalized, result);
  updateChart(normalized);
}

function addToJournal() {
  if (!lastInputs || !lastResult) return;
  journal.unshift({
    time: new Date().toLocaleString('ru-RU', { hour12: false }),
    inputs: { ...lastInputs },
    result: { eps: lastResult.eps, Qcold: lastResult.Qcold, kCalc: lastResult.kCalc }
  });
  if (journal.length > 100) journal = journal.slice(0, 100);
  renderJournal();
}

function clearJournal() {
  journal = [];
  renderJournal();
}

function exportExcelReport() {
  if (!lastInputs || !lastResult) {
    alert('Сначала проведите эксперимент.');
    return;
  }
  const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const rows = [
    ['Название работы', LAB_TITLE],
    ['Дата проведения', new Date().toLocaleString('ru-RU', { hour12: false })],
    [], ['Исходные данные'],
    ['Режим', modeName(lastInputs.mode)],
    ['T1, °C', fmt(lastInputs.ThIn, 1)], ['T3, °C', fmt(lastInputs.TcIn, 1)],
    ['Vг, л/мин', fmt(lastInputs.Vh, 2)], ['Vх, л/мин', fmt(lastInputs.Vc, 2)],
    ['k, Вт/(м²·К)', fmt(lastInputs.k, 0)], ['Потери, %', fmt(lastInputs.loss, 0)],
    [], ['Результаты эксперимента'],
    ['T4, °C', fmt(lastResult.ThOut, 1)], ['T2, °C', fmt(lastResult.TcOut, 1)],
    ['Qг, Вт', fmt(lastResult.Qhot, 0)], ['Qх, Вт', fmt(lastResult.Qcold, 0)],
    ['Эффективность ε', fmt(lastResult.eps, 3)], ['Δtln, °C', fmt(lastResult.dTln, 2)],
    ['kрасч, Вт/(м²·К)', fmt(lastResult.kCalc, 0)],
    [], ['Выводы'],
    ['Краткая экспертная оценка', `Режим: ${modeName(lastInputs.mode)}; ε=${fmt(lastResult.eps, 3)}; kрасч=${fmt(lastResult.kCalc, 0)} Вт/(м²·К)`],
    [], ['Журнал экспериментов'],
    ['№', 'Дата/время', 'Режим', 'T1', 'T3', 'Vг', 'Vх', 'ε', 'Qх, Вт', 'kрасч']
  ];

  journal.forEach((e, i) => {
    rows.push([i + 1, e.time, modeName(e.inputs.mode), fmt(e.inputs.ThIn, 1), fmt(e.inputs.TcIn, 1), fmt(e.inputs.Vh, 2), fmt(e.inputs.Vc, 2), fmt(e.result.eps, 3), fmt(e.result.Qcold, 0), fmt(e.result.kCalc, 0)]);
  });

  const content = '\uFEFF' + rows.map((r) => r.map((c) => esc(c ?? '')).join(';')).join('\n');
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'plate-heat-exchanger-lab-report.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

function initChart() {
  chart = new Chart(document.getElementById('mainChart'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        { label: 'Прямоток', data: [], borderWidth: 2, pointRadius: 0, tension: 0.2 },
        { label: 'Противоток', data: [], borderWidth: 2, pointRadius: 0, tension: 0.2 },
        { label: 'Текущая точка', data: [], showLine: false, pointRadius: 5 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: { title: { display: true, text: 'Vг, л/мин' } },
        y: { title: { display: true, text: 'Эффективность ε' }, min: 0, max: 1 }
      }
    }
  });
}

function resetDefaults() {
  els.mode.value = 'counter';
  els.ThIn.value = '60'; els.TcIn.value = '20';
  els.Vh.value = '1.6'; els.Vc.value = '1.2';
  els.k.value = '2600'; els.loss.value = '5';
  runExperiment();
  renderJournal();
}

['input', 'change'].forEach((evt) => {
  [els.mode, els.ThIn, els.TcIn, els.Vh, els.Vc, els.k, els.loss].forEach((el) => el.addEventListener(evt, runExperiment));
});
els.runBtn.addEventListener('click', runExperiment);
els.addJournalBtn.addEventListener('click', addToJournal);
els.clearJournalBtn.addEventListener('click', clearJournal);
els.exportBtn.addEventListener('click', exportExcelReport);
els.resetBtn.addEventListener('click', resetDefaults);

initChart();
resetDefaults();
