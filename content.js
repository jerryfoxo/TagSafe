// ============================================================
// TagSafe — content.js
// ============================================================

const DEBUG = false;

const MAX_SETTINGS_FILE_SIZE = 250 * 1024; // 250 KB

function debug(...args) {
  if (DEBUG) {
    console.log("[TagSafe]", ...args);
  }
}

// ============================================================
// BUILT-IN SETTINGS
// ============================================================

const BUILTIN_TAG_GROUPS = [
  {
    name: "General",
    tags: ["Vore"],
  },
  {
    name: "Type / route",
    tags: [
      "Oral vore",
      "Anal vore",
      "Cock vore",
      "Unbirth",
      "Endo",
      "Hard vore",
    ],
  },
  {
    name: "Outcome / digestion",
    tags: ["Non-fatal", "Fatal", "No digestion", "Digestion"],
  },
  {
    name: "Tone / content",
    tags: ["Safe/Comfort", "Teasing", "Distress", "Gore"],
  },
  {
    name: "Predator gender",
    tags: [
      "Male pred",
      "Female pred",
      "Nonbinary pred",
      "Other pred",
      "Mixed pred",
    ],
  },
  {
    name: "Prey gender",
    tags: [
      "Male prey",
      "Female prey",
      "Nonbinary prey",
      "Other prey",
      "Mixed prey",
    ],
  },
  {
    name: "Species / character",
    tags: ["Human prey", "Pokémon"],
  },
];

const BUILTIN_DEFAULT_TAGS = ["Vore"];

const BUILTIN_PRESETS = [
  {
    name: "Oral Vore",
    tags: ["Vore", "Oral vore"],
  },
  {
    name: "Anal Vore",
    tags: ["Vore", "Anal vore"],
  },
  {
    name: "Cock Vore",
    tags: ["Vore", "Cock vore"],
  },
  {
    name: "Unbirth",
    tags: ["Vore", "Unbirth"],
  },
  {
    name: "Endo",
    tags: ["Vore", "Endo", "Non-fatal"],
  },
  {
    name: "Non-fatal",
    tags: ["Vore", "Non-fatal"],
  },
  {
    name: "Fatal",
    tags: ["Vore", "Fatal"],
  },
  {
    name: "Digestion",
    tags: ["Vore", "Digestion"],
  },
  {
    name: "No Digestion",
    tags: ["Vore", "No digestion"],
  },
  {
    name: "Non-fatal Digestion",
    tags: ["Vore", "Non-fatal", "Digestion"],
  },
  {
    name: "Fatal Digestion",
    tags: ["Vore", "Fatal", "Digestion"],
  },
  {
    name: "Hard Vore",
    tags: ["Vore", "Hard vore"],
  },
];

const BUILTIN_CONFLICTS = [
  ["Fatal", "Non-fatal"],
  ["Digestion", "No digestion"],
];

// ============================================================
// STATE
// ============================================================

function flattenTagGroups(groups) {
  const result = [];

  for (const group of groups || []) {
    for (const tag of group.tags || []) {
      if (!result.includes(tag)) {
        result.push(tag);
      }
    }
  }

  return result;
}

let tagGroups = structuredClone(BUILTIN_TAG_GROUPS);
let tags = flattenTagGroups(tagGroups);
let defaultTags = [...BUILTIN_DEFAULT_TAGS];
let selectedTags = new Set(defaultTags);
let presets = structuredClone(BUILTIN_PRESETS);
let conflicts = structuredClone(BUILTIN_CONFLICTS);

let autoAltEnabled = false;
let postCWEnabled = true;

// ============================================================
// ALT SYNC STATE
// ============================================================

const altSyncByImage = new Map();

let altSyncRunning = false;
let altSyncRequested = false;
let altSyncForceRequested = false;

// ============================================================
// STORAGE
// ============================================================

function loadStorage(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, resolve);
  });
}

function saveStorage(data) {
  return new Promise((resolve) => {
    chrome.storage.local.set(data, resolve);
  });
}

async function loadSettings() {
  const saved = await loadStorage([
    "tagGroups",
    "tags",
    "defaultTags",
    "presets",
    "conflicts",
    "autoAltEnabled",
    "postCWEnabled",
  ]);

  if (Array.isArray(saved.tagGroups) && saved.tagGroups.length) {
    tagGroups = structuredClone(saved.tagGroups);
    tags = flattenTagGroups(tagGroups);
  } else if (Array.isArray(saved.tags) && saved.tags.length) {
    // Backward compatibility with older TagSafe configurations.
    tagGroups = [
      {
        name: "Tags",
        tags: [...saved.tags],
      },
    ];

    tags = [...saved.tags];
  }

  if (Array.isArray(saved.defaultTags) && saved.defaultTags.length) {
    defaultTags = [...saved.defaultTags];
  }

  if (Array.isArray(saved.presets)) {
    presets = structuredClone(saved.presets);
  }

  if (Array.isArray(saved.conflicts)) {
    conflicts = structuredClone(saved.conflicts);
  }

  if (typeof saved.autoAltEnabled === "boolean") {
    autoAltEnabled = saved.autoAltEnabled;
  }

  if (typeof saved.postCWEnabled === "boolean") {
    postCWEnabled = saved.postCWEnabled;
  }

  defaultTags = defaultTags.filter((tag) => tags.includes(tag));

  if (!defaultTags.length) {
    defaultTags = [tags[0] || "Vore"];
  }

  selectedTags = new Set(defaultTags);
}

// ============================================================
// THEME DETECTION
// ============================================================

function isDarkColor(color) {
  const match = color.match(
    /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i,
  );

  if (!match) {
    return null;
  }

  const r = Number(match[1]);
  const g = Number(match[2]);
  const b = Number(match[3]);

  const luminance =
    0.2126 * r +
    0.7152 * g +
    0.0722 * b;

  return luminance < 140;
}

function detectComposerTheme() {
  const candidates = [
    document.body,
    document.documentElement,
  ];

  for (const element of candidates) {
    if (!element) {
      continue;
    }

    const background =
      getComputedStyle(element).backgroundColor;

    if (
      !background ||
      background === "transparent" ||
      background === "rgba(0, 0, 0, 0)"
    ) {
      continue;
    }

    const dark = isDarkColor(background);

    if (dark !== null) {
      return dark ? "dark" : "light";
    }
  }

  return window.matchMedia(
    "(prefers-color-scheme: dark)",
  ).matches
    ? "dark"
    : "light";
}

// ============================================================
// GENERIC HELPERS
// ============================================================

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitFor(check, timeout = 4000, interval = 80) {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const result = check();

    if (result) {
      return result;
    }

    await sleep(interval);
  }

  return null;
}

function isVisible(element) {
  if (!element) {
    return false;
  }

  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);

  return (
    rect.width > 0 &&
    rect.height > 0 &&
    style.display !== "none" &&
    style.visibility !== "hidden"
  );
}

