(() => {
  if (globalThis.__webTextReplacerLoaded) return;
  globalThis.__webTextReplacerLoaded = true;

  const STORAGE_KEY = "replacementState";
  const EXCLUDED_TAGS = new Set([
    "SCRIPT",
    "STYLE",
    "NOSCRIPT",
    "TEXTAREA",
    "INPUT",
    "SELECT",
    "OPTION",
    "CODE",
    "PRE"
  ]);
  const REPLACEABLE_ATTRIBUTES = new Set([
    "placeholder",
    "value",
    "data-value",
    "data-placeholder",
    "aria-label",
    "title",
    "alt"
  ]);

  let state = { enabled: true, mapping: {}, triggerEnabled: false, triggerKeys: [] };
  let replacementPattern = null;
  let triggerPattern = null;
  let triggerMatched = false;
  let observer = null;
  let isApplying = false;
  let pseudoStyleElement = null;
  let pseudoClassCounter = 0;

  const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const rebuildPattern = () => {
    const keys = Object.keys(state.mapping)
      .filter((key) => key.length > 0)
      .sort((left, right) => right.length - left.length);
    replacementPattern = keys.length === 0
      ? null
      : new RegExp(keys.map(escapeRegExp).join("|"), "g");
    const triggerKeys = (state.triggerKeys || [])
      .filter((key) => key.length > 0)
      .sort((left, right) => right.length - left.length);
    triggerPattern = !state.triggerEnabled || triggerKeys.length === 0
      ? null
      : new RegExp(
          triggerKeys
            .map((key) => escapeRegExp(key).replace(/\\\*/g, ".*"))
            .join("|"),
          "i",
        );
    triggerMatched = triggerPattern === null;
  };

  const matchesTrigger = (root) => {
    if (!triggerPattern) return true;
    const currentUrl = window.location.href;
    const url = new URL(currentUrl);
    const locationCandidate = `${currentUrl} ${url.hostname} ${url.pathname} ${url.hash}`;
    triggerPattern.lastIndex = 0;
    if (triggerPattern.test(locationCandidate)) return true;
    triggerPattern.lastIndex = 0;
    return false;
  };

  const isExcluded = (node) => {
    let element = node.parentElement;
    while (element) {
      if (EXCLUDED_TAGS.has(element.tagName) || element.isContentEditable) return true;
      element = element.parentElement;
    }
    return false;
  };

  const replaceInTextNode = (node) => {
    if (!state.enabled || !replacementPattern || isExcluded(node)) return;
    const original = node.nodeValue || "";
    if (!replacementPattern.test(original)) {
      replacementPattern.lastIndex = 0;
      return;
    }
    replacementPattern.lastIndex = 0;
    node.nodeValue = original.replace(replacementPattern, (key) => String(state.mapping[key]));
    replacementPattern.lastIndex = 0;
  };

  const replaceInElement = (element) => {
    if (!state.enabled || !replacementPattern || isExcluded(element)) return;
    REPLACEABLE_ATTRIBUTES.forEach((attributeName) => {
      if (!element.hasAttribute(attributeName)) return;
      const original = element.getAttribute(attributeName) || "";
      replacementPattern.lastIndex = 0;
      if (!replacementPattern.test(original)) return;
      replacementPattern.lastIndex = 0;
      element.setAttribute(
        attributeName,
        original.replace(replacementPattern, (key) => String(state.mapping[key]))
      );
      replacementPattern.lastIndex = 0;
    });

    if ("value" in element && typeof element.value === "string") {
      replacementPattern.lastIndex = 0;
      if (replacementPattern.test(element.value)) {
        replacementPattern.lastIndex = 0;
        const replacedValue = element.value.replace(
          replacementPattern,
          (key) => String(state.mapping[key]),
        );
        const prototype = element instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
        const valueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
        if (valueSetter) {
          valueSetter.call(element, replacedValue);
          element.dispatchEvent(new Event("input", { bubbles: true }));
        } else {
          element.value = replacedValue;
        }
      }
      replacementPattern.lastIndex = 0;
    }
  };

  const ensurePseudoStyleElement = () => {
    if (pseudoStyleElement) return pseudoStyleElement;
    pseudoStyleElement = document.createElement("style");
    pseudoStyleElement.id = "web-text-replacer-pseudo-overrides";
    (document.head || document.documentElement).appendChild(pseudoStyleElement);
    return pseudoStyleElement;
  };

  const replacePseudoContent = (element, pseudo, rules) => {
    const content = getComputedStyle(element, pseudo).content;
    if (!content || content === "none" || content === "normal") return;
    replacementPattern.lastIndex = 0;
    if (!replacementPattern.test(content)) return;
    replacementPattern.lastIndex = 0;
    const replaced = content.replace(
      replacementPattern,
      (key) => String(state.mapping[key]),
    );
    replacementPattern.lastIndex = 0;
    let marker = element.dataset.webTextReplacerPseudo;
    if (!marker) {
      marker = `web-text-replacer-${pseudoClassCounter++}`;
      element.dataset.webTextReplacerPseudo = marker;
      element.classList.add(marker);
    }
    rules.push(`.${marker}${pseudo} { content: ${JSON.stringify(replaced)} !important; }`);
  };

  const replaceInPseudoElements = (root) => {
    if (!state.enabled || !replacementPattern) return;
    const elements = root.nodeType === Node.ELEMENT_NODE
      ? [root, ...root.querySelectorAll("*")]
      : [...root.querySelectorAll("*")];
    const rules = [];
    elements.forEach((element) => {
      replacePseudoContent(element, "::before", rules);
      replacePseudoContent(element, "::after", rules);
    });
    ensurePseudoStyleElement().textContent = rules.join("\n");
  };

  const replaceInRoot = (root) => {
    if (!state.enabled || !replacementPattern) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let node;
    while ((node = walker.nextNode())) nodes.push(node);
    nodes.forEach(replaceInTextNode);
    if (root.nodeType === Node.ELEMENT_NODE) {
      replaceInElement(root);
      root.querySelectorAll("*").forEach(replaceInElement);
      root.querySelectorAll("*").forEach((element) => {
        if (element.shadowRoot) replaceInRoot(element.shadowRoot);
      });
    }
    replaceInPseudoElements(root);
  };

  const applyReplacements = () => {
    if (isApplying) return;
    isApplying = true;
    rebuildPattern();
    const root = document.body || document.documentElement;
    if (matchesTrigger(root)) {
      triggerMatched = true;
      replaceInRoot(root);
    }
    isApplying = false;
  };

  globalThis.__webTextReplacerApply = applyReplacements;

  const loadState = async () => {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    if (stored[STORAGE_KEY] && typeof stored[STORAGE_KEY] === "object") {
      state = {
        enabled: stored[STORAGE_KEY].enabled !== false,
        mapping: stored[STORAGE_KEY].mapping || {},
        triggerEnabled: stored[STORAGE_KEY].triggerEnabled === true,
        triggerKeys: stored[STORAGE_KEY].triggerKeys || []
      };
    }
    applyReplacements();
  };

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[STORAGE_KEY]) return;
    const next = changes[STORAGE_KEY].newValue || { enabled: true, mapping: {} };
    state = {
      enabled: next.enabled !== false,
      mapping: next.mapping || {},
      triggerEnabled: next.triggerEnabled === true,
      triggerKeys: next.triggerKeys || []
    };
    applyReplacements();
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "apply") {
      applyReplacements();
      sendResponse({ ok: true });
    }
    return true;
  });

  observer = new MutationObserver((mutations) => {
    if (isApplying || !state.enabled || !replacementPattern) return;
    if (!triggerMatched) {
      const root = document.body || document.documentElement;
      if (matchesTrigger(root)) {
        applyReplacements();
      }
      return;
    }
    mutations.forEach((mutation) => {
      if (mutation.type === "characterData") {
        replaceInTextNode(mutation.target);
        return;
      }
      if (mutation.type === "attributes") {
        replaceInElement(mutation.target);
        return;
      }
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) replaceInTextNode(node);
        if (node.nodeType === Node.ELEMENT_NODE) {
          replaceInRoot(node);
          if (node.shadowRoot) {
            observer.observe(node.shadowRoot, {
              childList: true,
              characterData: true,
              attributes: true,
              attributeFilter: Array.from(REPLACEABLE_ATTRIBUTES),
              subtree: true
            });
          }
        }
      });
    });
  });

  loadState();
  observer.observe(document.documentElement, {
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: Array.from(REPLACEABLE_ATTRIBUTES),
    subtree: true
  });
  document.querySelectorAll("*").forEach((element) => {
    if (element.shadowRoot) {
      observer.observe(element.shadowRoot, {
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: Array.from(REPLACEABLE_ATTRIBUTES),
        subtree: true
      });
    }
  });
})();
