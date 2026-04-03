/**
 * ProgressStore.js
 * A3 — Menyimpan dan memuat progress belajar user.
 * Menggunakan localStorage. Schema mengikuti progress_schema dari JSON adapter.
 *
 * Cara pakai:
 *   import ProgressStore from './ProgressStore.js';
 *   ProgressStore.init('yamaha_jmc_grade1');
 *   ProgressStore.markActivityDone('u01', 'quiz_note_reading', { score: 5, outOf: 5 });
 *   const stars = ProgressStore.getStars('u01');
 *   const done  = ProgressStore.isUnitComplete('u01');
 */

const ProgressStore = (() => {

  const STORAGE_KEY_PREFIX = 'beatmapper_progress_';
  const PROFILE_KEY        = 'beatmapper_profile';
  const SCHEMA_VERSION     = 1;

  let _bookId   = null;
  let _progress = null;   // objek progress aktif di memori

  // ─── A3.1  Inisialisasi ───────────────────────────────────────────────────

  /**
   * init(bookId, completionCriteriaMap?)
   * Inisialisasi store untuk buku tertentu.
   * Load dari localStorage kalau ada; kalau tidak, buat baru.
   *
   * @param {string} bookId
   * @param {object} completionCriteriaMap  - { unitId: { quiz_min_score, quiz_out_of, flashcard_views } }
   *   Kalau diberikan, dipakai untuk validasi completion check.
   *   Bisa diambil dari BookEngine: getAllUnits().reduce(...)
   */
  function init(bookId, completionCriteriaMap = {}) {
    _bookId = bookId;
    const stored = _load();

    if (stored && stored.schema_version === SCHEMA_VERSION) {
      _progress = stored;
    } else {
      _progress = _createFreshProgress(bookId);
    }

    // Simpan criteria map ke memori (tidak di-persist — diambil ulang tiap session)
    _progress._criteria = completionCriteriaMap;

    _save();
    console.log(`[ProgressStore] Loaded progress for "${bookId}". ` +
                `Current unit: ${_progress.global.current_unit}, ` +
                `stars: ${_progress.global.total_stars}`);
  }

  // ─── A3.2  Schema awal ────────────────────────────────────────────────────

  function _createFreshProgress(bookId) {
    return {
      schema_version: SCHEMA_VERSION,
      book_id:        bookId,
      created_at:     new Date().toISOString(),
      global: {
        current_level:   1,
        current_unit:    'u01',
        total_stars:     0,
        streak_days:     0,
        last_session:    null,
        grade1_complete: false,
        sessions_total:  0,
      },
      units: {},    // diisi per unit saat ada aktivitas
    };
  }

  /** Pastikan entri unit ada di _progress.units */
  function _ensureUnit(unitId) {
    if (!_progress.units[unitId]) {
      _progress.units[unitId] = {
        status:              'locked',
        flashcard_views:     0,
        quiz_attempts:       0,
        quiz_best_score:     0,
        quiz_out_of:         0,
        stars_earned:        0,
        activities_done:     [],
        first_accessed_at:   null,
        completed_at:        null,
      };
    }
    return _progress.units[unitId];
  }

  // ─── A3.3  Simpan & load localStorage ────────────────────────────────────

  function _save() {
    if (!_bookId) return;
    const toStore = { ..._progress };
    delete toStore._criteria;   // jangan simpan criteria — di-inject ulang tiap init()
    try {
      localStorage.setItem(STORAGE_KEY_PREFIX + _bookId, JSON.stringify(toStore));
    } catch (e) {
      console.warn('[ProgressStore] Gagal simpan ke localStorage:', e);
    }
  }

  function _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_PREFIX + _bookId);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function _requireInit(fn) {
    if (!_bookId || !_progress) throw new Error(`ProgressStore.${fn}(): panggil init() dulu.`);
  }

  // ─── A3.4  Unit status ────────────────────────────────────────────────────

  /**
   * unlockUnit(unitId)
   * Set status unit menjadi 'in_progress'.
   * Dipanggil oleh app saat user membuka unit untuk pertama kali.
   */
  function unlockUnit(unitId) {
    _requireInit('unlockUnit');
    const u = _ensureUnit(unitId);
    if (u.status === 'locked') {
      u.status = 'in_progress';
      u.first_accessed_at = new Date().toISOString();
      _save();
    }
  }

  /**
   * isUnitUnlocked(unitId)
   * Cek apakah unit sudah terbuka (status bukan 'locked').
   */
  function isUnitUnlocked(unitId) {
    _requireInit('isUnitUnlocked');
    // Unit pertama selalu terbuka
    if (unitId === 'u01') return true;
    const u = _progress.units[unitId];
    return u ? u.status !== 'locked' : false;
  }

  /**
   * isUnitComplete(unitId)
   * Cek apakah unit sudah lulus (semua completion_criteria terpenuhi).
   */
  function isUnitComplete(unitId) {
    _requireInit('isUnitComplete');
    const u = _progress.units[unitId];
    return u ? u.status === 'complete' : false;
  }

  /**
   * isLevelUnlocked(levelNum)
   * Level terbuka kalau semua unit di level sebelumnya sudah complete,
   * atau kalau levelNum === 1 (selalu terbuka).
   * Perlu BookEngine untuk tahu unit mana yang ada di level mana.
   */
  function isLevelUnlocked(levelNum) {
    _requireInit('isLevelUnlocked');
    if (levelNum <= 1) return true;
    return _progress.global.current_level >= levelNum;
  }

  // ─── A3.5  Catat aktivitas ────────────────────────────────────────────────

  /**
   * markActivityDone(unitId, activityKey, result?)
   * Catat bahwa user sudah menyelesaikan satu aktivitas.
   *
   * @param {string} unitId       - misal 'u01'
   * @param {string} activityKey  - misal 'quiz_note_reading', 'flashcard'
   * @param {object} result       - data hasil (opsional)
   *   Untuk quiz:      { score, outOf }
   *   Untuk flashcard: { views }
   */
  function markActivityDone(unitId, activityKey, result = {}) {
    _requireInit('markActivityDone');
    unlockUnit(unitId);
    const u = _ensureUnit(unitId);

    // Catat aktivitas
    if (!u.activities_done.includes(activityKey)) {
      u.activities_done.push(activityKey);
    }

    // Update data spesifik per aktivitas
    if (activityKey === 'quiz_note_reading' || activityKey === 'grand_quiz') {
      if (result.score !== undefined) {
        u.quiz_attempts++;
        u.quiz_out_of     = result.outOf || u.quiz_out_of;
        u.quiz_best_score = Math.max(u.quiz_best_score, result.score);
      }
    }

    if (activityKey === 'flashcard') {
      u.flashcard_views += result.views || 1;
    }

    // Cek apakah unit sekarang lulus
    _checkCompletion(unitId);
    _save();
  }

  // ─── A3.6  Completion check ───────────────────────────────────────────────

  function _checkCompletion(unitId) {
    const u        = _ensureUnit(unitId);
    const criteria = (_progress._criteria || {})[unitId] || {};

    if (u.status === 'complete') return;   // sudah lulus, skip

    let passed = true;

    if (criteria.quiz_min_score !== undefined) {
      passed = passed && (u.quiz_best_score >= criteria.quiz_min_score);
    }
    if (criteria.flashcard_views !== undefined) {
      passed = passed && (u.flashcard_views >= criteria.flashcard_views);
    }

    if (passed && u.activities_done.length > 0) {
      u.status       = 'complete';
      u.completed_at = new Date().toISOString();
      u.stars_earned = _calcStars(u, criteria);
      _progress.global.total_stars += u.stars_earned;
      _unlockNextUnit(unitId);
      console.log(`[ProgressStore] Unit ${unitId} selesai! Bintang: ${u.stars_earned}`);
    }
  }

  function _calcStars(unitData, criteria) {
    if (!criteria.quiz_out_of) return 1;
    const ratio = unitData.quiz_best_score / criteria.quiz_out_of;
    if (ratio >= 0.9) return 3;
    if (ratio >= 0.7) return 2;
    return 1;
  }

  function _unlockNextUnit(completedUnitId) {
    // Nomor unit: u01 → 1, u02 → 2, dst.
    const num  = parseInt(completedUnitId.replace('u', ''), 10);
    const next = `u${String(num + 1).padStart(2, '0')}`;
    const u    = _ensureUnit(next);
    if (u.status === 'locked') {
      u.status = 'in_progress';
      u.first_accessed_at = new Date().toISOString();
      console.log(`[ProgressStore] Unit ${next} terbuka!`);
    }

    // Perbarui current_unit dan current_level di global
    _progress.global.current_unit = next;
    // Level naik kalau sudah habis unit di level ini
    // (sederhana: kalau unit nomor genap, level naik — sesuai mapping 2 unit/level)
    if (num % 2 === 0) {
      _progress.global.current_level = Math.min(4, Math.floor(num / 2) + 1);
    }
  }

  // ─── A3.7  Getters ────────────────────────────────────────────────────────

  /** Kembalikan jumlah bintang unit tertentu (0–3) */
  function getStars(unitId) {
    _requireInit('getStars');
    return (_progress.units[unitId] || {}).stars_earned || 0;
  }

  /** Kembalikan skor terbaik kuis unit tertentu */
  function getBestScore(unitId) {
    _requireInit('getBestScore');
    return (_progress.units[unitId] || {}).quiz_best_score || 0;
  }

  /** Kembalikan jumlah flashcard views unit tertentu */
  function getFlashcardViews(unitId) {
    _requireInit('getFlashcardViews');
    return (_progress.units[unitId] || {}).flashcard_views || 0;
  }

  /** Kembalikan total bintang semua unit */
  function getTotalStars() {
    _requireInit('getTotalStars');
    return _progress.global.total_stars || 0;
  }

  /** Kembalikan level aktif saat ini */
  function getCurrentLevel() {
    _requireInit('getCurrentLevel');
    return _progress.global.current_level || 1;
  }

  /** Kembalikan unit_id aktif saat ini */
  function getCurrentUnitId() {
    _requireInit('getCurrentUnitId');
    return _progress.global.current_unit || 'u01';
  }

  /** Kembalikan status lengkap satu unit */
  function getUnitStatus(unitId) {
    _requireInit('getUnitStatus');
    return { ...(_progress.units[unitId] || { status: 'locked' }) };
  }

  /** Kembalikan snapshot progress global */
  function getGlobalProgress() {
    _requireInit('getGlobalProgress');
    return { ..._progress.global };
  }

  // ─── A3.8  Profil pengguna (nama & usia anak) ─────────────────────────────

  /**
   * saveProfile({ name, age })
   * Simpan nama panggilan dan usia anak.
   */
  function saveProfile({ name, age }) {
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify({ name, age }));
    } catch (e) {
      console.warn('[ProgressStore] Gagal simpan profil:', e);
    }
  }

  /** Kembalikan profil { name, age } atau null */
  function getProfile() {
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  // ─── A3.9  Session tracking ───────────────────────────────────────────────

  /** Catat awal sesi belajar — untuk streak dan statistik */
  function startSession() {
    _requireInit('startSession');
    const today = new Date().toDateString();
    const last  = _progress.global.last_session
      ? new Date(_progress.global.last_session).toDateString()
      : null;

    if (last !== today) {
      _progress.global.streak_days = last === _yesterday()
        ? (_progress.global.streak_days || 0) + 1
        : 1;
    }
    _progress.global.last_session = new Date().toISOString();
    _progress.global.sessions_total = (_progress.global.sessions_total || 0) + 1;
    _save();
  }

  function _yesterday() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toDateString();
  }

  // ─── A3.10  Reset ─────────────────────────────────────────────────────────

  /** Reset progress buku ini (untuk testing atau mulai ulang) */
  function reset(bookId) {
    const id = bookId || _bookId;
    if (!id) return;
    localStorage.removeItem(STORAGE_KEY_PREFIX + id);
    if (id === _bookId) {
      _progress = _createFreshProgress(id);
      _save();
      console.log(`[ProgressStore] Progress "${id}" di-reset.`);
    }
  }

  /** Reset semua data termasuk profil */
  function resetAll() {
    Object.keys(localStorage)
      .filter(k => k.startsWith(STORAGE_KEY_PREFIX))
      .forEach(k => localStorage.removeItem(k));
    localStorage.removeItem(PROFILE_KEY);
    _progress = null;
    _bookId   = null;
    console.log('[ProgressStore] Semua data di-reset.');
  }

  // ─── A3.11  Debug ─────────────────────────────────────────────────────────

  function debug() {
    _requireInit('debug');
    console.group('[ProgressStore]');
    console.log('Book:', _bookId);
    console.log('Global:', _progress.global);
    console.log('Units:');
    for (const [id, u] of Object.entries(_progress.units)) {
      console.log(`  ${id}: status=${u.status} stars=${u.stars_earned} quiz=${u.quiz_best_score}/${u.quiz_out_of} fc=${u.flashcard_views}`);
    }
    console.groupEnd();
  }

  // ─── Public API ───────────────────────────────────────────────────────────
  return {
    init,
    // Unit management
    unlockUnit,
    isUnitUnlocked,
    isUnitComplete,
    isLevelUnlocked,
    // Activity tracking
    markActivityDone,
    // Getters
    getStars,
    getBestScore,
    getFlashcardViews,
    getTotalStars,
    getCurrentLevel,
    getCurrentUnitId,
    getUnitStatus,
    getGlobalProgress,
    // Profile
    saveProfile,
    getProfile,
    // Session
    startSession,
    // Reset
    reset,
    resetAll,
    // Debug
    debug,
  };

})();

export default ProgressStore;