// ============================================================
// TAG LOGIC
// ============================================================

function toHashtag(tag) {
  const cleaned = String(tag)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  return cleaned ? `#${cleaned}` : "";
}

function buildCWLine() {
  const hashtags = [...selectedTags]
    .map(toHashtag)
    .filter(Boolean)
    .join(" ");

  return `CW: ${hashtags}`.trimEnd();
}

function applyConflicts(selectedTag) {
  for (const group of conflicts) {
    if (!group.includes(selectedTag)) {
      continue;
    }

    for (const tag of group) {
      if (tag !== selectedTag) {
        selectedTags.delete(tag);
      }
    }
  }
}

function toggleTag(tag) {
  if (selectedTags.has(tag)) {
    // Always keep at least one tag selected.
    if (selectedTags.size === 1) {
      return;
    }

    selectedTags.delete(tag);
    return;
  }

  selectedTags.add(tag);
  applyConflicts(tag);
}

function sameTags(a, b) {
  const first = [...new Set(a || [])].sort();
  const second = [...new Set(b || [])].sort();

  return (
    first.length === second.length &&
    first.every((tag, index) => tag === second[index])
  );
}

// ============================================================
// SETTINGS FILE IMPORT / EXPORT
// ============================================================

function parseSettingsText(text) {
  const result = {
    tagGroups: [],
    tags: [],
    defaultTags: [],
    presets: [],
    conflicts: [],
  };

  const lines = String(text)
    .replace(/\r\n/g, "\n")
    .split("\n");

  let section = null;
  let currentPreset = null;
  let currentTagGroup = null;

  for (let index = 0; index < lines.length; index++) {
    const lineNumber = index + 1;
    const line = lines[index].trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const upper = line.toUpperCase();

    if (upper === "TAGS" || upper.startsWith("TAGS:")) {
      const name =
        upper === "TAGS"
          ? "General"
          : line.slice("TAGS:".length).trim();

      if (!name) {
        throw new Error(
          `Line ${lineNumber}: TAGS: needs a category name.`,
        );
      }

      currentTagGroup = {
        name,
        tags: [],
      };

      result.tagGroups.push(currentTagGroup);

      section = "tags";
      currentPreset = null;

      continue;
    }

    if (upper === "DEFAULT") {
      section = "default";
      currentPreset = null;
      currentTagGroup = null;

      continue;
    }

    if (upper === "CONFLICTS") {
      section = "conflicts";
      currentPreset = null;
      currentTagGroup = null;

      continue;
    }

    if (upper.startsWith("PRESET:")) {
      const name = line
        .slice("PRESET:".length)
        .trim();

      if (!name) {
        throw new Error(
          `Line ${lineNumber}: Preset needs a name.`,
        );
      }

      currentPreset = {
        name,
        tags: [],
      };

      result.presets.push(currentPreset);

      section = "preset";
      currentTagGroup = null;

      continue;
    }

    if (!section) {
      throw new Error(
        `Line ${lineNumber}: "${line}" is not inside TAGS, DEFAULT, PRESET or CONFLICTS.`,
      );
    }

    if (section === "tags") {
      if (!currentTagGroup) {
        throw new Error(
          `Line ${lineNumber}: Tag is missing a TAGS category.`,
        );
      }

      if (!currentTagGroup.tags.includes(line)) {
        currentTagGroup.tags.push(line);
      }

      if (!result.tags.includes(line)) {
        result.tags.push(line);
      }

      continue;
    }

    if (section === "default") {
      if (!result.defaultTags.includes(line)) {
        result.defaultTags.push(line);
      }

      continue;
    }

    if (section === "preset") {
      if (!currentPreset.tags.includes(line)) {
        currentPreset.tags.push(line);
      }

      continue;
    }

    if (section === "conflicts") {
      const group = line
        .split("|")
        .map((value) => value.trim())
        .filter(Boolean);

      if (group.length < 2) {
        throw new Error(
          `Line ${lineNumber}: A conflict needs at least two tags separated by |`,
        );
      }

      result.conflicts.push([...new Set(group)]);
    }
  }

  result.tagGroups =
    result.tagGroups.filter(
      (group) => group.tags.length,
    );

  result.tags =
    flattenTagGroups(
      result.tagGroups,
    );

  validateImportedSettings(result);

  return result;
}

function validateImportedSettings(settings) {
  if (
    !Array.isArray(settings.tagGroups) ||
    !settings.tagGroups.length
  ) {
    throw new Error(
      "At least one TAGS category is required.",
    );
  }

  if (!settings.tags.length) {
    throw new Error(
      "The TAGS sections cannot be empty.",
    );
  }

  if (!settings.defaultTags.length) {
    throw new Error(
      "The DEFAULT section must contain at least one tag.",
    );
  }

  const groupNames = new Set();

  for (const group of settings.tagGroups) {
    if (!group.name || !group.tags.length) {
      throw new Error(
        "Every TAGS category needs a name and at least one tag.",
      );
    }

    if (groupNames.has(group.name)) {
      throw new Error(
        `Tag category "${group.name}" is used more than once.`,
      );
    }

    groupNames.add(group.name);
  }

  const knownTags = new Set(settings.tags);

  function requireKnownTag(tag, location) {
    if (!knownTags.has(tag)) {
      throw new Error(
        `${location} contains unknown tag "${tag}". Add it under a TAGS category first.`,
      );
    }
  }

  for (const tag of settings.defaultTags) {
    requireKnownTag(tag, "DEFAULT");
  }

  const presetNames = new Set();

  for (const preset of settings.presets) {
    if (!preset.tags.length) {
      throw new Error(
        `Preset "${preset.name}" has no tags.`,
      );
    }

    if (presetNames.has(preset.name)) {
      throw new Error(
        `Preset name "${preset.name}" is used more than once.`,
      );
    }

    presetNames.add(preset.name);

    for (const tag of preset.tags) {
      requireKnownTag(
        tag,
        `Preset "${preset.name}"`,
      );
    }
  }

  for (const group of settings.conflicts) {
    for (const tag of group) {
      requireKnownTag(tag, "CONFLICTS");
    }
  }
}

function buildSettingsText() {
  const lines = [
    "# TagSafe settings",
    "#",
    "# Edit this file with Notepad or any text editor.",
    "# Lines beginning with # are comments and are ignored.",
    "#",
    "# Use TAGS: Category name to organize the buttons in TagSafe.",
    "# Every tag used in DEFAULT, PRESET or CONFLICTS",
    "# must also exist under one of the TAGS categories.",
  ];

  for (const group of tagGroups) {
    lines.push(
      "",
      `TAGS: ${group.name}`,
    );

    for (const tag of group.tags) {
      lines.push(tag);
    }
  }

  lines.push("", "DEFAULT");

  for (const tag of defaultTags) {
    lines.push(tag);
  }

  for (const preset of presets) {
    lines.push(
      "",
      `PRESET: ${preset.name}`,
    );

    for (const tag of preset.tags) {
      lines.push(tag);
    }
  }

  lines.push("", "CONFLICTS");

  for (const group of conflicts) {
    lines.push(
      group.join(" | "),
    );
  }

  lines.push("");

  return lines.join("\n");
}

