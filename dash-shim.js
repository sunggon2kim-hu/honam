// Standalone runtime for the dashboard page: loads the CSV files in data/
// and provides the small `dash` API the page script uses.
(function () {
  var SOURCES = { types: 'data/types.csv', team: 'data/team.csv', managers: 'data/managers.csv' };
  var store = {};
  var calcs = {};
  var draws = new Map();
  var onDataFns = [];
  var ready = false;
  Object.keys(SOURCES).forEach(function (id) { store[id] = { status: 'loading', data: [], columns: [] }; });

  function computeCalc(id) {
    var c = calcs[id];
    if (c.cache) return c.cache;
    var ins = c.inputs.map(get);
    if (ins.some(function (x) { return x.status !== 'ok'; })) {
      return { status: ins.some(function (x) { return x.status === 'error'; }) ? 'error' : 'loading', data: [] };
    }
    try {
      c.cache = { status: 'ok', data: c.fn.apply(null, ins.map(function (x) { return x.data; })) };
    } catch (e) {
      console.error('calc ' + id, e);
      c.cache = { status: 'error', data: [], message: String(e) };
    }
    return c.cache;
  }
  function get(id) {
    if (store[id]) return store[id];
    if (calcs[id]) return computeCalc(id);
    return { status: 'missing', data: [] };
  }
  function runDraw(name) {
    var fn = draws.get(name);
    if (!fn) return;
    document.querySelectorAll('[data-draw="' + name + '"]').forEach(function (el) {
      try { fn(el); } catch (e) { console.error('draw ' + name, e); }
    });
  }
  function runAll() {
    onDataFns.forEach(function (f) { try { f(); } catch (e) { console.error(e); } });
    draws.forEach(function (_, n) { runDraw(n); });
  }

  window.dash = {
    colors: ['#A50034', '#EE8A00', '#2B7F87', '#5A4FB0', '#8A8F98', '#3B82F6', '#10B981', '#F59E0B'],
    data: get,
    calc: function (id, o) { calcs[id] = { inputs: o.inputs, fn: o.fn, cache: null }; },
    loader: function () {},
    draw: function (name, fn) {
      if (typeof fn === 'function') { draws.set(name, fn); if (ready) runDraw(name); } else if (ready) runDraw(name);
    },
    onData: function (fn) { onDataFns.push(fn); if (ready) fn(); },
    params: function () { return {}; },
    setParams: function () {},
    resetParams: function () {},
    setLink: function () {},
    refresh: function () {}
  };

  document.addEventListener('DOMContentLoaded', function () {
    ready = true;
    runAll();
    Promise.resolve(window.__authReady).then(function () {
      return Promise.all(Object.keys(SOURCES).map(function (id) {
        var text = window.__bundle ? Promise.resolve(window.__bundle[id]) : fetch(SOURCES[id], { cache: 'no-cache' })
          .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); });
        return text
          .then(function (txt) { var rows = d3.csvParse(txt.replace(/^\uFEFF/, '')); store[id] = { status: 'ok', data: rows, columns: rows.columns }; })
          .catch(function (e) { console.error('load ' + id, e); store[id] = { status: 'error', data: [], message: String(e) }; });
      }));
    }).then(function () {
      Object.keys(calcs).forEach(function (k) { calcs[k].cache = null; });
      runAll();
    });
    var w = window.innerWidth, t;
    window.addEventListener('resize', function () {
      if (window.innerWidth === w) return;
      w = window.innerWidth;
      clearTimeout(t);
      t = setTimeout(runAll, 150);
    });
  });
})();
