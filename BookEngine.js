/**
 * BookEngine.js
 * A1 — Membaca dan mem-parse JSON adapter buku.
 * Semua komponen app memanggil modul ini untuk mendapat data konten.
 *
 * Cara pakai:
 *   import BookEngine from './BookEngine.js';
 *   await BookEngine.loadBook('yamaha_jmc_grade1');
 *   const unit = BookEngine.getCurrentUnit();
 */

const BookEngine = (() => {

  // ─── State internal ──────────────────────────────────────────────────────
  let _book       = null;   // seluruh JSON adapter yang sudah di-parse
  let _currentUnitId = null;

  // ─── A1.1  Load & parse ──────────────────────────────────────────────────

  /**
   * loadBook(bookId, jsonPathOrObject)
   * Muat adapter buku. Bisa dari path file atau objek JSON langsung.
   *
   * @param {string} bookId          - misal 'yamaha_jmc_grade1'
   * @param {string|object} source   - path relatif ke file JSON,
   *                                   atau objek JS langsung (untuk testing)
   * @returns {Promise<void>}
   */
  async function loadBook(bookId, source) {
    let data;

    if (typeof source === 'object' && source !== null) {
      data = source;
    } else {
      const path = source || `./book_${bookId}.json`;
      const res  = await fetch(path);
      if (!res.ok) throw new Error(`BookEngine: gagal load ${path} (${res.status})`);
      data = await res.json();
    }

    if (data.meta.book_id !== bookId) {
      throw new Error(`BookEngine: book_id tidak cocok — expect "${bookId}", dapat "${data.meta.book_id}"`);
    }

    _book = data;
    _currentUnitId = _book.units[0].unit_id;   // mulai dari unit pertama
    console.log(`[BookEngine] Loaded: ${_book.meta.book_title}`);
  }

  // ─── A1.2  Guard helper ───────────────────────────────────────────────────

  function _requireBook(fnName) {
    if (!_book) throw new Error(`BookEngine.${fnName}(): panggil loadBook() dulu.`);
  }

  // ─── A1.3  Akses metadata ─────────────────────────────────────────────────

  /** Kembalikan metadata buku (judul, penerbit, versi, dll.) */
  function getMeta() {
    _requireBook('getMeta');
    return { ..._book.meta };
  }

  /** Kembalikan konfigurasi sistem solmisasi dan warna not */
  function getSolfegeSystem() {
    _requireBook('getSolfegeSystem');
    return { ..._book.solfege_system };
  }

  /** Kembalikan warna satu nada: { hex, bg }
   *  @param {string} solfege  - 'Do', 'Re', 'Mi', dst.
   */
  function getNoteColor(solfege) {
    _requireBook('getNoteColor');
    return _book.solfege_system.note_colors[solfege] || { hex: '#888780', bg: '#F1EFE8' };
  }

  // ─── A1.4  Navigasi unit ──────────────────────────────────────────────────

  /** Kembalikan objek unit yang sedang aktif */
  function getCurrentUnit() {
    _requireBook('getCurrentUnit');
    return _book.units.find(u => u.unit_id === _currentUnitId) || _book.units[0];
  }

  /** Set unit aktif secara manual (dipakai oleh ProgressStore saat resume) */
  function setCurrentUnit(unitId) {
    _requireBook('setCurrentUnit');
    const exists = _book.units.find(u => u.unit_id === unitId);
    if (!exists) throw new Error(`BookEngine.setCurrentUnit(): unit_id "${unitId}" tidak ditemukan.`);
    _currentUnitId = unitId;
  }

  /** Kembalikan unit berikutnya, atau null kalau sudah unit terakhir */
  function getNextUnit() {
    _requireBook('getNextUnit');
    const idx = _book.units.findIndex(u => u.unit_id === _currentUnitId);
    return idx < _book.units.length - 1 ? _book.units[idx + 1] : null;
  }

  /** Kembalikan semua unit sebagai array */
  function getAllUnits() {
    _requireBook('getAllUnits');
    return [..._book.units];
  }

  /** Kembalikan unit berdasarkan unit_id */
  function getUnitById(unitId) {
    _requireBook('getUnitById');
    return _book.units.find(u => u.unit_id === unitId) || null;
  }

  // ─── A1.5  Akses not ─────────────────────────────────────────────────────

  /**
   * getNotesForUnit(unitId?)
   * Kembalikan array posisi not dari satu unit.
   * Kalau unitId tidak diberikan, pakai unit aktif.
   *
   * @returns {Array} array objek note_position, ditambah field 'solfege' dan 'color'
   */
  function getNotesForUnit(unitId) {
    _requireBook('getNotesForUnit');
    const unit = unitId ? getUnitById(unitId) : getCurrentUnit();
    if (!unit) return [];
    return Object.entries(unit.note_positions || {}).map(([key, pos]) => ({
      key,
      ...pos,
      color: getNoteColor(pos.solfege).hex,
      colorBg: getNoteColor(pos.solfege).bg,
    }));
  }

  /**
   * getNotesForLevel(levelNum)
   * Kembalikan semua not yang tersedia di level tertentu (gabungan semua unit di level itu).
   * Deduplikasi berdasarkan solfege + octave.
   *
   * @param {number} levelNum - 1, 2, 3, atau 4
   * @returns {Array}
   */
  function getNotesForLevel(levelNum) {
    _requireBook('getNotesForLevel');
    const levelKey = `level_${levelNum}`;
    const levelDef = _book.app_levels[levelKey];
    if (!levelDef) return [];

    const available = levelDef.notes_available;
    if (available === 'all') {
      // kumpulkan dari semua unit
      return _getAllNotePositions();
    }

    return _getAllNotePositions().filter(n => available.includes(n.key));
  }

  /** Helper: kumpulkan semua note_positions dari semua unit, deduplikasi by key */
  function _getAllNotePositions() {
    const seen = new Set();
    const result = [];
    for (const unit of _book.units) {
      for (const [key, pos] of Object.entries(unit.note_positions || {})) {
        if (!seen.has(key)) {
          seen.add(key);
          result.push({
            key,
            ...pos,
            color:   getNoteColor(pos.solfege).hex,
            colorBg: getNoteColor(pos.solfege).bg,
          });
        }
      }
    }
    return result;
  }

  /**
   * getNoteByKey(key)
   * Cari satu note_position berdasarkan key-nya (misal 'Do', 'Mi', 'Do_bass').
   */
  function getNoteByKey(key) {
    _requireBook('getNoteByKey');
    return _getAllNotePositions().find(n => n.key === key) || null;
  }

  // ─── A1.6  Akses aktivitas ────────────────────────────────────────────────

  /**
   * getActivitiesForUnit(unitId?)
   * Kembalikan objek app_activities dari unit, hanya yang enabled: true.
   */
  function getActivitiesForUnit(unitId) {
    _requireBook('getActivitiesForUnit');
    const unit = unitId ? getUnitById(unitId) : getCurrentUnit();
    if (!unit || !unit.app_activities) return {};
    return Object.fromEntries(
      Object.entries(unit.app_activities).filter(([, v]) => v.enabled !== false)
    );
  }

  /**
   * getQuizConfig(unitId?)
   * Shortcut: kembalikan config quiz_note_reading unit aktif.
   */
  function getQuizConfig(unitId) {
    const acts = getActivitiesForUnit(unitId);
    return acts.quiz_note_reading || null;
  }

  /**
   * getFlashcardConfig(unitId?)
   * Shortcut: kembalikan config flashcard unit aktif.
   */
  function getFlashcardConfig(unitId) {
    const acts = getActivitiesForUnit(unitId);
    return acts.flashcard || null;
  }

  // ─── A1.7  Akses level ────────────────────────────────────────────────────

  /** Kembalikan definisi satu level app */
  function getLevelConfig(levelNum) {
    _requireBook('getLevelConfig');
    return _book.app_levels[`level_${levelNum}`] || null;
  }

  /**
   * getLevelForUnit(unitId?)
   * Kembalikan nomor level (1–4) dari satu unit.
   */
  function getLevelForUnit(unitId) {
    _requireBook('getLevelForUnit');
    const unit = unitId ? getUnitById(unitId) : getCurrentUnit();
    return unit ? unit.app_level : 1;
  }

  /**
   * shouldShowLetterNames(levelNum?)
   * Apakah nama nada C/D/E sudah boleh ditampilkan di level ini?
   */
  function shouldShowLetterNames(levelNum) {
    _requireBook('shouldShowLetterNames');
    const lv = levelNum || getLevelForUnit();
    const threshold = _book.solfege_system.introduce_secondary_at_level || 2;
    return lv >= threshold;
  }

  // ─── A1.8  Akses rhythm & mnemonik ───────────────────────────────────────

  /** Kembalikan definisi nilai not berdasarkan key (misal 'quarter_note') */
  function getRhythmDef(rhythmKey) {
    _requireBook('getRhythmDef');
    return _book.rhythm_definitions[rhythmKey] || null;
  }

  /** Kembalikan semua rhythm yang sudah diperkenalkan hingga unit tertentu */
  function getRhythmsUpToUnit(unitId) {
    _requireBook('getRhythmsUpToUnit');
    const targetIdx = _book.units.findIndex(u => u.unit_id === (unitId || _currentUnitId));
    const introduced = new Set();
    for (let i = 0; i <= targetIdx; i++) {
      (_book.units[i].rhythms_introduced || []).forEach(r => introduced.add(r));
    }
    return [...introduced].map(r => ({ key: r, ..._book.rhythm_definitions[r] }));
  }

  /** Kembalikan objek mnemonic (treble_lines, treble_spaces, bass_lines, bass_spaces) */
  function getMnemonics() {
    _requireBook('getMnemonics');
    return { ..._book.mnemonics };
  }

  // ─── A1.9  Completion criteria ────────────────────────────────────────────

  /**
   * getCompletionCriteria(unitId?)
   * Kembalikan syarat lulus unit: quiz_min_score, quiz_out_of, flashcard_views.
   */
  function getCompletionCriteria(unitId) {
    _requireBook('getCompletionCriteria');
    const unit = unitId ? getUnitById(unitId) : getCurrentUnit();
    return unit ? { ...(unit.completion_criteria || {}) } : {};
  }

  /** Kembalikan pesan mascot untuk situasi tertentu */
  function getMascotMessage(situation, unitId) {
    _requireBook('getMascotMessage');
    const unit = unitId ? getUnitById(unitId) : getCurrentUnit();
    if (!unit || !unit.mascot_message) return '';
    return unit.mascot_message[situation] || '';
  }

  // ─── A1.10  Debug / diagnostics ──────────────────────────────────────────

  /** Cetak ringkasan buku ke console — berguna saat development */
  function debug() {
    _requireBook('debug');
    console.group(`[BookEngine] ${_book.meta.book_title}`);
    console.log('Units:', _book.units.length);
    console.log('App levels:', Object.keys(_book.app_levels).length);
    for (const unit of _book.units) {
      const notes = Object.keys(unit.note_positions || {});
      const acts  = Object.keys(unit.app_activities || {});
      console.log(`  Unit ${unit.unit_number} (${unit.unit_id}) → Level ${unit.app_level} | notes: [${notes}] | activities: [${acts}]`);
    }
    console.groupEnd();
  }

  // ─── Public API ───────────────────────────────────────────────────────────
  return {
    // Load
    loadBook,
    // Meta
    getMeta,
    getSolfegeSystem,
    getNoteColor,
    // Unit navigation
    getCurrentUnit,
    setCurrentUnit,
    getNextUnit,
    getAllUnits,
    getUnitById,
    // Notes
    getNotesForUnit,
    getNotesForLevel,
    getNoteByKey,
    // Activities
    getActivitiesForUnit,
    getQuizConfig,
    getFlashcardConfig,
    // Levels
    getLevelConfig,
    getLevelForUnit,
    shouldShowLetterNames,
    // Rhythm & mnemonics
    getRhythmDef,
    getRhythmsUpToUnit,
    getMnemonics,
    // Completion
    getCompletionCriteria,
    getMascotMessage,
    // Debug
    debug,
  };

})();

export default BookEngine;