function downloadSettingsFile() {
  const blob = new Blob(
    [buildSettingsText()],
    {
      type: "text/plain;charset=utf-8",
    },
  );

  const url =
    URL.createObjectURL(blob);

  const link =
    document.createElement("a");

  link.href = url;
  link.download =
    "TagSafe-settings.txt";

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}

function chooseSettingsFile(onSuccess) {
  const input =
    document.createElement("input");

  input.type = "file";
  input.accept = ".txt,text/plain";

  input.addEventListener(
    "change",
    async () => {
      const file =
        input.files?.[0];

      if (!file) {
        return;
      }

      if (
        file.size >
        MAX_SETTINGS_FILE_SIZE
      ) {
        alert(
          "Could not import TagSafe settings.\n\n" +
            "The settings file is too large. Maximum size is 250 KB.",
        );

        return;
      }

      try {
        const text =
          await file.text();

        const imported =
          parseSettingsText(text);

        tagGroups =
          structuredClone(
            imported.tagGroups,
          );

        tags =
          [...imported.tags];

        defaultTags =
          [...imported.defaultTags];

        presets =
          structuredClone(
            imported.presets,
          );

        conflicts =
          structuredClone(
            imported.conflicts,
          );

        selectedTags =
          new Set(defaultTags);

        await saveStorage({
          tagGroups,
          tags,
          defaultTags,
          presets,
          conflicts,
        });

        alert(
          "TagSafe settings imported successfully.",
        );

        onSuccess?.();
      } catch (error) {
        alert(
          `Could not import TagSafe settings.\n\n${error.message}`,
        );
      }
    },
  );

  input.click();
}

async function resetSettings() {
  tagGroups =
    structuredClone(
      BUILTIN_TAG_GROUPS,
    );

  tags =
    flattenTagGroups(
      tagGroups,
    );

  defaultTags =
    [...BUILTIN_DEFAULT_TAGS];

  presets =
    structuredClone(
      BUILTIN_PRESETS,
    );

  conflicts =
    structuredClone(
      BUILTIN_CONFLICTS,
    );

  selectedTags =
    new Set(defaultTags);

  await saveStorage({
    tagGroups,
    tags,
    defaultTags,
    presets,
    conflicts,
  });
}

// ============================================================
// BLUESKY COMPOSER
// ============================================================

function findComposer() {
  const dialogs = [
    ...document.querySelectorAll(
      '[role="dialog"], [aria-modal="true"]',
    ),
  ];

  for (const dialog of dialogs) {
    const editor =
      dialog.querySelector(
        '[contenteditable="true"], [role="textbox"], textarea',
      );

    if (!editor) {
      continue;
    }

    return (
      editor.closest("form") ||
      dialog
    );
  }

  return null;
}

function getComposerScope(composer) {
  if (!composer) {
    return document;
  }

  return (
    composer.closest(
      '[role="dialog"], [aria-modal="true"]',
    ) ||
    composer
  );
}

function findPostEditor(composer) {
  if (!composer) {
    return null;
  }

  const candidates = [
    ...composer.querySelectorAll(
      '[contenteditable="true"], [role="textbox"], textarea',
    ),
  ];

  for (const candidate of candidates) {
    if (
      candidate.closest(
        "[data-tagsafe]",
      )
    ) {
      continue;
    }

    return candidate;
  }

  return null;
}

// ============================================================
// POST EDITOR
// ============================================================

function hasCWLine(text) {
  return /^CW:[^\r\n]*/i.test(
    String(text || ""),
  );
}

function insertText(text) {
  document.execCommand(
    "insertText",
    false,
    text,
  );
}

function updateTextareaCW(
  editor,
  cw,
  focusAfter = false,
) {
  const current =
    editor.value || "";

  const managed =
    current.match(
      /^CW:[^\r\n]*(?:\r?\n\r?\n|\r?\n)?/i,
    );

  if (managed) {
    const oldText =
      managed[0];

    let replacement = cw;

    if (
      /\r?\n\r?\n$/.test(
        oldText,
      )
    ) {
      replacement =
        `${cw}\n\n`;
    } else if (
      /\r?\n$/.test(
        oldText,
      )
    ) {
      replacement =
        `${cw}\n`;
    }

    editor.setRangeText(
      replacement,
      0,
      oldText.length,
      "preserve",
    );
  } else {
    editor.setRangeText(
      `${cw}\n\n`,
      0,
      0,
      "preserve",
    );
  }

  editor.dispatchEvent(
    new InputEvent(
      "input",
      {
        bubbles: true,
        inputType:
          "insertText",
      },
    ),
  );

  if (focusAfter) {
    const position =
      `${cw}\n\n`.length;

    editor.focus();

    editor.setSelectionRange(
      position,
      position,
    );
  }
}

function removeCWFromTextarea(editor) {
  const current =
    editor.value || "";

  const managed =
    current.match(
      /^CW:[^\r\n]*(?:\r?\n\r?\n|\r?\n)?/i,
    );

  if (!managed) {
    return;
  }

  editor.setRangeText(
    "",
    0,
    managed[0].length,
    "preserve",
  );

  editor.dispatchEvent(
    new InputEvent(
      "input",
      {
        bubbles: true,
        inputType:
          "deleteContent",
      },
    ),
  );
}

function moveSelectionToStart(editor) {
  const selection =
    window.getSelection();

  if (!selection) {
    return false;
  }

  const range =
    document.createRange();

  range.selectNodeContents(editor);
  range.collapse(true);

  selection.removeAllRanges();
  selection.addRange(range);

  return true;
}

function selectManagedCW(editor) {
  /*
   * innerText preserves real newline boundaries,
   * while visual wrapping does not count as a new line.
   */
  const raw =
    editor.innerText ||
    editor.textContent ||
    "";

  const match =
    raw.match(
      /^CW:[^\r\n]*/i,
    );

  if (!match) {
    return false;
  }

  const cwLength =
    match[0].length;

  const selection =
    window.getSelection();

  if (
    !selection ||
    typeof selection.modify !==
      "function"
  ) {
    return false;
  }

  const range =
    document.createRange();

  range.selectNodeContents(editor);
  range.collapse(true);

  selection.removeAllRanges();
  selection.addRange(range);

  for (
    let i = 0;
    i < cwLength;
    i++
  ) {
    selection.modify(
      "extend",
      "forward",
      "character",
    );
  }

  return true;
}

