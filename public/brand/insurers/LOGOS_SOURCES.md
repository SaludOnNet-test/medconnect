# Insurer Logo Sources

Each SVG in this directory is the official wordmark/logo of the corresponding insurer. The files are used purely for editorial / informational purposes (showing which insurances are accepted at partner clinics). Trademark rights remain with their respective owners.

| File | Status | Source | License / Notes |
|---|---|---|---|
| `axa.svg` | replaced | https://commons.wikimedia.org/wiki/File:AXA_Logo.svg (raw: https://upload.wikimedia.org/wikipedia/commons/9/94/AXA_Logo.svg) | Public domain on Commons (below threshold of originality); trademark of AXA Group. |
| `mapfre.svg` | replaced | https://commons.wikimedia.org/wiki/File:Logo_Mapfre_2026.svg (raw: https://upload.wikimedia.org/wikipedia/commons/4/48/Logo_Mapfre_2026.svg) | Public domain on Commons (below threshold of originality); trademark of MAPFRE S.A. Sourced from mapfre.com. |
| `dkv.svg` | replaced | https://commons.wikimedia.org/wiki/File:DKV_(Versicherung)_logo.svg (raw: https://upload.wikimedia.org/wikipedia/commons/2/2c/DKV_%28Versicherung%29_logo.svg) | Public domain on Commons (below threshold of originality); trademark of DKV Deutsche Krankenversicherung AG / DKV Seguros (Munich Re Group). |
| `sanitas.svg` | replaced | https://www.sanitas.es/media/smay/imagen/svg_logosanitas_2023/logo-container.svg | Logo served directly from sanitas.es; trademark of Sanitas S.A. de Seguros (Bupa). Editorial use. |
| `cigna.svg` | MANUAL | https://upload.wikimedia.org/wikipedia/en/5/5f/Cigna_logo.svg (linked from https://en.wikipedia.org/wiki/Cigna) | Placeholder kept. The English Wikipedia file is non-free / fair-use only — the agent's automated fetch ended up not committing it. Download the SVG manually if your usage qualifies as editorial fair use. Trademark of The Cigna Group. |
| `adeslas.svg` | MANUAL | Direct asset URL: https://www.segurcaixaadeslas.es/_layouts/15/1033/styles/images/sca/adeslasn3.svg (returns 403 to non-browser user agents) | Placeholder kept. To replace: open the URL in a browser and save the SVG, or grab from the corporate press kit at https://www.segurcaixaadeslas.es/en/press-room/multimedia-gallery. Trademark of SegurCaixa Adeslas / Mutua Madrileña + VidaCaixa. |
| `asisa.svg` | MANUAL | Brand page: https://www.asisa.es/marca (only PNG via Adobe Dynamic Media: `/adobe/dynamicmedia/deliver/dm-aid--31a37b17-b05d-4f40-9f3f-0474b3f1aec2/cabecera-logo.png`); third-party SVG mirrors at https://brandfetch.com/asisa.es and https://worldvectorlogo.com/logo/asisa | Placeholder kept. ASISA does not expose an SVG on their public site, and there is no logo on Wikimedia Commons. To replace: download from the corporate brand page (request the manual de identidad) or from a vector-logo aggregator. Trademark of ASISA — Asistencia Sanitaria Interprovincial de Seguros, S.A.U. |

## Rendering notes

The strip is rendered via `<Image src="/brand/insurers/<slug>.svg" width={100} height={24}>` in `src/app/page.js`. The CSS rule `.home-insurer-logo { height: 24px; width: auto; }` in `src/app/home.css` lets each logo keep its native aspect ratio (so wide wordmarks like Mapfre render wider than the square AXA mark).

The AXA logo is a square mark + wordmark (1:1 viewBox 283×283) and will therefore render as a 24×24 square on the strip — narrower than the others. If you prefer the horizontal "AXA + tagline" mark, replace it from https://commons.wikimedia.org/wiki/File:AXA_Logo_EN.svg manually.
