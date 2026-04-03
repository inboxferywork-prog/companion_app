/**
 * NoteRenderer.js
 * A2 — Menggambar not balok di SVG staff menggunakan data dari BookEngine.
 *
 * Cara pakai:
 *   import NoteRenderer from './NoteRenderer.js';
 *   const svg = document.getElementById('my-staff');
 *   NoteRenderer.drawStaff(svg);
 *   NoteRenderer.drawNote(svg, noteData);    // noteData dari BookEngine.getNoteByKey()
 *   NoteRenderer.clear(svg);
 */

const NoteRenderer = (() => {

  const SVG_NS = 'http://www.w3.org/2000/svg';

  // ─── Konstanta layout staff ───────────────────────────────────────────────

  const STAFF = {
    // 5 garis treble — posisi Y di koordinat SVG (viewBox tinggi ~130)
    treble: {
      lines:  [24, 38, 52, 66, 80],   // garis 1 (bawah) → garis 5 (atas)
      clefX:  8,
      clefFontSize: 68,
      clefDy: 76,                      // baseline tuning karakter 𝄞
      startX: 28,                      // garis staff mulai dari sini
      endX:   272,
    },
    bass: {
      lines:  [24, 38, 52, 66, 80],
      clefX:  8,
      clefFontSize: 52,
      clefDy: 66,
      startX: 28,
      endX:   272,
    },
  };

  // Posisi X tengah untuk not tunggal (di quiz & flashcard)
  const NOTE_CX = 160;

  // ─── A2.1  Buat elemen SVG ────────────────────────────────────────────────

  function _el(tag, attrs = {}) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  }

  // ─── A2.2  Gambar staff 5 garis ───────────────────────────────────────────

  /**
   * drawStaff(svgEl, options)
   * Gambar 5 garis staff + simbol kunci di elemen SVG yang diberikan.
   * Kalau sudah ada staff sebelumnya, hapus dulu dengan clear().
   *
   * @param {SVGElement} svgEl
   * @param {object}     options
   *   clef      {string}  'treble' | 'bass'  (default: 'treble')
   *   lineColor {string}  warna garis (default: var CSS atau '#B4B2A9')
   *   showClef  {boolean} tampilkan simbol kunci (default: true)
   */
  function drawStaff(svgEl, options = {}) {
    const clef      = options.clef      || 'treble';
    const lineColor = options.lineColor || 'var(--color-border-secondary, #B4B2A9)';
    const showClef  = options.showClef  !== false;

    const cfg  = STAFF[clef];
    const grp  = _el('g', { class: 'nr-staff', 'data-clef': clef });

    // 5 garis
    for (const y of cfg.lines) {
      grp.appendChild(_el('line', {
        x1: cfg.startX, x2: cfg.endX,
        y1: y, y2: y,
        stroke: lineColor,
        'stroke-width': '1.2',
      }));
    }

    // Simbol kunci
    if (showClef) {
      const sym = clef === 'treble' ? '𝄞' : '𝄢';
      const t   = _el('text', {
        x: cfg.clefX,
        y: cfg.clefDy,
        'font-size': cfg.clefFontSize,
        fill: lineColor,
        'font-family': 'serif',
        class: 'nr-clef',
      });
      t.textContent = sym;
      grp.appendChild(t);
    }

    svgEl.appendChild(grp);
  }

  // ─── A2.3  Gambar satu not ────────────────────────────────────────────────

  /**
   * drawNote(svgEl, noteData, options)
   * Gambar not balok berdasarkan data dari BookEngine.
   *
   * @param {SVGElement} svgEl
   * @param {object}     noteData   - objek dari BookEngine.getNoteByKey() atau getNotesForUnit()
   *   Wajib: noteData.staff_y_svg, noteData.needs_ledger, noteData.color
   *   Opsional: noteData.solfege, noteData.note_name
   * @param {object}     options
   *   cx          {number}  posisi X tengah not (default: NOTE_CX)
   *   rx          {number}  radius horizontal elips (default: 10)
   *   ry          {number}  radius vertikal elips (default: 7)
   *   stemUp      {boolean} stem ke atas (default: true)
   *   stemLength  {number}  panjang stem (default: 34)
   *   color       {string}  override warna
   *   showLabel   {boolean} tampilkan label solfège di bawah not (default: false)
   *   labelColor  {string}  warna label
   *   animate     {boolean} fade-in not (default: false)
   */
  function drawNote(svgEl, noteData, options = {}) {
    if (!noteData) return;

    const cy         = noteData.staff_y_svg;
    const cx         = options.cx         ?? NOTE_CX;
    const rx         = options.rx         ?? 10;
    const ry         = options.ry         ?? 7;
    const stemUp     = options.stemUp     !== false;
    const stemLength = options.stemLength ?? 34;
    const color      = options.color      || noteData.color || '#444441';
    const showLabel  = options.showLabel  || false;
    const animate    = options.animate    || false;

    const grp = _el('g', {
      class: 'nr-note',
      'data-key': noteData.key || '',
      style: animate ? 'opacity:0;transition:opacity 0.25s' : '',
    });

    // Garis bantu (ledger line) kalau perlu
    if (noteData.needs_ledger) {
      grp.appendChild(_el('line', {
        x1: cx - rx - 5, x2: cx + rx + 5,
        y1: cy, y2: cy,
        stroke: color,
        'stroke-width': '1.8',
        'stroke-linecap': 'round',
      }));
    }

    // Badan not (elips)
    grp.appendChild(_el('ellipse', {
      cx, cy, rx, ry,
      fill: color,
      stroke: 'none',
    }));

    // Stem (tangkai not)
    const stemX  = stemUp ? cx + rx - 1 : cx - rx + 1;
    const stemY2 = stemUp ? cy - stemLength : cy + stemLength;
    grp.appendChild(_el('line', {
      x1: stemX, x2: stemX,
      y1: cy,    y2: stemY2,
      stroke: color,
      'stroke-width': '1.6',
      'stroke-linecap': 'round',
    }));

    // Label solfège opsional
    if (showLabel && noteData.solfege) {
      const label = _el('text', {
        x: cx,
        y: cy + ry + 14,
        'text-anchor': 'middle',
        'font-size': '11',
        fill: color,
        'font-family': 'var(--font-sans, sans-serif)',
        'font-weight': '500',
        class: 'nr-label',
      });
      label.textContent = noteData.solfege;
      grp.appendChild(label);
    }

    svgEl.appendChild(grp);

    // Fade-in animasi
    if (animate) requestAnimationFrame(() => { grp.style.opacity = '1'; });

    return grp;
  }

  // ─── A2.4  Gambar not penuh (whole note) ─────────────────────────────────

  /**
   * drawWholeNote(svgEl, noteData, options)
   * Variant not penuh — elips berlubang (tidak diisi), tanpa stem.
   */
  function drawWholeNote(svgEl, noteData, options = {}) {
    if (!noteData) return;

    const cy    = noteData.staff_y_svg;
    const cx    = options.cx    ?? NOTE_CX;
    const rx    = options.rx    ?? 11;
    const ry    = options.ry    ?? 7;
    const color = options.color || noteData.color || '#444441';

    const grp = _el('g', { class: 'nr-note nr-whole', 'data-key': noteData.key || '' });

    if (noteData.needs_ledger) {
      grp.appendChild(_el('line', {
        x1: cx - rx - 5, x2: cx + rx + 5,
        y1: cy, y2: cy,
        stroke: color, 'stroke-width': '1.8', 'stroke-linecap': 'round',
      }));
    }

    // Elips luar
    grp.appendChild(_el('ellipse', { cx, cy, rx, ry, fill: color }));
    // Lubang dalam
    grp.appendChild(_el('ellipse', {
      cx, cy,
      rx: rx - 3,
      ry: ry - 2.5,
      fill: 'var(--color-background-primary, #ffffff)',
    }));

    svgEl.appendChild(grp);
    return grp;
  }

  // ─── A2.5  Gambar not setengah (half note) ────────────────────────────────

  /**
   * drawHalfNote(svgEl, noteData, options)
   * Not setengah — elips berlubang dengan stem.
   */
  function drawHalfNote(svgEl, noteData, options = {}) {
    if (!noteData) return;

    const cy         = noteData.staff_y_svg;
    const cx         = options.cx         ?? NOTE_CX;
    const rx         = options.rx         ?? 10;
    const ry         = options.ry         ?? 7;
    const stemUp     = options.stemUp     !== false;
    const stemLength = options.stemLength ?? 34;
    const color      = options.color      || noteData.color || '#444441';

    const grp = _el('g', { class: 'nr-note nr-half', 'data-key': noteData.key || '' });

    if (noteData.needs_ledger) {
      grp.appendChild(_el('line', {
        x1: cx - rx - 5, x2: cx + rx + 5,
        y1: cy, y2: cy,
        stroke: color, 'stroke-width': '1.8', 'stroke-linecap': 'round',
      }));
    }

    grp.appendChild(_el('ellipse', { cx, cy, rx, ry, fill: color }));
    grp.appendChild(_el('ellipse', {
      cx, cy, rx: rx - 3, ry: ry - 2.5,
      fill: 'var(--color-background-primary, #ffffff)',
    }));

    const stemX  = stemUp ? cx + rx - 1 : cx - rx + 1;
    const stemY2 = stemUp ? cy - stemLength : cy + stemLength;
    grp.appendChild(_el('line', {
      x1: stemX, x2: stemX, y1: cy, y2: stemY2,
      stroke: color, 'stroke-width': '1.6', 'stroke-linecap': 'round',
    }));

    svgEl.appendChild(grp);
    return grp;
  }

  // ─── A2.6  Factory berdasarkan nilai not ──────────────────────────────────

  /**
   * drawNoteByValue(svgEl, noteData, rhythmValue, options)
   * Pilih fungsi gambar yang tepat berdasarkan nilai not.
   *
   * @param {string} rhythmValue  'whole_note' | 'half_note' | 'quarter_note' | default = quarter
   */
  function drawNoteByValue(svgEl, noteData, rhythmValue, options = {}) {
    switch (rhythmValue) {
      case 'whole_note': return drawWholeNote(svgEl, noteData, options);
      case 'half_note':  return drawHalfNote(svgEl, noteData, options);
      default:           return drawNote(svgEl, noteData, options);  // quarter + others
    }
  }

  // ─── A2.7  Highlight / animasi ────────────────────────────────────────────

  /**
   * highlightNote(grpEl, color)
   * Flash warna pada not yang sudah digambar — untuk feedback benar/salah.
   *
   * @param {SVGGElement} grpEl   - elemen <g> yang dikembalikan drawNote()
   * @param {string}      color   - '#1D9E75' (benar) | '#E24B4A' (salah)
   * @param {number}      duration - ms sebelum kembali ke warna asli (default 600)
   */
  function highlightNote(grpEl, color, duration = 600) {
    if (!grpEl) return;
    const originals = [];
    grpEl.querySelectorAll('ellipse, line').forEach(el => {
      const attr = el.tagName === 'ellipse' ? 'fill' : 'stroke';
      originals.push({ el, attr, val: el.getAttribute(attr) });
      if (attr === 'fill' && el.getAttribute('fill') !== 'var(--color-background-primary, #ffffff)') {
        el.setAttribute('fill', color);
      }
      if (attr === 'stroke') el.setAttribute('stroke', color);
    });
    setTimeout(() => {
      originals.forEach(({ el, attr, val }) => el.setAttribute(attr, val));
    }, duration);
  }

  // ─── A2.8  Utilitas ───────────────────────────────────────────────────────

  /**
   * clear(svgEl)
   * Hapus semua elemen yang digambar oleh NoteRenderer (staff + notes).
   * Elemen yang ada sebelumnya (misal background rect) tidak disentuh.
   */
  function clear(svgEl) {
    svgEl.querySelectorAll('.nr-staff, .nr-note, .nr-clef, .nr-label')
         .forEach(el => el.remove());
  }

  /**
   * clearNotes(svgEl)
   * Hapus hanya not-not, biarkan staff tetap ada.
   */
  function clearNotes(svgEl) {
    svgEl.querySelectorAll('.nr-note').forEach(el => el.remove());
  }

  /**
   * createStaffSVG(width, height, viewBoxH)
   * Helper: buat elemen <svg> baru siap pakai (untuk kasus yang butuh SVG baru).
   *
   * @returns {SVGElement}
   */
  function createStaffSVG(width = '100%', height, viewBoxH = 110) {
    const svg = _el('svg', {
      width,
      viewBox: `0 0 300 ${viewBoxH}`,
      xmlns: SVG_NS,
    });
    if (height) svg.setAttribute('height', height);
    return svg;
  }

  // ─── A2.9  Render lengkap (convenience) ──────────────────────────────────

  /**
   * renderNoteOnStaff(svgEl, noteData, options)
   * Shortcut: clear → drawStaff → drawNote dalam satu panggilan.
   * Paling sering dipakai di kuis dan flashcard.
   *
   * @param {object} options   - gabungan opsi drawStaff + drawNote
   */
  function renderNoteOnStaff(svgEl, noteData, options = {}) {
    clear(svgEl);
    drawStaff(svgEl, { clef: options.clef || 'treble', ...options });
    return drawNoteByValue(svgEl, noteData, options.rhythmValue || 'quarter_note', options);
  }

  // ─── Public API ───────────────────────────────────────────────────────────
  return {
    drawStaff,
    drawNote,
    drawWholeNote,
    drawHalfNote,
    drawNoteByValue,
    renderNoteOnStaff,
    highlightNote,
    clear,
    clearNotes,
    createStaffSVG,
    STAFF_LAYOUT: STAFF,     // expose konstanta untuk komponen lain
    NOTE_CX,
  };

})();

export default NoteRenderer;
