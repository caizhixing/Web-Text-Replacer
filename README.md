# Web Text Replacer

A Manifest V3 Chrome extension that replaces webpage text using a local flat key-value mapping.

## Install

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose **Load unpacked** and select this folder.

## Use

Open the extension popup, choose a mapping file or paste a flat object such as:

```text
{
  "Hello": "Bonjour",
  "Welcome": "Bienvenue"
}
```

Click **Apply replacements**. The extension applies the mapping to the active page, including same-origin and cross-origin frames, and to future dynamically added content. The current file picker accepts local flat mapping files in the supported object format; pasted mapping data uses the same format. If the active page is a restricted Chrome page, open a normal `http` or `https` website instead. Script, style, form-control, code, preformatted, and editable content is excluded.

Turn on **Limit to matching URLs** to enable URL filtering. The URL pattern field is shown only while filtering is enabled. Enter one pattern per line or separate patterns with commas. `*` matches any characters. Patterns are checked against the current URL, hostname, path, and hash. For example, `*ntba.gte666*` activates the mapping on the `ntba.gte666.com` site.

Turning the switch off hides the pattern field and disables URL filtering; existing patterns remain saved for the next time filtering is enabled.
