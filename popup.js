const STORAGE_KEY = "replacementState";
const mappingInput = document.getElementById("mapping-input");
const triggerInput = document.getElementById("trigger-input");
const triggerEnabledInput = document.getElementById("trigger-enabled");
const mappingFile = document.getElementById("mapping-file");
const enabledInput = document.getElementById("enabled");
const status = document.getElementById("status");

const setStatus = (message, kind = "") => {
  status.textContent = message;
  status.className = kind;
};

const validateMapping = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Mapping data must contain one flat object of key-value pairs.");
  }
  const mapping = {};
  for (const [key, item] of Object.entries(value)) {
    if (!key.trim() || item === undefined || item === null || typeof item === "object") {
      throw new Error("Keys must map to text, numbers, or boolean values.");
    }
    mapping[key] = String(item);
  }
  return mapping;
};

const parseTriggerKeys = (value) => [...new Set(
  value
    .split(/[\n,]/)
    .map((key) => key.trim())
    .filter(Boolean)
)];

const readState = async () => {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const state = stored[STORAGE_KEY] || { enabled: true, mapping: {} };
  mappingInput.value = JSON.stringify(state.mapping || {}, null, 2);
  triggerInput.value = (state.triggerKeys || []).join("\n");
  triggerEnabledInput.checked = state.triggerEnabled === true;
  triggerInput.hidden = !triggerEnabledInput.checked;
  enabledInput.checked = state.enabled !== false;
};

const applyState = async () => {
  try {
    const mapping = validateMapping(JSON.parse(mappingInput.value || "{}"));
    const triggerKeys = parseTriggerKeys(triggerInput.value);
    await chrome.storage.local.set({
      [STORAGE_KEY]: {
        enabled: enabledInput.checked,
        mapping,
        triggerEnabled: triggerEnabledInput.checked,
        triggerKeys,
      }
    });
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]?.id) {
      await chrome.scripting.executeScript({
        target: { tabId: tabs[0].id, allFrames: true },
        files: ["content.js"]
      }).catch(() => {});
      await chrome.scripting.executeScript({
        target: { tabId: tabs[0].id, allFrames: true },
      func: () => globalThis.__webTextReplacerApply?.()
      }).catch(() => {});
    }
    const triggerMessage = triggerEnabledInput.checked && triggerKeys.length > 0
      ? `for ${triggerKeys.length} URL pattern(s)`
      : "on all pages";
    setStatus(`${Object.keys(mapping).length} replacement(s) active ${triggerMessage}.`, "success");
  } catch (error) {
    setStatus(error.message || "Invalid mapping data.", "error");
  }
};

mappingFile.addEventListener("change", async () => {
  const file = mappingFile.files[0];
  if (!file) return;
  try {
    mappingInput.value = await file.text();
    setStatus("Mapping file loaded. Click Apply to use it.");
  } catch {
    setStatus("Unable to read this file.", "error");
  }
});

document.getElementById("apply").addEventListener("click", applyState);
document.getElementById("clear").addEventListener("click", async () => {
  mappingInput.value = "{}";
  triggerInput.value = "";
  triggerEnabledInput.checked = false;
  triggerInput.hidden = true;
  await chrome.storage.local.set({
    [STORAGE_KEY]: {
      enabled: false,
      mapping: {},
      triggerEnabled: false,
      triggerKeys: [],
    }
  });
  enabledInput.checked = false;
  setStatus("Replacements cleared.", "success");
});
enabledInput.addEventListener("change", applyState);
triggerEnabledInput.addEventListener("change", () => {
  triggerInput.hidden = !triggerEnabledInput.checked;
  applyState();
});
readState();
