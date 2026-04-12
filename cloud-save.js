import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBVet9sbcwt-DavxH2geUN0CFlMrQYHN5E",
  authDomain: "ragdoll-archers.firebaseapp.com",
  projectId: "ragdoll-archers",
  storageBucket: "ragdoll-archers.firebasestorage.app",
  messagingSenderId: "143985519760",
  appId: "1:143985519760:web:56639ba24340c840837c15",
  measurementId: "G-QJCKY01RJV",
};

const CURRENT_COLLECTION = "s5Saves";
const LEGACY_COLLECTION = "saves";
const CURRENT_LOCAL_KEY = "SDK_DATA_local";
const LEGACY_LOCAL_KEY = "data";
const CURRENT_PAYLOAD_KEY = "data_v1";
const AUTOSAVE_PREF_PREFIX = "ragdoll-archers-s5-autosave-";

const ui = {
  authPanel: document.getElementById("auth-panel"),
  authPanelClose: document.getElementById("auth-panel-close"),
  signIn: document.getElementById("google-sign-in"),
  signOut: document.getElementById("google-sign-out"),
  signedInActions: document.getElementById("signed-in-actions"),
  userName: document.getElementById("user-name"),
  saveStatus: document.getElementById("save-status"),
  lastSaved: document.getElementById("last-saved"),
  autosaveToggle: document.getElementById("autosave-toggle"),
  saveProgress: document.getElementById("save-progress"),
  loadCloudSave: document.getElementById("load-cloud-save"),
  importOldSave: document.getElementById("import-old-save"),
  localSummary: document.getElementById("local-summary"),
  currentCloudSummary: document.getElementById("current-cloud-summary"),
  legacyCloudSummary: document.getElementById("legacy-cloud-summary"),
  toast: document.getElementById("toast"),
  confirmModal: document.getElementById("confirm-modal"),
  confirmTitle: document.getElementById("confirm-title"),
  confirmBody: document.getElementById("confirm-body"),
  confirmCancel: document.getElementById("confirm-cancel"),
  confirmAccept: document.getElementById("confirm-accept"),
};

const firebaseApp = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const provider = new GoogleAuthProvider();

const state = {
  currentUser: null,
  currentLocal: null,
  currentCloud: null,
  legacyCloud: null,
  toastTimer: null,
  autosaveEnabled: true,
  autosaveTimer: null,
  autosaveFingerprint: null,
  modalResolver: null,
  lastSavedAt: null,
};