function insertInitialCW(editor, cw) {
  if (
    !moveSelectionToStart(
      editor,
    )
  ) {
    return false;
  }

  insertText(
    `${cw}\n\n`,
  );

  return true;
}

function removeCWFromContentEditable(
  editor,
) {
  const current =
    editor.innerText ||
    editor.textContent ||
    "";

  if (
    !hasCWLine(current)
  ) {
    return;
  }

  editor.focus();

  if (
    !selectManagedCW(editor)
  ) {
    return;
  }

  // Delete only TagSafe's managed CW.
  document.execCommand(
    "delete",
    false,
  );

  /*
   * Remove the blank line(s) TagSafe inserted
   * between the CW and the post body.
   */
  const after =
    editor.innerText || "";

  const selection =
    window.getSelection();

  if (
    !selection ||
    typeof selection.modify !==
      "function"
  ) {
    return;
  }

  let newlineCount = 0;

  if (
    after.startsWith("\n\n")
  ) {
    newlineCount = 2;
  } else if (
    after.startsWith("\n")
  ) {
    newlineCount = 1;
  }

  for (
    let i = 0;
    i < newlineCount;
    i++
  ) {
    selection.modify(
      "extend",
      "forward",
      "character",
    );
  }

  if (newlineCount > 0) {
    document.execCommand(
      "delete",
      false,
    );
  }
}

function removeCWFromPost(composer) {
  const editor =
    findPostEditor(composer);

  if (!editor) {
    return;
  }

  if (
    "value" in editor &&
    typeof editor.setRangeText ===
      "function"
  ) {
    removeCWFromTextarea(editor);
    return;
  }

  removeCWFromContentEditable(
    editor,
  );
}

function placeCursorAtEnd(editor) {
  editor.focus();

  if (
    "selectionStart" in editor &&
    typeof editor.setSelectionRange ===
      "function"
  ) {
    const end =
      editor.value.length;

    editor.setSelectionRange(
      end,
      end,
    );

    return;
  }

  const selection =
    window.getSelection();

  if (!selection) {
    return;
  }

  const range =
    document.createRange();

  range.selectNodeContents(editor);
  range.collapse(false);

  selection.removeAllRanges();
  selection.addRange(range);
}

function updateContentEditableCW(
  editor,
  cw,
  focusAfter = false,
) {
  const current =
    editor.innerText ||
    editor.textContent ||
    "";

  editor.focus();

  if (
    hasCWLine(current)
  ) {
    if (
      !selectManagedCW(editor)
    ) {
      return;
    }

    insertText(cw);
  } else {
    insertInitialCW(
      editor,
      cw,
    );
  }

  if (focusAfter) {
    placeCursorAtEnd(editor);
  }
}

function updateCWInPost(
  composer,
  focusAfter = false,
) {
  if (!postCWEnabled) {
    removeCWFromPost(composer);
    return;
  }

  const editor =
    findPostEditor(composer);

  if (!editor) {
    return;
  }

  const cw =
    buildCWLine();

  if (
    "value" in editor &&
    typeof editor.setRangeText ===
      "function"
  ) {
    updateTextareaCW(
      editor,
      cw,
      focusAfter,
    );

    return;
  }

  updateContentEditableCW(
    editor,
    cw,
    focusAfter,
  );
}

// ============================================================
// ELEMENT METADATA
// ============================================================

