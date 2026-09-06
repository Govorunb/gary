# Dashboard mockups

`dashboard.html` is a static mockup of the 1.0 dashboard. Open it in a
browser and set attributes on the `<html>` element to switch states:

| Attribute | Values | Effect |
|---|---|---|
| `data-theme` | `dark`, `light` | Theme |
| `data-state` | `stopped` | Engine stopped notice under the top bar, resume button red |
| `data-left` | `c` | Left column collapsed to a rail |
| `data-right` | `c` | Right column collapsed to a rail |
| `data-open` | `left`, `right` | Drawer open (only below 1024px wide) |
| `data-chat` | `open` | Chat input expanded |
| `data-tip` | present | Chat teaching tooltip shown |

The PNGs are renders of the states above at 1600x900, except the narrow
drawer at 960x900. Regenerate with headless Chromium:

```sh
chrome --headless=new --hide-scrollbars --window-size=1600,900 \
  --screenshot=out.png file:///path/to/dashboard.html
```