function numberValue(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function buildSeason5Progress(seed = {}) {
  const ids = Array.isArray(seed?.UnlockedArrows?.Ids)
    ? seed.UnlockedArrows.Ids.filter((id) => id !== null && id !== undefined)
    : [];

  return {
    Skulls: numberValue(seed.Skulls),
    HighScore: numberValue(seed.HighScore),
    ArmorUpgrade: numberValue(seed.ArmorUpgrade),
    HealthUpgrade: numberValue(seed.HealthUpgrade),
    StaminaUpgrade: numberValue(seed.StaminaUpgrade),
    StaminaRefreshUpgrade: numberValue(seed.StaminaRefreshUpgrade),
    DamageUpgrade: numberValue(seed.DamageUpgrade),
    PullingSpeedUpgrade: numberValue(seed.PullingSpeedUpgrade),
    ArrowSlotsUpgrade: numberValue(seed.ArrowSlotsUpgrade),
    UnlockedArrows: { Ids: [...new Set(ids)] },
    LivesUpgrade: numberValue(seed.LivesUpgrade),
  };
}

function safeJsonParse(value) {
  if (!value || typeof value !== "string") {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch (error) {
    console.warn("JSON parse failed", error);
    return null;
  }
}

function readCurrentLocalProgress() {
  const wrapped = safeJsonParse(window.localStorage.getItem(CURRENT_LOCAL_KEY));
  const wrappedPayload = wrapped?.data?.[CURRENT_PAYLOAD_KEY];

  if (typeof wrappedPayload === "string") {
    const parsed = safeJsonParse(wrappedPayload);
    if (parsed && typeof parsed === "object") {
      return buildSeason5Progress(parsed);
    }
  }

  const legacyLocal = safeJsonParse(window.localStorage.getItem(LEGACY_LOCAL_KEY));
  if (legacyLocal && typeof legacyLocal === "object") {
    return buildSeason5Progress(legacyLocal);
  }

  return null;
}

function writeCurrentLocalProgress(progress) {
  const existing = safeJsonParse(window.localStorage.getItem(CURRENT_LOCAL_KEY)) || {};
  const wrapped = {
    ...existing,
    data: {
      ...(existing.data || {}),
      [CURRENT_PAYLOAD_KEY]: JSON.stringify(buildSeason5Progress(progress)),
    },
    metadata: {
      ...(existing.metadata || {}),
      date: new Date().toISOString(),
    },
  };
  window.localStorage.setItem(CURRENT_LOCAL_KEY, JSON.stringify(wrapped));
}

function progressFingerprint(progress) {
  return progress ? JSON.stringify(buildSeason5Progress(progress)) : "";
}

function formatProgress(progress, emptyMessage) {
  if (!progress) {
    return emptyMessage;
  }

  const lines = [
    `Skulls: ${numberValue(progress.Skulls)}`,
    `High score: ${numberValue(progress.HighScore)}`,
    `Armor: ${numberValue(progress.ArmorUpgrade)}`,
    `Health: ${numberValue(progress.HealthUpgrade)}`,
    `Stamina: ${numberValue(progress.StaminaUpgrade)}`,
    `Stamina refresh: ${numberValue(progress.StaminaRefreshUpgrade)}`,
    `Damage: ${numberValue(progress.DamageUpgrade)}`,
    `Pulling speed: ${numberValue(progress.PullingSpeedUpgrade)}`,
    `Arrow slots: ${numberValue(progress.ArrowSlotsUpgrade)}`,
    `Lives: ${numberValue(progress.LivesUpgrade)}`,
    `Unlocked arrows: ${Array.isArray(progress.UnlockedArrows?.Ids) ? progress.UnlockedArrows.Ids.length : 0}`,
  ];

  return lines.join("\n");
}

function setStatus(message) {
  ui.saveStatus.textContent = message;
}

function formatLastSaved(timestamp) {
  if (!timestamp) {
    return "Last saved: Never";
  }

  const date = new Date(timestamp);
  const text = date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `Last saved: ${text}`;
}

function updateLastSaved(timestamp) {
  state.lastSavedAt = timestamp || null;
  ui.lastSaved.textContent = formatLastSaved(state.lastSavedAt);
}

function showToast(message) {
  ui.toast.textContent = message;
  ui.toast.hidden = false;
  if (state.toastTimer) {
    clearTimeout(state.toastTimer);
  }
  state.toastTimer = window.setTimeout(() => {
    ui.toast.hidden = true;
  }, 4200);
}

function setPanelOpen(open) {
  ui.authPanel.hidden = !open;
}

function setAutosaveUi() {
  const label = state.autosaveEnabled ? "Autosave: On" : "Autosave: Off";
  ui.autosaveToggle.textContent = label;
  ui.autosaveToggle.classList.toggle("off", !state.autosaveEnabled);
}

function stopAutosave() {
  if (state.autosaveTimer) {
    clearInterval(state.autosaveTimer);
    state.autosaveTimer = null;
  }
}

async function saveSeason5CloudProgress(progress, mode = "manual") {
  if (!state.currentUser || !progress) {
    return false;
  }

  const normalized = buildSeason5Progress(progress);
  const payload = JSON.stringify(normalized);
  const updatedAt = Date.now();

  await setDoc(doc(db, CURRENT_COLLECTION, state.currentUser.uid), {
    keyName: CURRENT_PAYLOAD_KEY,
    payload,
    updatedAt,
    mode,
  }, { merge: true });

  state.currentCloud = {
    exists: true,
    progress: normalized,
    rawPayload: payload,
    updatedAt,
  };
  state.autosaveFingerprint = payload;
  updateLastSaved(updatedAt);
  renderSummaries();
  return true;
}

function startAutosave() {
  stopAutosave();
  if (!state.currentUser || !state.autosaveEnabled) {
    return;
  }

  state.autosaveTimer = window.setInterval(async () => {
    const progress = readCurrentLocalProgress();
    if (!progress) {
      return;
    }

    const fingerprint = progressFingerprint(progress);
    if (!fingerprint || fingerprint === state.autosaveFingerprint) {
      return;
    }

    try {
      await saveSeason5CloudProgress(progress, "autosave");
      setStatus("Autosaved current Season 5 progress.");
    } catch (error) {
      console.error("Autosave failed", error);
    }
  }, 60000);
}

async function readCloudDocument(collection, uid) {
  const snapshot = await getDoc(doc(db, collection, uid));
  if (!snapshot.exists()) {
    return {
      exists: false,
      progress: null,
      rawPayload: null,
      updatedAt: null,
    };
  }

  const data = snapshot.data();
  const parsed = safeJsonParse(data.payload);
  return {
    exists: true,
    progress: parsed ? buildSeason5Progress(parsed) : null,
    rawPayload: data.payload || null,
    updatedAt: numberValue(data.updatedAt) || null,
  };
}

function renderSummaries() {
  state.currentLocal = readCurrentLocalProgress();

  ui.localSummary.textContent = formatProgress(state.currentLocal, "No local Season 5 progress found yet.");
  ui.currentCloudSummary.textContent = formatProgress(
    state.currentCloud?.progress || null,
    "No Season 5 cloud save found yet.",
  );
  ui.legacyCloudSummary.textContent = formatProgress(
    state.legacyCloud?.progress || null,
    "No Season 3 old save found.",
  );

  ui.loadCloudSave.disabled = !state.currentCloud?.progress;
  ui.importOldSave.disabled = !state.legacyCloud?.progress;
}

function syncSignedInUi() {
  const signedIn = Boolean(state.currentUser);
  ui.signIn.hidden = signedIn;
  ui.signedInActions.hidden = !signedIn;
  ui.authPanel.hidden = false;

  if (!signedIn) {
    ui.userName.textContent = "Not signed in";
    ui.currentCloudSummary.textContent = "Sign in to check.";
    ui.legacyCloudSummary.textContent = "Sign in to check.";
    updateLastSaved(null);
    renderSummaries();
    return;
  }

  const label = state.currentUser.displayName || state.currentUser.email || "Player";
  ui.userName.textContent = `Signed in as ${label}`;
  setAutosaveUi();
}

function needsOverwriteWarning(sourceProgress) {
  const local = readCurrentLocalProgress();
  if (!local || !sourceProgress) {
    return false;
  }
  return progressFingerprint(local) !== progressFingerprint(sourceProgress);
}

function openConfirm(title, body, acceptLabel) {
  ui.confirmTitle.textContent = title;
  ui.confirmBody.textContent = body;
  ui.confirmAccept.textContent = acceptLabel;
  ui.confirmModal.hidden = false;

  return new Promise((resolve) => {
    state.modalResolver = resolve;
  });
}

function closeConfirm(result) {
  ui.confirmModal.hidden = true;
  if (state.modalResolver) {
    state.modalResolver(result);
    state.modalResolver = null;
  }
}

async function refreshCloudState() {
  if (!state.currentUser) {
    state.currentCloud = null;
    state.legacyCloud = null;
    renderSummaries();
    return;
  }

  try {
    state.currentCloud = await readCloudDocument(CURRENT_COLLECTION, state.currentUser.uid);
    state.legacyCloud = await readCloudDocument(LEGACY_COLLECTION, state.currentUser.uid);
    renderSummaries();
    updateLastSaved(state.currentCloud?.updatedAt || null);

    if (!state.currentCloud.exists && state.legacyCloud.exists) {
      setStatus("A Season 3 old save was found. You can copy it into Season 5.");
    } else if (state.currentCloud.exists && needsOverwriteWarning(state.currentCloud.progress)) {
      setStatus("A Season 5 cloud save was found. Use it only if you want to replace this device.");
    } else if (state.currentCloud.exists) {
      setStatus("Season 5 cloud save ready.");
    } else {
      setStatus("No Season 5 cloud save yet. Save when you want to back up this run.");
    }
  } catch (error) {
    console.error("Failed to read cloud saves", error);
    state.currentCloud = null;
    state.legacyCloud = null;
    updateLastSaved(null);
    renderSummaries();
    setStatus(`Cloud check failed: ${error.code || error.message || "unknown error"}`);
  }
}

function loadAutosavePreference() {
  if (!state.currentUser) {
    state.autosaveEnabled = true;
    setAutosaveUi();
    return;
  }

  const saved = window.localStorage.getItem(`${AUTOSAVE_PREF_PREFIX}${state.currentUser.uid}`);
  state.autosaveEnabled = saved !== "0";
  setAutosaveUi();
}

async function handleManualSave() {
  const progress = readCurrentLocalProgress();
  if (!progress) {
    setStatus("No local Season 5 progress found yet. Play a round first.");
    return;
  }

  try {
    await saveSeason5CloudProgress(progress, "manual");
    setStatus("Season 5 progress saved to your Google account.");
    showToast("Season 5 progress saved.");
  } catch (error) {
    console.error("Save failed", error);
    setStatus(`Save failed: ${error.code || error.message || "unknown error"}`);
  }
}

async function handleUseCloudSave() {
  const cloudProgress = state.currentCloud?.progress;
  if (!cloudProgress) {
    setStatus("No Season 5 cloud save is available yet.");
    return;
  }

  if (needsOverwriteWarning(cloudProgress)) {
    const accepted = await openConfirm(
      "Use Season 5 cloud save?",
      "This will replace the Season 5 progress on this device with the cloud copy. Your Season 3 old save will not be changed.",
      "Use Season 5 cloud save",
    );
    if (!accepted) {
      return;
    }
  }

  writeCurrentLocalProgress(cloudProgress);
  updateLastSaved(state.currentCloud?.updatedAt || null);
  renderSummaries();
  setStatus("Season 5 cloud save copied to this device. Reload to apply it.");
  showToast("Cloud save loaded. Reload the page to use it.");
}

async function handleImportOldSave() {
  const legacyProgress = state.legacyCloud?.progress;
  if (!legacyProgress) {
    setStatus("No Season 3 old save was found for this account.");
    return;
  }

  if (needsOverwriteWarning(legacyProgress)) {
    const accepted = await openConfirm(
      "Import Season 3 old save?",
      "This copies your Season 3 old save into the Season 5 format. It does not overwrite the original Season 3 save document.",
      "Import Season 3 old save",
    );
    if (!accepted) {
      return;
    }
  }

  const converted = buildSeason5Progress(legacyProgress);
  writeCurrentLocalProgress(converted);

  try {
    await saveSeason5CloudProgress(converted, "legacy-import");
    renderSummaries();
    setStatus("Season 3 old save copied into Season 5. Reload to apply it.");
    showToast("Season 3 old save imported. Reload the page to use it.");
  } catch (error) {
    console.error("Old save import failed", error);
    setStatus(`Import failed: ${error.code || error.message || "unknown error"}`);
  }
}

function configureEvents() {
  renderSummaries();

  ui.authPanelClose.addEventListener("click", () => {
    setPanelOpen(true);
  });

  ui.confirmCancel.addEventListener("click", () => closeConfirm(false));
  ui.confirmAccept.addEventListener("click", () => closeConfirm(true));
  ui.confirmModal.addEventListener("click", (event) => {
    if (event.target === ui.confirmModal) {
      closeConfirm(false);
    }
  });

  ui.signIn.addEventListener("click", async () => {
    try {
      await signInWithPopup(auth, provider);
      setStatus("Signed in. Checking Season 5 and Season 3 saves.");
    } catch (error) {
      console.error("Sign in failed", error);
      if (error.code === "auth/unauthorized-domain") {
        setStatus("Sign in failed: add this site to Firebase Authentication authorized domains.");
      } else {
        setStatus(`Sign in failed: ${error.code || error.message || "unknown error"}`);
      }
    }
  });

  ui.signOut.addEventListener("click", async () => {
    try {
      await signOut(auth);
      setStatus("Signed out.");
      showToast("Signed out of Google saves.");
    } catch (error) {
      console.error("Sign out failed", error);
      setStatus(`Sign out failed: ${error.code || error.message || "unknown error"}`);
    }
  });

  ui.saveProgress.addEventListener("click", handleManualSave);
  ui.loadCloudSave.addEventListener("click", handleUseCloudSave);
  ui.importOldSave.addEventListener("click", handleImportOldSave);

  ui.autosaveToggle.addEventListener("click", () => {
    if (!state.currentUser) {
      return;
    }
    state.autosaveEnabled = !state.autosaveEnabled;
    window.localStorage.setItem(`${AUTOSAVE_PREF_PREFIX}${state.currentUser.uid}`, state.autosaveEnabled ? "1" : "0");
    setAutosaveUi();
    if (state.autosaveEnabled) {
      startAutosave();
      setStatus("Autosave turned on.");
    } else {
      stopAutosave();
      setStatus("Autosave turned off. Manual save still works.");
    }
  });

  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if (key === "g" || key === "k") {
      setPanelOpen(ui.authPanel.hidden);
    }
  });
}

onAuthStateChanged(auth, async (user) => {
  state.currentUser = user;
  loadAutosavePreference();
  syncSignedInUi();

  if (!user) {
    stopAutosave();
    state.currentCloud = null;
    state.legacyCloud = null;
    updateLastSaved(null);
    renderSummaries();
    return;
  }

  try {
    await refreshCloudState();
    state.autosaveFingerprint = state.currentCloud?.rawPayload || "";
    startAutosave();
  } catch (error) {
    console.error("Auth state refresh failed", error);
    setStatus(`Cloud startup failed: ${error.code || error.message || "unknown error"}`);
  }
});

configureEvents();