function getElementMeta(element) {
  if (!element) {
    return "";
  }

  return [
    element.textContent,
    element.getAttribute(
      "aria-label",
    ),
    element.getAttribute(
      "title",
    ),
    element.getAttribute(
      "data-testid",
    ),
    element.getAttribute(
      "alt",
    ),
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function getButtonText(button) {
  return getElementMeta(button);
}

// ============================================================
// TOOLBAR DETECTION / PLACEMENT
// ============================================================

function findToolbarButtons(composer) {
  const buttons = [
    ...composer.querySelectorAll(
      'button, [role="button"]',
    ),
  ];

  return buttons.filter(
    (button) => {
      if (
        button.closest(
          "[data-tagsafe]",
        )
      ) {
        return false;
      }

      const text =
        getButtonText(button);

      return [
        "image",
        "photo",
        "media",
        "picture",
        "bild",
        "foto",
        "gif",
        "emoji",
      ].some(
        (word) =>
          text.includes(word),
      );
    },
  );
}

function getAncestors(element) {
  const ancestors = [];
  let current = element;

  while (current) {
    ancestors.push(current);
    current =
      current.parentElement;
  }

  return ancestors;
}

function nearestCommonAncestor(
  elements,
) {
  if (!elements.length) {
    return null;
  }

  const firstAncestors =
    getAncestors(elements[0]);

  for (
    const ancestor
    of firstAncestors
  ) {
    if (
      elements.every(
        (element) =>
          ancestor.contains(
            element,
          ),
      )
    ) {
      return ancestor;
    }
  }

  return null;
}

function findComposerToolbar(
  composer,
) {
  const buttons =
    findToolbarButtons(
      composer,
    );

  if (buttons.length < 2) {
    return null;
  }

  const candidate =
    nearestCommonAncestor(
      buttons.slice(
        0,
        Math.min(
          buttons.length,
          4,
        ),
      ),
    );

  if (
    !candidate ||
    candidate === composer
  ) {
    return null;
  }

  if (
    candidate
      .getBoundingClientRect()
      .height > 160
  ) {
    return null;
  }

  return candidate;
}

function findVerticalInsertionPoint(
  toolbar,
  composer,
) {
  let current = toolbar;

  while (
    current &&
    current.parentElement &&
    current !== composer
  ) {
    const parent =
      current.parentElement;

    const style =
      getComputedStyle(parent);

    const isHorizontalFlex =
      style.display === "flex" &&
      [
        "row",
        "row-reverse",
      ].includes(
        style.flexDirection,
      );

    const isHorizontalGrid =
      style.display === "grid" &&
      parent.children.length > 1;

    if (
      isHorizontalFlex ||
      isHorizontalGrid
    ) {
      current = parent;
      continue;
    }

    return {
      parent,
      before: current,
    };
  }

  return {
    parent: composer,
    before: current,
  };
}

/*
 * Validate that TagSafe was inserted into approximately
 * the same layout area as the Bluesky composer.
 *
 * During a temporary React loading state, Bluesky may expose
 * a toolbar inside a much wider container. Without this check,
 * TagSafe can end up spanning almost the entire page.
 */
function isTagSafePlacementValid(
  panel,
  composer,
) {
  if (
    !panel ||
    !composer
  ) {
    return false;
  }

  if (
    !document.contains(panel) ||
    !document.contains(composer)
  ) {
    return false;
  }

  const panelRect =
    panel.getBoundingClientRect();

  const composerRect =
    composer.getBoundingClientRect();

  if (
    panelRect.width <= 0 ||
    panelRect.height <= 0 ||
    composerRect.width <= 0 ||
    composerRect.height <= 0
  ) {
    return false;
  }

  /*
   * TagSafe should stay approximately within
   * the width of the composer.
   */
  const maxAllowedWidth =
    composerRect.width * 1.25;

  if (
    panelRect.width >
    maxAllowedWidth
  ) {
    return false;
  }

  /*
   * TagSafe should horizontally overlap
   * the composer.
   */
  const overlapsHorizontally =
    panelRect.right >
      composerRect.left &&
    panelRect.left <
      composerRect.right;

  if (!overlapsHorizontally) {
    return false;
  }

  return true;
}

// ============================================================
// IMAGE / ALT DETECTION
// ============================================================

function getUploadedImages(
  composer,
) {
  const scope =
    getComposerScope(
      composer,
    );

  return [
    ...scope.querySelectorAll(
      "img",
    ),
  ].filter(
    (image) => {
      if (!isVisible(image)) {
        return false;
      }

      const rect =
        image.getBoundingClientRect();

      if (
        rect.width < 80 ||
        rect.height < 80
      ) {
        return false;
      }

      const alt =
        String(
          image.getAttribute(
            "alt",
          ) || "",
        ).toLowerCase();

      if (
        alt.includes(
          "avatar",
        ) ||
        alt.includes(
          "profile",
        )
      ) {
        return false;
      }

      return true;
    },
  );
}

function hasUploadedImage(
  composer,
) {
  return (
    getUploadedImages(
      composer,
    ).length > 0
  );
}

function findAltControlsByText(
  composer,
) {
  const scope =
    getComposerScope(
      composer,
    );

  const elements = [
    ...scope.querySelectorAll(
      "span, div",
    ),
  ];

  const controls = [];

  for (
    const element
    of elements
  ) {
    if (!isVisible(element)) {
      continue;
    }

    const text =
      String(
        element.textContent || "",
      )
        .replace(/\s+/g, "")
        .toLowerCase();

    if (text !== "+alt") {
      continue;
    }

    const clickable =
      element.closest(
        'button, [role="button"], [tabindex="0"]',
      );

    if (
      clickable &&
      !controls.includes(
        clickable,
      )
    ) {
      controls.push(clickable);
    }
  }

  return controls;
}

function findAltButtons(
  composer,
) {
  const scope =
    getComposerScope(
      composer,
    );

  const candidates = [
    ...scope.querySelectorAll(
      'button, [role="button"], a, [tabindex="0"]',
    ),
  ];

  const matches = [];

  for (
    const candidate
    of candidates
  ) {
    if (
      candidate.closest(
        "[data-tagsafe]",
      )
    ) {
      continue;
    }

    if (
      !isVisible(candidate)
    ) {
      continue;
    }

    const meta =
      getElementMeta(
        candidate,
      );

    const isAltControl =
      meta === "+alt" ||
      meta === "alt" ||
      meta.includes(
        "add alt",
      ) ||
      meta.includes(
        "alt text",
      ) ||
      meta.includes(
        "image description",
      );

    if (isAltControl) {
      matches.push(
        candidate,
      );
    }
  }

  for (
    const control
    of findAltControlsByText(
      composer,
    )
  ) {
    if (
      !matches.includes(
        control,
      )
    ) {
      matches.push(control);
    }
  }

  debug(
    "ALT controls found:",
    matches,
  );

  return matches;
}

async function waitForAltButtons(
  composer,
  timeout = 6000,
) {
  debug(
    "Waiting for ALT controls...",
  );

  const result =
    await waitFor(
      () => {
        const buttons =
          findAltButtons(
            composer,
          );

        return buttons.length
          ? buttons
          : null;
      },
      timeout,
      100,
    );

  if (!result) {
    debug(
      "Timed out waiting for ALT controls.",
    );

    return [];
  }

  return result;
}

function imageKeyForAltButton(
  composer,
  altButton,
) {
  const images =
    getUploadedImages(
      composer,
    );

  if (!images.length) {
    return null;
  }

  let current =
    altButton.parentElement;

  const scope =
    getComposerScope(
      composer,
    );

  while (
    current &&
    current !== scope
  ) {
    const image =
      current.querySelector(
        "img",
      );

    if (
      image &&
      images.includes(image)
    ) {
      return (
        image.currentSrc ||
        image.src
      );
    }

    current =
      current.parentElement;
  }

  const buttons =
    findAltButtons(
      composer,
    );

  const index =
    buttons.indexOf(
      altButton,
    );

  const image =
    images[index] ||
    images[0];

  if (!image) {
    return null;
  }

  return (
    image.currentSrc ||
    image.src ||
    `image-${index}`
  );
}

// ============================================================
// ALT EDITOR DETECTION
// ============================================================

function scoreAltField(
  field,
  beforeFields,
  postEditor,
) {
  if (!isVisible(field)) {
    return -Infinity;
  }

  if (
    field.closest(
      "[data-tagsafe]",
    )
  ) {
    return -Infinity;
  }

  if (
    field === postEditor
  ) {
    return -Infinity;
  }

  let score = 0;

  const rect =
    field.getBoundingClientRect();

  if (
    !beforeFields.has(field)
  ) {
    score += 50;
  }

  if (
    field.tagName ===
    "TEXTAREA"
  ) {
    score += 30;
  }

  if (
    rect.width >= 250
  ) {
    score += 15;
  }

  if (
    rect.height >= 70
  ) {
    score += 20;
  }

  const meta =
    getElementMeta(field);

  if (
    meta.includes("alt")
  ) {
    score += 30;
  }

  if (
    meta.includes(
      "description",
    )
  ) {
    score += 20;
  }

  return score;
}

function findNewAltField(
  composer,
  beforeFields,
) {
  const postEditor =
    findPostEditor(
      composer,
    );

  /*
   * Bluesky may render the ALT modal through a React portal,
   * so search the whole document.
   */
  const fields = [
    ...document.querySelectorAll(
      'textarea, input, [contenteditable="true"], [role="textbox"]',
    ),
  ];

  let best = null;
  let bestScore =
    -Infinity;

  for (
    const field
    of fields
  ) {
    const score =
      scoreAltField(
        field,
        beforeFields,
        postEditor,
      );

    if (
      score >
      bestScore
    ) {
      best = field;
      bestScore = score;
    }
  }

  debug(
    "Best ALT field:",
    best,
    "score:",
    bestScore,
  );

  return bestScore >= 40
    ? best
    : null;
}

async function openAltEditor(
  composer,
  altButton,
) {
  if (!altButton) {
    return null;
  }

  const beforeFields =
    new Set(
      document.querySelectorAll(
        'textarea, input, [contenteditable="true"], [role="textbox"]',
      ),
    );

  debug(
    "Clicking ALT control:",
    altButton,
  );

  altButton.click();

  const field =
    await waitFor(
      () =>
        findNewAltField(
          composer,
          beforeFields,
        ),
      4000,
      80,
    );

  debug(
    "ALT field found:",
    field,
  );

  return field;
}

// ============================================================
// ALT WRITING
// ============================================================

function updateManagedCWLine(
  existingText,
  cw,
) {
  const text =
    String(
      existingText || "",
    );

  const pattern =
    /^[ \t]*CW:[^\r\n]*/i;

  if (
    pattern.test(text)
  ) {
    return text.replace(
      pattern,
      cw,
    );
  }

  if (!text) {
    return cw;
  }

  return `${cw}\n\n${text}`;
}

function readTextField(field) {
  if (!field) {
    return "";
  }

  if ("value" in field) {
    return field.value || "";
  }

  return (
    field.innerText ||
    field.textContent ||
    ""
  );
}

function setUserLikeText(
  field,
  value,
) {
  if (!field) {
    return false;
  }

  field.focus();

  if ("value" in field) {
    const prototype =
      field.tagName ===
      "TEXTAREA"
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;

    const descriptor =
      Object.getOwnPropertyDescriptor(
        prototype,
        "value",
      );

    if (!descriptor?.set) {
      debug(
        "No native value setter found.",
      );

      return false;
    }

    descriptor.set.call(
      field,
      value,
    );

    field.dispatchEvent(
      new InputEvent(
        "input",
        {
          bubbles: true,
          composed: true,
          inputType:
            "insertText",
          data: value,
        },
      ),
    );

    field.dispatchEvent(
      new Event(
        "change",
        {
          bubbles: true,
        },
      ),
    );

    debug(
      "ALT textarea value after write:",
      field.value,
    );

    return (
      field.value === value
    );
  }

  if (
    field.isContentEditable
  ) {
    const selection =
      window.getSelection();

    if (!selection) {
      return false;
    }

    const range =
      document.createRange();

    range.selectNodeContents(
      field,
    );

    selection.removeAllRanges();
    selection.addRange(range);

    document.execCommand(
      "insertText",
      false,
      value,
    );

    field.dispatchEvent(
      new InputEvent(
        "input",
        {
          bubbles: true,
          inputType:
            "insertText",
        },
      ),
    );

    return (
      readTextField(field) ===
      value
    );
  }

  return false;
}

function findAltOverlay(field) {
  if (!field) {
    return null;
  }

  return (
    field.closest(
      '[role="dialog"]',
    ) ||
    field.closest(
      '[role="alertdialog"]',
    ) ||
    field.closest(
      '[aria-modal="true"]',
    ) ||
    field.parentElement
  );
}

function findAltSaveButton(field) {
  const overlay =
    findAltOverlay(field);

  if (!overlay) {
    return null;
  }

  const fieldRect =
    field.getBoundingClientRect();

  const buttons = [
    ...overlay.querySelectorAll(
      'button, [role="button"]',
    ),
  ].filter(
    (button) =>
      isVisible(button) &&
      !button.closest(
        "[data-tagsafe]",
      ),
  );

  let best = null;
  let bestScore =
    -Infinity;

  for (
    const button
    of buttons
  ) {
    const rect =
      button.getBoundingClientRect();

    const meta =
      getElementMeta(button);

    let score = 0;

    if (
      rect.top >=
      fieldRect.bottom - 10
    ) {
      score += 30;
    }

    if (
      rect.width >= 100
    ) {
      score += 20;
    }

    if (
      rect.height >= 32
    ) {
      score += 10;
    }

    if (
      rect.width < 70 &&
      rect.height < 70
    ) {
      score -= 40;
    }

    if (
      meta === "save" ||
      meta.includes("save")
    ) {
      score += 50;
    }

    if (
      meta === "speichern" ||
      meta.includes(
        "speichern",
      )
    ) {
      score += 50;
    }

    if (
      meta.includes("done")
    ) {
      score += 30;
    }

    if (
      score > bestScore
    ) {
      best = button;
      bestScore = score;
    }
  }

  debug(
    "Likely ALT save button:",
    best,
    "score:",
    bestScore,
  );

  return bestScore >= 20
    ? best
    : null;
}

async function syncAltButton(
  composer,
  altButton,
  imageKey,
  cw,
) {
  /*
   * Store the image/CW combination before opening the editor,
   * because Bluesky may recreate the +ALT button.
   */
  altSyncByImage.set(
    imageKey,
    cw,
  );

  const field =
    await openAltEditor(
      composer,
      altButton,
    );

  if (!field) {
    debug(
      "ALT field not found.",
      imageKey,
    );

    return false;
  }

  const existing =
    readTextField(field);

  const next =
    updateManagedCWLine(
      existing,
      cw,
    );

  debug(
    "Existing ALT:",
    existing,
  );

  debug(
    "New ALT:",
    next,
  );

  const written =
    setUserLikeText(
      field,
      next,
    );

  if (!written) {
    debug(
      "Could not write ALT text.",
    );

    return false;
  }

  await sleep(150);

  const after =
    readTextField(field);

  debug(
    "ALT after write:",
    after,
  );

  if (after !== next) {
    debug(
      "Bluesky did not accept ALT value.",
    );

    return false;
  }

  const saveButton =
    findAltSaveButton(
      field,
    );

  if (!saveButton) {
    debug(
      "ALT save button not found.",
    );

    return false;
  }

  debug("Saving ALT...");

  saveButton.click();

  await waitFor(
    () =>
      !document.contains(
        field,
      ) ||
      !isVisible(field),
    2500,
    80,
  );

  debug(
    "ALT saved:",
    imageKey,
  );

  return true;
}

async function queueAltSync(
  composer,
  force = false,
) {
  if (!autoAltEnabled) {
    return;
  }

  altSyncRequested = true;

  if (force) {
    altSyncForceRequested =
      true;
  }

  if (altSyncRunning) {
    return;
  }

  altSyncRunning = true;

  try {
    while (
      altSyncRequested &&
      autoAltEnabled
    ) {
      const forceThisPass =
        altSyncForceRequested;

      altSyncRequested = false;
      altSyncForceRequested = false;

      await sleep(250);

      if (
        !hasUploadedImage(
          composer,
        )
      ) {
        debug(
          "No uploaded image detected.",
        );

        continue;
      }

      const buttons =
        await waitForAltButtons(
          composer,
          5000,
        );

      if (!buttons.length) {
        debug(
          "No ALT controls available.",
        );

        continue;
      }

      const cw =
        buildCWLine();

      for (
        const button
        of buttons
      ) {
        if (!autoAltEnabled) {
          break;
        }

        if (
          !document.contains(
            button,
          )
        ) {
          continue;
        }

        const imageKey =
          imageKeyForAltButton(
            composer,
            button,
          );

        if (!imageKey) {
          debug(
            "Could not determine image key.",
          );

          continue;
        }

        const previous =
          altSyncByImage.get(
            imageKey,
          );

        if (
          !forceThisPass &&
          previous === cw
        ) {
          debug(
            "Image already processed:",
            imageKey,
          );

          continue;
        }

        debug(
          "Synchronizing image:",
          imageKey,
        );

        await syncAltButton(
          composer,
          button,
          imageKey,
          cw,
        );

        await sleep(250);
      }
    }
  } catch (error) {
    console.error(
      "[TagSafe] ALT sync error:",
      error,
    );
  } finally {
    altSyncRunning = false;
  }
}

// ============================================================
// UI HELPERS
// ============================================================

function updateSaveButton(
  saveButton,
) {
  const saved =
    sameTags(
      [...selectedTags],
      defaultTags,
    );

  saveButton.textContent =
    saved
      ? "✓ Saved as default"
      : "Save current as default";

  saveButton.dataset.saved =
    String(saved);
}

function updateAutoAltButton(
  button,
) {
  button.textContent =
    autoAltEnabled
      ? "ALT tags: On"
      : "ALT tags: Off";

  button.setAttribute(
    "aria-pressed",
    String(autoAltEnabled),
  );
}

function updatePostCWButton(
  button,
) {
  button.textContent =
    postCWEnabled
      ? "Post tags: On"
      : "Post tags: Off";

  button.setAttribute(
    "aria-pressed",
    String(postCWEnabled),
  );
}

function renderTags(
  tagContainer,
  preview,
  composer,
  saveButton,
) {
  tagContainer.replaceChildren();

  for (
    const group
    of tagGroups
  ) {
    const section =
      document.createElement(
        "div",
      );

    section.className =
      "tagsafe-tag-group";

    const heading =
      document.createElement(
        "div",
      );

    heading.className =
      "tagsafe-tag-group-title";

    heading.textContent =
      group.name;

    const buttons =
      document.createElement(
        "div",
      );

    buttons.className =
      "tagsafe-tag-group-buttons";

    for (
      const tag
      of group.tags
    ) {
      const button =
        document.createElement(
          "button",
        );

      button.type = "button";
      button.className =
        "tagsafe-tag";

      button.textContent =
        toHashtag(tag);

      button.setAttribute(
        "aria-pressed",
        String(
          selectedTags.has(tag),
        ),
      );

      button.addEventListener(
        "click",
        (event) => {
          event.preventDefault();
          event.stopPropagation();

          toggleTag(tag);

          renderTags(
            tagContainer,
            preview,
            composer,
            saveButton,
          );

          if (postCWEnabled) {
            updateCWInPost(
              composer,
            );
          }

          if (autoAltEnabled) {
            queueAltSync(
              composer,
            );
          }
        },
      );

      buttons.appendChild(
        button,
      );
    }

    section.appendChild(
      heading,
    );

    section.appendChild(
      buttons,
    );

    tagContainer.appendChild(
      section,
    );
  }

  preview.textContent =
    buildCWLine();

  updateSaveButton(
    saveButton,
  );
}

function createPresetSelect(
  tagContainer,
  preview,
  composer,
  saveButton,
) {
  const select =
    document.createElement(
      "select",
    );

  select.className =
    "tagsafe-presets";

  const placeholder =
    document.createElement(
      "option",
    );

  placeholder.value = "";
  placeholder.textContent =
    "Choose preset…";

  placeholder.disabled = true;
  placeholder.selected = true;

  select.appendChild(
    placeholder,
  );

  for (
    const preset
    of presets
  ) {
    const option =
      document.createElement(
        "option",
      );

    option.value =
      preset.name;

    option.textContent =
      preset.name;

    select.appendChild(option);
  }

  select.addEventListener(
    "change",
    () => {
      const preset =
        presets.find(
          (item) =>
            item.name ===
            select.value,
        );

      if (!preset) {
        return;
      }

      selectedTags =
        new Set(
          preset.tags.filter(
            (tag) =>
              tags.includes(tag),
          ),
        );

      if (!selectedTags.size) {
        selectedTags.add(
          tags[0],
        );
      }

      /*
       * Resolve conflicts in preset order.
       */
      for (
        const tag
        of [...selectedTags]
      ) {
        applyConflicts(tag);
      }

      renderTags(
        tagContainer,
        preview,
        composer,
        saveButton,
      );

      if (postCWEnabled) {
        updateCWInPost(
          composer,
        );
      }

      if (autoAltEnabled) {
        queueAltSync(
          composer,
        );
      }
    },
  );

  return select;
}

function rebuildTagSafeUI(
  updatePost = false,
) {
  const composer =
    findComposer();

  if (!composer) {
    return;
  }

  const existingPanel =
    composer.querySelector(
      "[data-tagsafe]",
    );

  if (existingPanel) {
    existingPanel.remove();
  }

  addTagSafe(
    composer,
    updatePost,
  );
}

function createSettingsControls() {
  const wrap =
    document.createElement(
      "div",
    );

  wrap.className =
    "tagsafe-settings-wrap";

  const toggle =
    document.createElement(
      "button",
    );

  toggle.type = "button";
  toggle.className =
    "tagsafe-settings-toggle";

  toggle.textContent =
    "⚙ Settings";

  toggle.setAttribute(
    "aria-expanded",
    "false",
  );

  const row =
    document.createElement(
      "div",
    );

  row.className =
    "tagsafe-settings-row";

  row.hidden = true;

  const importButton =
    document.createElement(
      "button",
    );

  importButton.type =
    "button";

  importButton.className =
    "tagsafe-settings-button";

  importButton.textContent =
    "Import settings";

  const exportButton =
    document.createElement(
      "button",
    );

  exportButton.type =
    "button";

  exportButton.className =
    "tagsafe-settings-button";

  exportButton.textContent =
    "Export settings";

  const resetButton =
    document.createElement(
      "button",
    );

  resetButton.type =
    "button";

  resetButton.className =
    "tagsafe-settings-button";

  resetButton.textContent =
    "Reset";

  toggle.addEventListener(
    "click",
    (event) => {
      event.preventDefault();
      event.stopPropagation();

      row.hidden =
        !row.hidden;

      toggle.setAttribute(
        "aria-expanded",
        String(!row.hidden),
      );
    },
  );

  exportButton.addEventListener(
    "click",
    (event) => {
      event.preventDefault();
      event.stopPropagation();

      downloadSettingsFile();
    },
  );

  importButton.addEventListener(
    "click",
    (event) => {
      event.preventDefault();
      event.stopPropagation();

      chooseSettingsFile(
        () => {
          rebuildTagSafeUI(
            false,
          );
        },
      );
    },
  );

  resetButton.addEventListener(
    "click",
    async (event) => {
      event.preventDefault();
      event.stopPropagation();

      const confirmed =
        confirm(
          "Reset TagSafe tags, defaults, presets and conflicts to the built-in settings?",
        );

      if (!confirmed) {
        return;
      }

      await resetSettings();

      rebuildTagSafeUI(
        false,
      );
    },
  );

  row.appendChild(
    importButton,
  );

  row.appendChild(
    exportButton,
  );

  row.appendChild(
    resetButton,
  );

  wrap.appendChild(toggle);
  wrap.appendChild(row);

  return wrap;
}

// ============================================================
// TAGSAFE UI
// ============================================================

function addTagSafe(
  composer,
  updatePost = true,
) {
  if (
    !composer ||
    composer.querySelector(
      "[data-tagsafe]",
    )
  ) {
    return;
  }

  const panel =
    document.createElement(
      "div",
    );

  panel.dataset.tagsafe =
    "true";

  panel.className =
    "tagsafe-panel";

  panel.dataset.theme =
    detectComposerTheme();

  const header =
    document.createElement(
      "div",
    );

  header.className =
    "tagsafe-header";

  const title =
    document.createElement(
      "div",
    );

  title.className =
    "tagsafe-title";

  title.textContent =
    "CW tags";

  const tagContainer =
    document.createElement(
      "div",
    );

  tagContainer.className =
    "tagsafe-tags";

  const preview =
    document.createElement(
      "div",
    );

  preview.className =
    "tagsafe-preview";

  const saveButton =
    document.createElement(
      "button",
    );

  saveButton.type =
    "button";

  saveButton.className =
    "tagsafe-save";

  saveButton.addEventListener(
    "click",
    async (event) => {
      event.preventDefault();
      event.stopPropagation();

      defaultTags =
        [...selectedTags];

      await saveStorage({
        defaultTags,
      });

      updateSaveButton(
        saveButton,
      );
    },
  );

  // ----------------------------------------------------------
  // POST TAGS TOGGLE
  // ----------------------------------------------------------

  const postCWButton =
    document.createElement(
      "button",
    );

  postCWButton.type =
    "button";

  postCWButton.className =
    "tagsafe-post-cw";

  updatePostCWButton(
    postCWButton,
  );

  postCWButton.addEventListener(
    "click",
    async (event) => {
      event.preventDefault();
      event.stopPropagation();

      postCWEnabled =
        !postCWEnabled;

      await saveStorage({
        postCWEnabled,
      });

      updatePostCWButton(
        postCWButton,
      );

      if (postCWEnabled) {
        updateCWInPost(
          composer,
        );
      } else {
        removeCWFromPost(
          composer,
        );
      }
    },
  );

  // ----------------------------------------------------------
  // ALT TAGS TOGGLE
  // ----------------------------------------------------------

  const autoAltButton =
    document.createElement(
      "button",
    );

  autoAltButton.type =
    "button";

  autoAltButton.className =
    "tagsafe-auto-alt";

  updateAutoAltButton(
    autoAltButton,
  );

  autoAltButton.addEventListener(
    "click",
    async (event) => {
      event.preventDefault();
      event.stopPropagation();

      autoAltEnabled =
        !autoAltEnabled;

      await saveStorage({
        autoAltEnabled,
      });

      updateAutoAltButton(
        autoAltButton,
      );

      debug(
        "Auto ALT:",
        autoAltEnabled
          ? "Enabled"
          : "Disabled",
      );

      if (autoAltEnabled) {
        queueAltSync(
          composer,
          true,
        );
      }
    },
  );

  const presetSelect =
    createPresetSelect(
      tagContainer,
      preview,
      composer,
      saveButton,
    );

  const settingsControls =
    createSettingsControls();

  header.appendChild(title);

  header.appendChild(
    presetSelect,
  );

  panel.appendChild(header);

  panel.appendChild(
    tagContainer,
  );

  panel.appendChild(preview);

  panel.appendChild(
    saveButton,
  );

  panel.appendChild(
    postCWButton,
  );

  panel.appendChild(
    autoAltButton,
  );

  panel.appendChild(
    settingsControls,
  );

  const toolbar =
    findComposerToolbar(
      composer,
    );

  if (toolbar) {
    const insertion =
      findVerticalInsertionPoint(
        toolbar,
        composer,
      );

    if (
      insertion.parent &&
      insertion.before
    ) {
      insertion.parent.insertBefore(
        panel,
        insertion.before,
      );
    } else {
      composer.appendChild(
        panel,
      );
    }
  } else {
    composer.appendChild(
      panel,
    );
  }

  renderTags(
    tagContainer,
    preview,
    composer,
    saveButton,
  );

  if (
    updatePost &&
    postCWEnabled
  ) {
    updateCWInPost(
      composer,
      true,
    );
  }
}

// ============================================================
// SCANNING
// ============================================================

function scan() {
  const composer =
    findComposer();

  if (!composer) {
    /*
     * No active composer means image identities from the
     * previous composer session are no longer useful.
     */
    altSyncByImage.clear();
    return;
  }

  /*
   * Bluesky can briefly expose an incomplete layout during a
   * React render. If TagSafe was inserted into a page-wide
   * container during that moment, remove it and retry.
   */
  const existingPanel =
    composer.querySelector(
      "[data-tagsafe]",
    ) ||
    document.querySelector(
      "[data-tagsafe]",
    );

  if (existingPanel) {
    if (
      !isTagSafePlacementValid(
        existingPanel,
        composer,
      )
    ) {
      debug(
        "Invalid TagSafe placement detected. Rebuilding.",
      );

      existingPanel.remove();

      /*
       * Do not immediately rebuild in the same unstable
       * layout. Give Bluesky a little time to settle.
       */
      setTimeout(() => {
        scheduleScan();
      }, 200);

      return;
    }
  } else {
    addTagSafe(composer);
  }

  if (
    autoAltEnabled &&
    hasUploadedImage(
      composer,
    )
  ) {
    debug(
      "Image detected, starting ALT sync",
    );

    queueAltSync(
      composer,
    );
  }
}

// ============================================================
// MUTATION OBSERVER
// ============================================================

let scanTimer = null;

function scheduleScan() {
  clearTimeout(scanTimer);

  scanTimer =
    setTimeout(
      scan,
      120,
    );
}

// ============================================================
// STARTUP
// ============================================================

async function startTagSafe() {
  await loadSettings();

  const observer =
    new MutationObserver(
      scheduleScan,
    );

  observer.observe(
    document.documentElement,
    {
      childList: true,
      subtree: true,
    },
  );

  /*
   * Give Bluesky a short moment to finish its initial React
   * composer layout before calculating TagSafe's placement.
   */
  setTimeout(
    scan,
    250,
  );
}

startTagSafe();