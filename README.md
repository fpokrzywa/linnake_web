# Linnake website

Responsive, buildless marketing website. The complete deployable site is in `dist/`. No package installation or build step is required.

## Preview

Run `python -m http.server 4173 --bind 127.0.0.1 --directory dist` from this directory and open http://127.0.0.1:4173.

## Contact behavior

The inquiry form validates locally, then opens an email draft. It does not store leads or claim that a message was sent. A clipboard fallback is provided. The current destination is the existing verified ModelForge team address, contact@modelforge.studio. To change it, update `CONTACT_EMAIL` in `dist/app.js` and the visible address/disclosure in `dist/index.html`.

## Content boundaries

The user authorized positioning Linnake as the unified product incorporating all ModelForge capabilities plus continuous fine-tuning, and enterprise agreements for customizable local LLMs on compatible employee laptops and desktops. Training hardware is distinguished from inference hardware. The unavailable architecture plan has not been used to assert scheduling, automatic deployment, certifications, launch dates, or performance results.

The workspace and laptop illustrations are labeled concepts. No backend model functionality is represented as working in this marketing site. Pricing and availability are inquiry topics rather than invented plans. The original supplied crest is used unchanged; the second supplied brand image is retained in assets as source material.

## Deployment

Sites project identity is in `.openai/hosting.json`. Deploy the static `dist` directory. The first hosted version is owner-private for review. Custom domains and public access have not been configured.
